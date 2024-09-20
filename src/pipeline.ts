import { RequestBody } from "./types";
import { generateVideo, sqs } from "./utils";
import { connectToDatabase } from "./utils";
import { processVideoBatch, getS3KeyFromUrl } from "./s3Utils";

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

    // Process and upload all videos to S3 in batches
    const s3Files: string[] = [];
    const batchSize = 6;
    const processedScenes: RequestBody['scenes'] = [];

    for (let i = 0; i < body.scenes.length; i += batchSize) {
      const batch = body.scenes.slice(i, i + batchSize).map((scene, index) => ({
        videoUrl: scene.videoUrl,
        videoId: body.videoId,
        fileCounter: i + index + 1
      }));

      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}`);
      const processedBatch = await processVideoBatch(batch);

      processedBatch.forEach((newVideoUrl, index) => {
        console.log(`Processed video URL: ${newVideoUrl}`);
        s3Files.push(getS3KeyFromUrl(newVideoUrl));
        processedScenes.push({ ...body.scenes[i + index], videoUrl: newVideoUrl });
      });
    }

    // Update the body with processed scenes
    body.scenes = processedScenes;
    console.log('Processed scenes:', JSON.stringify(body.scenes, null, 2));

    // Insert the message into MongoDB with S3 file information
    await collection.insertOne({ 
      videoId: body.videoId, 
      status: 'processing',
      s3Files: s3Files
    });
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
