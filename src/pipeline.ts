import { RequestBody } from "./types";
import { generateVideo, sqs } from "./utils";
import { connectToDatabase } from "./utils";

export const processRequestPipeline = async (body: RequestBody) => {
  try {
    // Connect to MongoDB
    const db = await connectToDatabase();
    const collection = db.collection('promotion_video_render');

    // Check the number of ongoing renders
    const ongoingRenders = await collection.countDocuments();
    if (ongoingRenders >= 1) { // Assuming concurrency limit is 1
      console.log("Concurrency limit reached, cannot process new request.");
      const queueUrl = process.env.SQS_QUEUE_URL;
      if (!queueUrl) {
        console.error("SQS_QUEUE_URL is not defined in the environment variables");
        return;
      }

      const params = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(body),
      };

      try {
        await sqs.sendMessage(params).promise();
        console.log(`Request for videoId: ${body.videoId} sent to SQS for future processing.`);
      } catch (error) {
        console.error("Error sending message to SQS: ", error);
      }
      return;
    }

    // Insert the message into MongoDB
    await collection.insertOne({ videoId: body.videoId, status: 'processing' });
    console.log(`Inserted videoId: ${body.videoId} into MongoDB`);

    // Send the job to Lambda
    const result = await generateVideo(body);
    if (result) {
      console.log(`Video rendering started for videoId: ${body.videoId}`);
    } else {
      console.error(`Failed to start video rendering for videoId: ${body.videoId}`);
    }
  } catch (error) {
    console.error("Error in request pipeline: ", error);
    throw error;
  }
};
