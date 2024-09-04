import { RequestBody } from "./types";
import { processMessageWithRetry } from "./queueProcessor";
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
    await sqs.sendMessage(params).promise();
    console.log(`Message sent to SQS for videoId: ${body.videoId}`);

    // Process the message
    await processMessageWithRetry(body);
  } catch (error) {
    console.error("Error in request pipeline: ", error);
    throw error;
  }
};
