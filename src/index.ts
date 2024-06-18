import {
  convertToCaptions,
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
} from "@remotion/install-whisper-cpp";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import validateScene from "./middleware";
import { RequestBody, Scene, requestBodySchema } from "./types";
import { checkHealth, downloadAndConvertAudio, generateVideo } from "./utils";
import pLimit from "p-limit";
import os from "os";
import axios from "axios";
dotenv.config();

const app = express();
const PORT: number = parseInt(process.env.PORT as string, 10) || 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

app.get("/health", (req: Request, res: Response) => {
  checkHealth();
  res.send("OK");
});

app.post(
  "/generate-video",
  validateScene,
  async (req: Request, res: Response) => {
    const body: RequestBody = req.body;

    // check the body of the request using zod schema
    try {
      requestBodySchema.parse(body);
      res.status(200).send("Video generation started");
    } catch (error: any) {
      return res.status(400).send(error.errors);
    }

    const { alreadyExisted: whisperAlreadyExisted } = await installWhisperCpp({
      to: path.join(process.cwd(), "whisper.cpp"),
      version: "1.5.5",
    });

    const { alreadyExisted: modelAlreadyExisted } = await downloadWhisperModel({
      model: "medium.en",
      folder: path.join(process.cwd(), "whisper.cpp"),
    });

    let scenes: Scene[] = [];

    // Check available memory (in bytes) and convert to gigabytes
    const freeMemoryGB = os.freemem() / 1024 / 1024 / 1024;
    const memoryPerTaskGB = 1.5;

    // Calculate how many tasks can be run in parallel
    const maxParallelTasks = Math.floor(freeMemoryGB / memoryPerTaskGB);

    // Use p-limit to control parallel execution
    const limit = pLimit(maxParallelTasks);

    if (body.caption) {
      try {
        scenes = await Promise.all(
          scenes.map((scene) =>
            limit(async () => {
              const filePath = await downloadAndConvertAudio(scene.audioUrl);
              if (!filePath) {
                throw new Error("Error downloading the audio file");
              }

              const { transcription } = await transcribe({
                inputPath: filePath,
                whisperPath: path.join(process.cwd(), "whisper.cpp"),
                model: "medium.en",
                tokenLevelTimestamps: true,
              });

              // Delete the file asynchronously without waiting
              fs.unlink(filePath, (err) => {
                if (err) {
                  console.error(
                    `Error deleting the converted audio file: ${err}`
                  );
                } else {
                  console.log("Converted audio file deleted");
                }
              });

              const { captions } = convertToCaptions({
                transcription,
                combineTokensWithinMilliseconds: 200,
              });

              console.log("Captions generated for audio " + scene.audioUrl);

              return {
                ...scene,
                captions,
              };
            })
          )
        );
      } catch (error: any) {
        return axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
          type: "error",
          errors: {
            message:
              "Error occured while generating the captions: " + error.message,
          },
        });
        // console.error(error.message);
        // Handle errors appropriately
      }
    } else scenes = body.scenes;

    // Using promise.all to download and convert audio files in parallel
    //     if (body.caption)
    //       try {
    //         scenes = await Promise.all(
    //           body.scenes.map(async (scene) => {
    //             // try {
    //             const filePath = await downloadAndConvertAudio(scene.audioUrl);
    //             if (!filePath) {
    //               throw new Error("Error downloading the audio file");
    //             }
    //
    //             const { transcription } = await transcribe({
    //               inputPath: filePath,
    //               whisperPath: path.join(process.cwd(), "whisper.cpp"),
    //               model: "medium.en",
    //               tokenLevelTimestamps: true,
    //             });
    //
    //             fs.unlink(filePath, (err) => {
    //               if (err)
    //                 console.error(
    //                   `Error deleting the converted audio file: ${err}`
    //                 );
    //               else console.log("Converted audio file deleted");
    //             });
    //
    //             const { captions } = convertToCaptions({
    //               transcription,
    //               combineTokensWithinMilliseconds: 200,
    //             });
    //
    //             console.log("Captions generated for audio " + scene.audioUrl);
    //
    //             return {
    //               ...scene,
    //               captions,
    //             };
    //             // } catch (error: any) {
    //             //   console.error(error.message);
    //             //   throw (new Error("Error generating captions"), error.message);
    //             // }
    //           })
    //         );
    //       } catch (error: any) {
    //         return res.status(500).send(error.message);
    //       }

    // Using for loop to download and convert audio files in sequence (one after the other)
    //     if (body.caption) {
    //       try {
    //         for (const scene of body.scenes) {
    //           const filePath = await downloadAndConvertAudio(scene.audioUrl);
    //           if (!filePath) {
    //             throw new Error("Error downloading the audio file");
    //           }
    //
    //           const { transcription } = await transcribe({
    //             inputPath: filePath,
    //             whisperPath: path.join(process.cwd(), "whisper.cpp"),
    //             model: "medium.en",
    //             tokenLevelTimestamps: true,
    //           });
    //
    //           fs.unlink(filePath, (err) => {
    //             if (err)
    //               console.error(`Error deleting the converted audio file: ${err}`);
    //             else console.log("Converted audio file deleted");
    //           });
    //
    //           const { captions } = convertToCaptions({
    //             transcription,
    //             combineTokensWithinMilliseconds: 200,
    //           });
    //
    //           console.log("Captions generated for audio " + scene.audioUrl);
    //
    //           scenes.push({
    //             ...scene,
    //             captions,
    //           });
    //         }
    //       } catch (error: any) {
    //         return axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
    //           error: error.message,
    //         });
    //       }
    //     } else scenes = body.scenes;

    try {
      await generateVideo({
        ...body,
        scenes,
      });
    } catch (error: any) {
      return axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
        type: "error",

        errors: {
          message: "Error occured while generating the video: " + error.message,
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

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.setTimeout(600000);
