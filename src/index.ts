import {
  downloadWhisperModel,
  installWhisperCpp,
} from "@remotion/install-whisper-cpp";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import validateScene from "./middleware";
import { RequestBody } from "./types";
import { queueProcessor } from "./utils";

dotenv.config();

const app = express();
const PORT: number = parseInt(process.env.PORT as string, 10) || 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response) => {
  res.send("Server is up and running :)");
});

app.post("/generate-video", validateScene, (req: Request, res: Response) => {
  queueProcessor.addToQueue(req.body as RequestBody);
  res.status(200).send("Video generation request queued");
});

app.post("/webhook", async (req: Request, res: Response) => {
  console.log("WEBHOOK: ", req.body);
  res.status(200).send("Webhook received");
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

const server = app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await installWhisperCpp({
    to: path.join(process.cwd(), "whisper.cpp"),
    version: "1.5.5",
  });

  await downloadWhisperModel({
    model: "medium.en",
    folder: path.join(process.cwd(), "whisper.cpp"),
  });
});

server.setTimeout(600000);
