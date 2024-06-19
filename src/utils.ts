import { convertToCaptions, transcribe } from "@remotion/install-whisper-cpp";
import {
  RenderMediaOnLambdaInput,
  renderMediaOnLambda,
} from "@remotion/lambda/client";
import axios from "axios";
import { execSync } from "child_process";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import pLimit from "p-limit";
import path from "path";
import { RequestBody, Scene } from "./types";

dotenv.config();

const webhook: RenderMediaOnLambdaInput["webhook"] = {
  url: process.env.REMOTION_WEBHOOK_URL || "",
  secret: process.env.REMOTION_WEBHOOK_SECRET || null,
};

export async function generateVideo(
  inputProps: RequestBody
): Promise<{ bucketName: string; renderId: string } | undefined> {
  const composition = process.env.REMOTION_COMPOSITION_ID || "remotion-video";
  console.log("Triggering video rendering");
  console.log("Input props: ", inputProps);
  console.log("Webhook: ", webhook);

  const { bucketName, renderId } = await renderMediaOnLambda({
    region:
      (process.env
        .REMOTION_LAMBDA_REGION as RenderMediaOnLambdaInput["region"]) ||
      "us-east-1",
    composition,
    serveUrl: process.env.REMOTION_SERVE_URL || "",
    webhook,
    inputProps,
    codec: "h264",
    functionName: process.env.REMOTION_LAMBDA_FUNCTION_NAME || "",
    outName: inputProps.videoId + ".mp4",
  });
  console.log("Video rendering started");
  return { bucketName, renderId };
}

const getFileExtension = (url: string): string => {
  const pathname: string = new URL(url).pathname;
  return path.extname(pathname);
};

export const downloadAndConvertAudio = async (
  url: string
): Promise<string | undefined> => {
  const originalExtension: string = getFileExtension(url);
  const random_string = Math.random().toString(36).substring(7);
  const originalAudioPath: string = path.join(
    __dirname,
    `original_audio_${random_string + originalExtension}`
  );
  const convertedAudioPath: string = path.join(
    __dirname,
    `converted_audio_${random_string}.wav`
  );

  try {
    const response = await axios({
      url,
      responseType: "arraybuffer",
    });

    fs.writeFileSync(originalAudioPath, response.data);
    console.log(`File downloaded and saved as ${originalAudioPath}`);

    // Convert to 16 kHz WAV file using FFmpeg
    const ffmpegCommand: string = `npx remotion ffmpeg -i ${originalAudioPath} -ar 16000 ${convertedAudioPath} -y`;
    execSync(ffmpegCommand);
    console.log("Audio converted to 16 kHz WAV file.");
    // Remove the original audio file
    fs.unlink(originalAudioPath, (err) => {
      if (err) console.error(`Error deleting the original audio file: ${err}`);
      else console.log(`Original audio file deleted: ${originalAudioPath}`);
    });
    return convertedAudioPath;
  } catch (error) {
    console.error(`Error executing FFmpeg: ${error}`);
    return undefined;
  }
};

class QueueProcessor {
  private requestQueue: RequestBody[] = [];
  private processing: boolean = false;

  public async addToQueue(body: RequestBody): Promise<void> {
    try {
      const scenes = await Promise.all(
        body.scenes.map(async (scene) => {
          const filePath = await downloadAndConvertAudio(scene.audioUrl);
          if (!filePath) {
            throw new Error("Error downloading the audio file");
          }
          return { ...scene, filePath };
        })
      );

      this.requestQueue.push({
        ...body,
        scenes,
      });
      this.processQueue();
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

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;
    let body = this.requestQueue.shift()!;

    try {
      let scenes: Scene[] = [];

      const freeMemoryGB = os.freemem() / 1024 / 1024 / 1024;
      const memoryPerTaskGB = 1.5;
      const maxParallelTasks = Math.floor(freeMemoryGB / memoryPerTaskGB);
      const limit = pLimit(maxParallelTasks || 1);

      if (body.caption) {
        try {
          scenes = await Promise.all(
            body.scenes.map((scene) =>
              limit(async () => {
                if (!scene.filePath) {
                  throw new Error("Error downloading the audio file");
                }

                const { transcription } = await transcribe({
                  inputPath: scene.filePath,
                  whisperPath: path.join(process.cwd(), "whisper.cpp"),
                  model: "medium.en",
                  tokenLevelTimestamps: true,
                });

                fs.unlink(scene.filePath, (err) => {
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
          await axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
            type: "error",
            errors: {
              message:
                "Error occurred while generating the captions: " +
                error.message,
            },
          });
          throw error;
        }
      } else {
        scenes = body.scenes;
      }

      try {
        await generateVideo({
          ...body,
          scenes,
        });
      } catch (error: any) {
        await axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
          type: "error",
          errors: {
            message:
              "Error occurred while generating the video: " + error.message,
          },
        });
      }
    } catch (error: any) {
      await axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
        type: "error",
        errors: {
          message:
            "Error occurred while generating the video: " + error.message,
        },
      });
    }

    this.processing = false;
    console.log("Job with ID " + body.videoId + " completed");
    this.processQueue();
  }
}

export const queueProcessor = new QueueProcessor();
