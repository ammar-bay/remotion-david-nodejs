import { convertToCaptions, transcribe } from "@remotion/install-whisper-cpp";
import {
  RenderMediaOnLambdaInput,
  renderMediaOnLambda,
} from "@remotion/lambda/client";
import axios from "axios";
import { execSync } from "child_process";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { RequestBody, Scene } from "./types";
import { AssemblyAI } from "assemblyai";

dotenv.config();

const assemblyAiClient = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || "",
});

const webhook: RenderMediaOnLambdaInput["webhook"] = {
  url: process.env.REMOTION_WEBHOOK_URL || "",
  secret: process.env.REMOTION_WEBHOOK_SECRET || null,
};

// export async function generateCaptions(scenes: Scene[]): Promise<Scene[]> {
//   return await Promise.all(
//     scenes.map(async (scene) => {
//       const filePath = await downloadAndConvertAudio(scene.audioUrl);
//       if (!filePath) {
//         throw new Error("Error downloading the audio file");
//       }
//
//       const { transcription } = await transcribe({
//         inputPath: filePath,
//         whisperPath: path.join(process.cwd(), "whisper.cpp"),
//         model: "medium.en",
//         tokenLevelTimestamps: true,
//       });
//
//       fs.unlink(filePath, (err) => {
//         if (err) {
//           console.error(`Error deleting the converted audio file: ${err}`);
//         } else {
//           console.log("Converted audio file deleted");
//         }
//       });
//
//       const { captions } = convertToCaptions({
//         transcription,
//         combineTokensWithinMilliseconds: 200,
//       });
//
//       console.log("Captions generated for audio " + scene.audioUrl);
//
//       return {
//         ...scene,
//         captions,
//       };
//     })
//   );
// }

export async function generateCaptions(scenes: Scene[]): Promise<Scene[]> {
  console.log("Generating captions for scenes");
  return await Promise.all(
    scenes.map(async (scene) => {
      const transcript = await assemblyAiClient.transcripts.transcribe({
        audio_url: scene.audioUrl,
      });

      console.log("Captions generated for audio " + scene.audioUrl);
      //       console.log("Transcript: ", transcript);

      return {
        ...scene,
        captions: transcript.words?.map((word) => {
          return {
            text: word.text,
            start: word.start,
            end: word.end,
          };
        }),
      };
    })
  );
}

export async function generateVideo(
  inputProps: RequestBody
): Promise<{ bucketName: string; renderId: string } | undefined> {
  const composition = process.env.REMOTION_COMPOSITION_ID || "remotion-video";
  console.log("Triggering video rendering");
  console.log("Input props: ", inputProps);
  console.log("Webhook: ", webhook);

  // save inputProps to a file
  // fs.writeFileSync("inputProps.json", JSON.stringify(inputProps, null, 2));

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
  console.log("Bucket name: ", bucketName);
  console.log("Render ID: ", renderId);
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

// class QueueProcessor {
//   private requestQueue: RequestBody[] = [];
//   private processing: boolean = false;
//
//   public async retryTranscribe(args: any, retries = 5) {
//     for (let attempt = 1; attempt <= retries; attempt++) {
//       try {
//         return await transcribe(args);
//       } catch (error) {
//         if (attempt === retries) {
//           throw error;
//         }
//         console.error(`Transcribe attempt ${attempt} failed. Retrying...`);
//       }
//     }
//   }
//
//   public async addToQueue(body: RequestBody): Promise<void> {
//     try {
//       const scenes = await Promise.all(
//         body.scenes.map(async (scene) => {
//           const filePath = await downloadAndConvertAudio(scene.audioUrl);
//           if (!filePath) {
//             throw new Error(
//               "Error downloading the audio file for scene " + scene.audioUrl
//             );
//           }
//           return { ...scene, filePath };
//         })
//       );
//
//       this.requestQueue.push({
//         ...body,
//         scenes,
//       });
//       this.processQueue();
//     } catch (error: any) {
//       await axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
//         type: "error",
//         errors: {
//           message:
//             "Error occurred while downloading the audio: " + error.message,
//         },
//       });
//     }
//   }
//
//   private async processQueue(): Promise<void> {
//     if (this.processing || this.requestQueue.length === 0) {
//       return;
//     }
//
//     this.processing = true;
//     let body = this.requestQueue.shift()!;
//
//     let scenes: Scene[] = [];
//
//     // const freeMemoryGB = os.freemem() / 1024 / 1024 / 1024;
//     // const memoryPerTaskGB = 1.5;
//     // const maxParallelTasks = Math.floor(freeMemoryGB / memoryPerTaskGB);
//     // const limit = pLimit(maxParallelTasks || 1);
//
//     try {
//       if (body.caption) {
//         scenes = await Promise.all(
//           body.scenes.map(async (scene) => {
//             if (!scene.filePath) {
//               throw new Error("Error downloading the audio file");
//             }
//
//             // const { transcription } = await transcribe({
//             //   inputPath: scene.filePath,
//             //   whisperPath: path.join(process.cwd(), "whisper.cpp"),
//             //   model: "medium.en",
//             //   tokenLevelTimestamps: true,
//             // });
//
//             const { transcription } = (await this.retryTranscribe({
//               inputPath: scene.filePath,
//               whisperPath: path.join(process.cwd(), "whisper.cpp"),
//               model: "medium.en",
//               tokenLevelTimestamps: true,
//             })) as any;
//
//             fs.unlink(scene.filePath, (err) => {
//               if (err) {
//                 console.error(
//                   `Error deleting the converted audio file: ${err}`
//                 );
//               } else {
//                 console.log("Converted audio file deleted");
//               }
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
//           })
//         );
//
//         console.log(scenes.length + " scenes processed");
//       } else {
//         scenes = body.scenes;
//       }
//
//       await generateVideo({
//         ...body,
//         scenes,
//       });
//       console.log("Job with ID " + body.videoId + " completed successfully");
//     } catch (error: any) {
//       console.error(
//         "Error occurred while generating the video with Job ID: " +
//           body.videoId +
//           "\n ERROR: " +
//           error.message
//       );
//       await axios.post(process.env.REMOTION_WEBHOOK_URL || "", {
//         type: "error",
//         errors: {
//           message:
//             "Error occurred while generating the video: " + error.message,
//         },
//       });
//     } finally {
//       this.processing = false;
//       this.processQueue();
//     }
//   }
// }

// export const queueProcessor = new QueueProcessor();
