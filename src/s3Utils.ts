import AWS from 'aws-sdk';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const s3 = new AWS.S3({
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET_NAME = 'temporary-lambda-files';

const execAsync = promisify(exec);

export async function processVideo(videoUrl: string, videoId: string, fileCounter: number): Promise<string> {
  const response = await axios({
    method: 'get',
    url: videoUrl,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  const uniqueId = uuidv4();
  const inputPath = path.join(tempDir, `input_${videoId}_${fileCounter}_${uniqueId}.mp4`);
  const outputPath = path.join(tempDir, `output_${videoId}_${fileCounter}_${uniqueId}.mp4`);
  
  fs.writeFileSync(inputPath, Buffer.from(response.data));

  try {
    await execAsync(`ffmpeg -hwaccel auto -i ${inputPath} -c:v libx264 -preset ultrafast -crf 23 -r 30 -b:v 5000k -maxrate 5000k -bufsize 10000k -vf "scale=trunc(oh*a/2)*2:1080" -c:a aac -b:a 192k -y ${outputPath}`);
  } catch (error) {
    console.error('Error processing video with FFmpeg:', error);
    if (error instanceof Error && error.message.includes('Command failed')) {
      console.error('FFmpeg command output:', error.message);
    }
    throw error;
  }

  const fileContent = fs.readFileSync(outputPath);
  const key = `${videoId}/video${fileCounter}_${uniqueId}.mp4`;

  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: 'video/mp4',
    ContentDisposition: 'inline',
  }).promise();

  // Clean up temporary files
  fs.unlinkSync(inputPath);
  fs.unlinkSync(outputPath);

  return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
}

export async function processVideoBatch(videos: { videoUrl: string; videoId: string; fileCounter: number }[]): Promise<string[]> {
  return Promise.all(videos.map(video => processVideo(video.videoUrl, video.videoId, video.fileCounter)));
}

export async function deleteS3Files(videoId: string): Promise<void> {
  const listParams = {
    Bucket: BUCKET_NAME,
    Prefix: `${videoId}/`
  };

  const listedObjects = await s3.listObjectsV2(listParams).promise();

  if (listedObjects.Contents && listedObjects.Contents.length === 0) return;

  const deleteParams: AWS.S3.DeleteObjectsRequest = {
    Bucket: BUCKET_NAME,
    Delete: { Objects: [] }
  };

  listedObjects.Contents?.forEach(({ Key }) => {
    if (Key) deleteParams.Delete.Objects.push({ Key });
  });

  await s3.deleteObjects(deleteParams).promise();

  if (listedObjects.IsTruncated) await deleteS3Files(videoId);
}

export function getS3KeyFromUrl(url: string): string {
  return url.split(`https://${BUCKET_NAME}.s3.amazonaws.com/`)[1];
}
