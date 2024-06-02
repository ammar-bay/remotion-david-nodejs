import {
  renderMediaOnLambda,
  RenderMediaOnLambdaInput,
} from "@remotion/lambda/client";
import axios from "axios";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { RequestBody } from "./types";
import dotenv from "dotenv";
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

export const checkHealth = () => {
  console.log("Health check", webhook);
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
