import AWS from 'aws-sdk';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const s3 = new AWS.S3({
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET_NAME = 'temporary-lambda-files';

export async function uploadPexelsVideoToS3(videoUrl: string, videoId: string, fileCounter: number): Promise<string> {
  if (!videoUrl.includes('pexels')) {
    return videoUrl;
  }

  const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
  const fileContent = Buffer.from(response.data, 'binary');

  const fileExtension = videoUrl.split('.').pop();
  const key = `${videoId}/video${fileCounter}.${fileExtension}`;

  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: 'video/mp4',
    ContentDisposition: 'inline',
  }).promise();

  return `https://${BUCKET_NAME}.s3.amazonaws.com/${encodeURIComponent(key)}`;
}

export async function deleteS3Files(videoId: string): Promise<void> {
  const listParams = {
    Bucket: BUCKET_NAME,
    Prefix: `${videoId}/`
  };

  const listedObjects = await s3.listObjectsV2(listParams).promise();

  if (listedObjects.Contents && listedObjects.Contents.length === 0) return;

  const deleteParams = {
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
