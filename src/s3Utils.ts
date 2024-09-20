import AWS from 'aws-sdk';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const s3 = new AWS.S3({
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET_NAME = 'temporary-lambda-files';

export async function uploadPexelsVideoToS3(videoUrl: string): Promise<string> {
  if (!videoUrl.includes('pexels')) {
    return videoUrl;
  }

  const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
  const fileContent = Buffer.from(response.data, 'binary');

  const fileName = videoUrl.split('/').pop();
  const key = `${uuidv4()}/${fileName}`;

  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: 'video/mp4',
    ContentDisposition: 'inline',
  }).promise();

  return `https://${BUCKET_NAME}.s3.amazonaws.com/${encodeURIComponent(key)}`;
}

export async function deleteS3Files(keys: string[]): Promise<void> {
  const objects = keys.map(key => ({ Key: key }));

  await s3.deleteObjects({
    Bucket: BUCKET_NAME,
    Delete: { Objects: objects },
  }).promise();
}

export function getS3KeyFromUrl(url: string): string {
  return url.split(`https://${BUCKET_NAME}.s3.amazonaws.com/`)[1];
}
