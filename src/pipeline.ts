import { RequestBody } from "./types";
import { sqs } from "./utils";

export const processRequestPipeline = async (body: RequestBody) => {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("SQS_QUEUE_URL is not defined in the environment variables");
  }

  const params = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(body),
  };

  try {
    const result = await sqs.sendMessage(params).promise();
    if (result.MessageId) {
      console.log(`Message sent to SQS for videoId: ${body.videoId}`);
      // Add logic to process the message, e.g., interact with Lambda or MongoDB
    } else {
      console.error(`Failed to send message to SQS for videoId: ${body.videoId}`);
    }
  } catch (error) {
    console.error("Error in request pipeline: ", error);
    throw error;
  }
};
