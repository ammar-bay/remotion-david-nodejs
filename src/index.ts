import dotenv from "dotenv"; // Load environment variables from .env file
dotenv.config();
import express, { Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { RequestBody } from "./types";
import { downloadAndConvertAudio, generateVideo } from "./utils";
import path from "path";
import {
  convertToCaptions,
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
} from "@remotion/install-whisper-cpp";

const app = express();
const PORT: number = parseInt(process.env.PORT as string, 10) || 3000;

// Middleware
app.use(cors()); // Enable CORS
app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Routes
app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

app.post("/generate-video", async (req: Request, res: Response) => {
  const body: RequestBody = req.body;
  const { alreadyExisted: whisperAlreadyExisted } = await installWhisperCpp({
    to: path.join(process.cwd(), "whisper.cpp"),
    version: "1.5.5", // A Whisper.cpp semver or git tag
  });

  console.log("Whisper already existed: ", whisperAlreadyExisted);

  const { alreadyExisted: modelAlreadyExisted } = await downloadWhisperModel({
    model: "medium.en",
    folder: path.join(process.cwd(), "whisper.cpp"),
  });
  

  console.log("Model already existed: ", modelAlreadyExisted);

  // create 16KHz wav file from audio url
  const filePath = await downloadAndConvertAudio(req.body.scenes[0].audio);

  if (!filePath) {
    res.status(500).send("Error downloading the audio file");
    return;
  }

  const { transcription } = await transcribe({
    inputPath: filePath,
    whisperPath: path.join(process.cwd(), "whisper.cpp"),
    model: "medium.en",
    tokenLevelTimestamps: true,
  });

  // for (const token of transcription) {
  //   console.log(token.timestamps.from, token.timestamps.to, token.text);
  // }

  const { captions } = convertToCaptions({
    transcription,
    combineTokensWithinMilliseconds: 200,
  });

  for (const line of captions) {
    console.log(line.text, line.startInSeconds);
  }

  // const data = await generateVideo(body.scenes);
  // const data = {};
  res.status(200).send(captions);
});

app.post("/webhook", async (req: Request, res: Response) => {
  // Handle webhook logic here
  console.log("WEBHOOK: ", req.body);
  res.status(200).send("Webhook received");
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// Starting the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
