import dotenv from 'dotenv';
dotenv.config();

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

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
  console.log("Listing recent R2 uploads...");
  try {
    const res = await r2Client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 20
    }));
    
    if (!res.Contents) {
      console.log("No objects found in bucket.");
      return;
    }

    // Sort by LastModified descending
    const sorted = res.Contents.sort((a, b) => {
      return (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0);
    });

    console.log(JSON.stringify(sorted.slice(0, 10).map(o => ({
      Key: o.Key,
      Size: o.Size,
      LastModified: o.LastModified
    })), null, 2));
  } catch (err) {
    console.error("ListObjects failed:", err);
  }
}

main();
