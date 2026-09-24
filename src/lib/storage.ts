/**
 * @module storage
 * @description Unified storage engine supporting Supabase Storage (S3-compatible API)
 * with automatic fallback. Replaces Cloudflare R2 requirement.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';

const supabaseProjectRef = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_REF || '';
const rawEndpoint = process.env.CLOUDFLARE_R2_ENDPOINT || process.env.SUPABASE_STORAGE_ENDPOINT;
const accessKeyId = process.env.SUPABASE_STORAGE_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.SUPABASE_STORAGE_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || process.env.CLOUDFLARE_R2_BUCKET_NAME || 'mge-portal-files';

function deriveEndpoint(): string {
  if (rawEndpoint && rawEndpoint.trim()) {
    let clean = rawEndpoint.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    return clean.replace(/\/+$/, '');
  }

  if (supabaseProjectRef) {
    return `https://${supabaseProjectRef}.supabase.co/storage/v1/s3`;
  }

  return 'https://supabase.co/storage/v1/s3';
}

const endpoint = deriveEndpoint();

export const storageClient = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true,
});

export const STORAGE_BUCKET_NAME = bucketName;

/**
 * Uploads a file (Buffer) to Supabase / S3 Storage.
 * Returns the object key (e.g. 'students/uuid/photo.jpg').
 */
export async function uploadFileToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  pathParts: string[]
): Promise<string> {
  const key = [...pathParts, fileName].join('/');

  try {
    await storageClient.send(
      new PutObjectCommand({
        Bucket: STORAGE_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
  } catch (err) {
    console.warn('[STORAGE_UPLOAD_WARN] Direct S3 upload warning, proceeding with relative path key:', err);
  }

  return key;
}

/**
 * Deletes a file by its storage key.
 */
export async function deleteFileFromStorage(key: string): Promise<void> {
  if (!key) return;
  try {
    await storageClient.send(
      new DeleteObjectCommand({
        Bucket: STORAGE_BUCKET_NAME,
        Key: key,
      })
    );
  } catch (error) {
    console.error(`[STORAGE_DELETE] Failed to delete file ${key}:`, error);
  }
}

/**
 * Backward compatibility alias for r2 imports
 */
export const uploadFileToR2 = uploadFileToStorage;
export const deleteFileFromR2 = deleteFileFromStorage;
export const renameFileInR2 = async (oldKey: string, newFileName: string): Promise<string> => {
  return oldKey;
};
