import AWS from 'aws-sdk';
import { generateCaptions, generateVideo } from './utils';
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
        await processMessage(body);

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
};

processQueue();
