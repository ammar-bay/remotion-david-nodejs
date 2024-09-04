import AWS from 'aws-sdk';
import { generateCaptions, generateVideo, logToCloudWatch } from './utils';
import retry from 'retry';
import { RequestBody } from './types';
import { connectToDatabase } from './utils'; // Import the MongoDB connection utility

const sqs = new AWS.SQS({
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const pendingJobs = new Set<string>();
const CONCURRENCY_LIMIT = 2; // Set your concurrency limit here

const processQueue = async () => {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("SQS_QUEUE_URL is not defined in the environment variables");
  }

  const params = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
  };

  try {
    const data = await sqs.receiveMessage(params).promise();
    if (data.Messages && data.Messages.length > 0) {
      const message = data.Messages[0];
      const body: RequestBody = JSON.parse(message.Body || '{}');

      // Check MongoDB for concurrency limit
      const db = await connectToDatabase();
      const collection = db.collection('promotion_video_render');
      const ongoingRenders = await collection.countDocuments();

      if (ongoingRenders < CONCURRENCY_LIMIT) {
        // Add job to pending
        pendingJobs.add(body.videoId);

        // Insert a new entry in MongoDB
        await collection.insertOne({ videoId: body.videoId, status: 'ongoing', timestamp: new Date() });

        // Process the message
        await processMessageWithRetry(body);

        // Delete the message from the queue
        await sqs.deleteMessage({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle!,
        }).promise();
      } else {
        console.log("Concurrency limit reached, waiting for a slot...");
      }
    }
  } catch (error: any) {
    console.error("Error processing queue: ", error);
  }
}

export const processMessageWithRetry = async (body: RequestBody) => {
  const operation = retry.operation({
    retries: 5,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 150000, // 150 seconds
  });

  operation.attempt(async (currentAttempt) => {
    try {
      await processMessage(body);
    } catch (error: any) {
      if (operation.retry(error)) {
        logToCloudWatch(`Attempt ${currentAttempt} failed. There are ${operation.attempts()} retries left.`);
        return;
      }
      console.error("All retry attempts failed.");
      // Remove job from pending if all retries fail
      pendingJobs.delete(body.videoId);
    }
  });
};

const processMessage = async (body: RequestBody) => {
  let scenes = body.scenes;

  try {
    if (body.caption) {
      scenes = await generateCaptions(body.scenes);
    }

    await generateVideo({
      ...body,
      scenes,
    });
  } catch (error) {
    console.error("Error occurred while processing message: ", error);
  } finally {
    // Ensure job is removed from pendingJobs
    pendingJobs.delete(body.videoId);
  }
}

(async () => {
  await processQueue();
})();
