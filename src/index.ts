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
import { RequestBody, Scene } from "./types";
import { generateCaptions, generateVideo } from "./utils";
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

    res.status(200).send("Video generation request queued");

    let scenes: Scene[] = [];

    try {
      
      if (body.caption) scenes = await generateCaptions(body.scenes);
      else scenes = body.scenes;

      await generateVideo({
        ...body,
        scenes,
      });
    } catch (error: any) {
      await axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
        type: "error",
        errors: {
          message:
            "Error occurred while downloading the audio: " + error.message,
        },
      });
    }
  }
);

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
