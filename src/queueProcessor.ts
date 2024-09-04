import AWS from 'aws-sdk';
import { generateCaptions, generateVideo, logToCloudWatch } from './utils';
import pRetry from 'p-retry';
import { RequestBody } from './types';

const sqs = new AWS.SQS({ region: process.env.SQS_AWS_DEFAULT_REGION });

const processQueue = async () => {
  const params = {
    QueueUrl: process.env.SQS_QUEUE_URL,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
  };

  while (true) {
    try {
      const data = await sqs.receiveMessage(params).promise();
      if (data.Messages && data.Messages.length > 0) {
        const message = data.Messages[0];
        const body: RequestBody = JSON.parse(message.Body);

        // Process the message
        await processMessageWithRetry(body);

        // Delete the message from the queue
        await sqs.deleteMessage({
          QueueUrl: process.env.SQS_QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle!,
        }).promise();
      }
    } catch (error) {
      console.error("Error processing queue: ", error);
    }
  }
}

const processMessageWithRetry = async (body: RequestBody) => {
  await pRetry(() => processMessage(body), {
    onFailedAttempt: error => {
      logToCloudWatch(`Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
    },
    retries: 5
  });
};
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
};

processQueue();
