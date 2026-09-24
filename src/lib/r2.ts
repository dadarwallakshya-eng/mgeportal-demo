/**
 * @module r2
 * @description Backward-compatible wrapper delegating storage calls to src/lib/storage.ts
 * (Supports Supabase Storage & S3 endpoints without hard Cloudflare R2 requirement).
 */

export {
  storageClient as r2Client,
  STORAGE_BUCKET_NAME as R2_BUCKET_NAME,
  uploadFileToStorage as uploadFileToR2,
  deleteFileFromStorage as deleteFileFromR2,
  renameFileInR2,
  getPresignedUploadUrl,
} from './storage';
