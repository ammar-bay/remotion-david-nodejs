import dotenv from "dotenv";
dotenv.config();
import { downloadWhisperModel, installWhisperCpp } from "@remotion/install-whisper-cpp";
import bodyParser from "body-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import AWS from "aws-sdk";
import { validateScene, handleRenderCompletion } from "./middleware";

const sqs = new AWS.SQS({
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
import { RequestBody, Scene } from "./types";
import { connectToDatabase, checkAndProcessQueue, processCaptionQueue } from "./utils";
import { processRequestPipeline } from "./pipeline";
import axios from "axios";

dotenv.config();

const app = express();
const PORT: number = parseInt(process.env.PORT as string, 10) || 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response) => {
  res.send("Server is up and running :)");
});

app.post(
  "/generate-video",
  validateScene,
  async (req: Request, res: Response) => {
    const body: RequestBody = req.body;

    if (body.scenes.length === 0) {
      return res.status(400).send("No scenes provided");
    }

    const captionQueueUrl = process.env.SQS_CAPTION_QUEUE_URL;
    const lambdaQueueUrl = process.env.SQS_QUEUE_URL;

    if (!captionQueueUrl || !lambdaQueueUrl) {
      return res.status(500).send("SQS_QUEUE_URLs are not defined in the environment variables");
    }

    try {
      if (body.caption) {
        // Send to caption queue
        const params = {
          QueueUrl: captionQueueUrl,
          MessageBody: JSON.stringify(body),
        };
        await sqs.sendMessage(params).promise();
        console.log(`Request for videoId: ${body.videoId} sent to Caption SQS for processing.`);
      } else {
        // Directly process the request for Lambda
        await processRequestPipeline(body);
      }
      res.status(200).send("Video generation request processed");
    } catch (error) {
      console.error("Error processing request: ", error);
      res.status(500).send("Error processing request");
    }
  }
);

app.post("/webhook", handleRenderCompletion, async (req: Request, res: Response) => {
  console.log("Webhook endpoint called with data: ", req.body);
  const { videoId } = req.body;


  res.status(200).send("Webhook received");
  console.log("Response sent to webhook caller.");

  console.log("Starting to process the next message in the queue.");
  await processRequestPipeline(req.body);
  console.log("Finished processing the next message in the queue.");
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

let isProcessingQueue = false;

const server = app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Start processing the queues
  processCaptionQueue();
  console.log("Starting normal queue processing");
  processQueue();

  //   await installWhisperCpp({
  //     to: path.join(process.cwd(), "whisper.cpp"),
  //     version: "1.5.5",
  //   });
  //
  //   await downloadWhisperModel({
  //     model: "medium.en",
  //     folder: path.join(process.cwd(), "whisper.cpp"),
  //   });
});

server.setTimeout(600000);
let isProcessQueueRunning = false;
export const processQueue = async () => {
  if (isProcessQueueRunning) {
    console.log("processQueue is already running.");
    return;
  }
  isProcessQueueRunning = true;
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("SQS_QUEUE_URL is not defined in the environment variables");
  }

  const logQueueAttributes = async () => {
    try {
      const attributes = await sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
      }).promise();
      console.log("SQS Queue Attributes: ", attributes.Attributes);
    } catch (error) {
      console.error("Error fetching SQS queue attributes: ", error);
    }
  };

  let backoffDelay = 1000; // Start with a 1-second delay
  const maxBackoffDelay = 30000; // Maximum backoff delay of 30 seconds

  const params = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
  };

  console.log("Starting processQueue loop");
  while (true) {
    console.log("Checking for messages in the queue...");

    try {
      await logQueueAttributes();
      const data = await sqs.receiveMessage(params).promise();
      if (data.Messages && data.Messages.length > 0) {
        const message = data.Messages[0];
        console.log("Received message from SQS: ", message);
        const body: RequestBody = JSON.parse(message.Body || '{}');
        console.log(`Processing message for videoId: ${body.videoId}`);

        console.log(`Processing message from SQS for videoId: ${body.videoId}`);

        try {
          // Process the message
          await processRequestPipeline(body);

          // Delete the message from the queue
          await sqs.deleteMessage({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle!,
          }).promise();
          // Reset backoff delay after successful processing
          backoffDelay = 5000;
        } catch (error) {
          // If processing fails, increase the backoff delay
          backoffDelay = Math.min(backoffDelay * 2, maxBackoffDelay);
          console.error(`Error processing message for videoId: ${body.videoId}`, error);
          console.log(`Increasing backoff delay to ${backoffDelay / 1000} seconds.`);
          console.error(`Error processing message for videoId: ${body.videoId}`, error);
        }
      } else {
        // If no messages are received, increase the backoff delay by 1 second every minute
        if (backoffDelay < maxBackoffDelay) {
          backoffDelay += 1000; // Increase by 1 second
        }
        console.log(`No messages received. Increasing backoff delay to ${backoffDelay / 1000} seconds.`);
        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for 1 minute before checking again
      }
    } catch (error) {
      console.error("Error processing queue: ", error);
    }
  }
}
