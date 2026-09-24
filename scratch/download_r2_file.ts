import dotenv from 'dotenv';
dotenv.config();

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

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
  const outPath = '/Users/lakshyakumaawat/.gemini/antigravity/brain/dc6d4cf0-540c-4375-901b-94d19e85ea91/check_img.jpg';
  console.log("Downloading R2 file:", key);
  try {
    const res = await r2Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    }));
    
    if (!res.Body) {
      console.log("No body found");
      return;
    }

    const stream = res.Body as any;
    const writeStream = fs.createWriteStream(outPath);
    stream.pipe(writeStream);
    
    writeStream.on('finish', () => {
      console.log("Downloaded successfully to:", outPath);
    });
  } catch (err) {
    console.error("Download failed:", err);
  }
}

main();
