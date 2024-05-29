"use strict";

const { renderMediaOnLambda } = require("@remotion/lambda/client");
const ffmpeg = require("fluent-ffmpeg");
const ffprobe = require("ffprobe-static");

const webhook = {
  url: process.env.WEBHOOK_URL,
  secret: process.env.WEBHOOK_SECRET,
};

module.exports.remotion = async (event) => {
  const requestBody = JSON.parse(event.body);

  const { scenes } = requestBody;

  // Start the video rendering process in the background
  generateVideo(scenes);

  // Immediately return a response indicating that video generation has started
  return {
    statusCode: 202,
    body: JSON.stringify({ message: "Video rendering initiated" }),
  };
};

async function generateVideo(scenes) {
  const composition = "remotion-video"; // this is the name of the composition in the Remotion project
  console.log("Generating video...");

  // calculate duration for each scene

  // calculate durantionInFrames

  // check if default props can be used
  const inputProps = {
    scenes: [
      {
        video: "https://www.w3schools.com/html/mov_bbb.mp4",
        audio: "https://www.w3schools.com/html/horse.mp3",
        padding: 0.5,
        duration: 10,
      },
      {
        video:
          "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        audio:
          "https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3",
        padding: 0.5,
        duration: 10,
      },
    ],
  };

  console.log("Rendering video...");

  // const video = await renderMedia({
  await renderMediaOnLambda({
    region: "us-east-1",
    composition,
    serveUrlL: process.env.REMOTION_SERVE_URL,
    webhook,
    inputProps,
    codec: "h264",
    functionName: "remotion-render-4-0-143-mem2048mb-disk2048mb-120sec",
  });
  console.log("Video rendered successfully");

  return video;
}

// Function to get media duration
function getMediaDuration(url) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(url, { path: ffprobe.path }, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration;
        resolve(duration);
      }
    });
  });
}
