import dotenv from "dotenv";
dotenv.config();
import { downloadWhisperModel, installWhisperCpp } from "@remotion/install-whisper-cpp";
import bodyParser from "body-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import AWS from "aws-sdk";
import validateScene from "./middleware";

const sqs = new AWS.SQS({
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
import { RequestBody, Scene } from "./types";
import { generateCaptions, generateVideo, pendingJobs, processQueue } from "./utils";
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

    const queueUrl = process.env.SQS_QUEUE_URL;
    if (!queueUrl) {
      return res.status(500).send("SQS_QUEUE_URL is not defined in the environment variables");
    }

    const params = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    };

    try {
      await sqs.sendMessage(params).promise();
      console.log(`Message sent to SQS for videoId: ${body.videoId}`);
      res.status(200).send("Video generation request queued");
    } catch (error) {
      console.error("Error sending message to SQS: ", error);
      res.status(500).send("Error queuing request");
    }
  }
);

app.post("/webhook", async (req: Request, res: Response) => {
  console.log("Webhook endpoint called with data: ", req.body);
  const { videoId } = req.body;

  console.log(`Removing job with videoId: ${videoId} from pending jobs.`);
  pendingJobs.delete(videoId);

  res.status(200).send("Webhook received");
  console.log("Response sent to webhook caller.");

  console.log("Starting to process the next message in the queue.");
  await processQueue();
  console.log("Finished processing the next message in the queue.");
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

const server = app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
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
