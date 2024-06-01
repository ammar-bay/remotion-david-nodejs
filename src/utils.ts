import {
  renderMediaOnLambda,
  RenderMediaOnLambdaInput,
} from "@remotion/lambda/client";
import axios from "axios";
import fs from "fs";
import { execSync } from "child_process";
import path from "path";

import { Scene } from "./types";

// const webhook: RenderMediaOnLambdaInput["webhook"] = {
//   url: process.env.WEBHOOK_URL || "",
//   secret: process.env.WEBHOOK_SECRET || "",
// };

const webhook: RenderMediaOnLambdaInput["webhook"] = {
  url: "https://c658-103-131-212-204.ngrok-free.app/webhook",
  secret: "ammar",
};

export async function generateVideo(
  scenes: Scene[]
): Promise<{ bucketName: string; renderId: string } | undefined> {
  const composition = "remotion-video"; // this is the name of the composition in the Remotion project
  console.log("Generating video...");

  // calculate duration for each scene

  // calculate durantionInFrames

  // check if default props can be used
  const inputProps = {
    scenes,
  };

  console.log("Rendering video...");

  console.log("Input props: ", inputProps);

  console.log("Webhook: ", webhook);

  const { bucketName, renderId } = await renderMediaOnLambda({
    region: "us-east-1",
    composition,
    serveUrl: process.env.REMOTION_SERVE_URL || "",
    webhook,
    inputProps,
    codec: "h264",
    functionName: "remotion-render-4-0-143-mem2048mb-disk2048mb-120sec",
  });
  console.log("Video rendering started");
  console.log("Bucket name: ", bucketName);
  console.log("Render ID: ", renderId);
  return { bucketName, renderId };
}

// Function to get the file extension from a URL
const getFileExtension = (url: string): string => {
  const pathname: string = new URL(url).pathname;
  return path.extname(pathname); // Extracts the extension including the dot (e.g., '.mp3')
};

// Function to download and convert audio
export const downloadAndConvertAudio = async (
  url: string
  // outputFilePath: string
): Promise<string | undefined> => {
  const originalExtension: string = getFileExtension(url);
  const outputPath: string = path.join(__dirname, `audio${originalExtension}`); // Use the original file extension
  const convertedFilePath: string = path.join(__dirname, "converted_audio.wav"); // Target format for conversion

  const response = await axios({
    url,
    responseType: "arraybuffer",
  });

  fs.writeFileSync(outputPath, response.data);
  console.log(`File downloaded and saved as ${outputPath}`);

  // Convert to 16 kHz WAV file using FFmpeg
  const ffmpegCommand: string = `ffmpeg -i ${outputPath} -ar 16000 ${convertedFilePath} -y`;

  try {
    execSync(ffmpegCommand);
    console.log("Audio converted to 16 kHz WAV file.");
    // Proceed with transcription
    return convertedFilePath;
  } catch (error) {
    console.error(`Error executing FFmpeg: ${error}`);
  }
};
