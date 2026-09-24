import dotenv from 'dotenv';
dotenv.config();

import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

const r2Client = new S3Client({
  region: 'auto',
  endpoint: endpoint || undefined,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
  forcePathStyle: true,
});

async function main() {
  const key = 'english/Class_10/Student_Photos/MES2026-00010.jpg';
  console.log("Checking R2 object metadata for key:", key);
  try {
    const res = await r2Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: key
    }));
    console.log("Object exists!");
    console.log("Content Length (bytes):", res.ContentLength);
    console.log("Content Type:", res.ContentType);
    console.log("Last Modified:", res.LastModified);
  } catch (err) {
    console.error("HeadObject failed:", err);
  }
}

main();
