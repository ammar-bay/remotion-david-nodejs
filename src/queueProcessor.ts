import AWS from 'aws-sdk';
import { generateCaptions, generateVideo, logToCloudWatch } from './utils';
let pRetry: any;

const loadPRetry = async () => {
  if (!pRetry) {
    pRetry = (await import('p-retry')).default;
  }
};
import { RequestBody } from './types';

const sqs = new AWS.SQS({
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

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

  while (true) {
    try {
      const data = await sqs.receiveMessage(params).promise();
      if (data.Messages && data.Messages.length > 0) {
        const message = data.Messages[0];
        const body: RequestBody = JSON.parse(message.Body || '{}');

        // Process the message
        await processMessageWithRetry(body);

        // Delete the message from the queue
        await sqs.deleteMessage({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle!,
        }).promise();
      }
    } catch (error) {
      console.error("Error processing queue: ", error);
    }
  }
}

const processMessageWithRetry = async (body: RequestBody) => {
  await loadPRetry(); // Ensure pRetry is loaded before use
  await pRetry(() => processMessage(body), {
    onFailedAttempt: (error: any) => {
      logToCloudWatch(`Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
    },
    retries: 5
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
  }
}

(async () => {
  await processQueue();
})();
