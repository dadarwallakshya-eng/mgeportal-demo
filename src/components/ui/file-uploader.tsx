'use client';

/**
 * @file src/components/ui/file-uploader.tsx
 * @description A premium drag-and-drop file uploader component styled with the portal's
 *              warm cream + deep purple theme. Integrates directly with the `/api/upload` endpoint.
 */

import React, { useState, useRef } from 'react';
import { UploadCloud, Check, AlertCircle, Trash2, Loader2, FileText } from 'lucide-react';
import { toViewableImageUrl } from '@/lib/imageUrl';
import { ImageCropper } from './image-cropper';

interface FileUploaderProps {
  label?: string;
  /** Google Drive folder path parts (e.g., ['english', 'Class_5', 'Student_Photos']) */
  pathParts: string[];
  /** Callback triggered when upload succeeds. Receives the Google Drive view URL. */
  onUploadSuccess: (url: string) => void;
  /** Current URL (if a file is already uploaded/exists) */
  value?: string;
  /** Whether to restrict to image files only (e.g., for student photos) */
  acceptImagesOnly?: boolean;
}

function compressImage(file: File, maxDim = 1920, quality = 0.82): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            resolve(blob || file);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export function FileUploader({
  label,
  pathParts,
  onUploadSuccess,
  value,
  acceptImagesOnly = false,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropping States
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  // Determine accepted file types
  const acceptPattern = acceptImagesOnly ? 'image/*' : 'image/*,application/pdf';

  // Extract filename/file ID from value for display purposes
  const fileId = value ? (value.includes('/') ? value.split('/').pop() : value) : null;

  // Execute actual upload to R2
  const executeUpload = async (fileOrBlob: File | Blob, customFileName?: string) => {
    setIsUploading(true);
    setError(null);
    try {
      let uploadPayload: File | Blob = fileOrBlob;
      const fileName = customFileName || (fileOrBlob instanceof File ? fileOrBlob.name : 'image.jpg');
      const mimeType = fileOrBlob.type || 'image/jpeg';

      // Auto-compress image files in browser
      if (mimeType.startsWith('image/') && !(fileOrBlob instanceof Blob && (fileOrBlob as any).isCropped)) {
        if (fileOrBlob.size > 400 * 1024) {
          uploadPayload = await compressImage(fileOrBlob instanceof File ? fileOrBlob : new File([fileOrBlob], fileName, { type: mimeType }));
        }
      }

      // Check max size (10 MB limit)
      const MAX_SIZE = 10 * 1024 * 1024;
      if (uploadPayload.size > MAX_SIZE) {
        throw new Error(`File size is too large (${(uploadPayload.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 10 MB. Please upload a file of 10 MB or less.`);
      }

      const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.jpg';
      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${extension}`;

      // 1. If file size > 3.5 MB, use Chunked 2 MB Slice Upload to bypass Vercel serverless request limits
      if (uploadPayload.size > 3.5 * 1024 * 1024) {
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB slices
        const totalChunks = Math.ceil(uploadPayload.size / CHUNK_SIZE);

        // Step 1: Init chunk session
        const initRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'init',
            fileName: tempFileName,
            path: JSON.stringify(pathParts),
            mimeType,
            totalChunks,
            fileSize: uploadPayload.size,
          }),
        });

        if (!initRes.ok) {
          const initErr = await initRes.json().catch(() => ({}));
          throw new Error(initErr.error || 'Failed to initiate document upload.');
        }

        const { uploadId } = await initRes.json();

        // Step 2: Send 2 MB chunks sequentially
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(uploadPayload.size, start + CHUNK_SIZE);
          const chunkBlob = uploadPayload.slice(start, end);

          const chunkData = new FormData();
          chunkData.append('uploadId', uploadId);
          chunkData.append('chunkIndex', String(i));
          chunkData.append('chunk', chunkBlob, tempFileName);

          const chunkRes = await fetch('/api/upload/chunk', {
            method: 'POST',
            body: chunkData,
          });

          if (!chunkRes.ok) {
            throw new Error(`Failed to upload document section ${i + 1} of ${totalChunks}.`);
          }
        }

        // Step 3: Complete chunk session & recombine into 100% identical original file
        const completeRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
            uploadId,
          }),
        });

        if (!completeRes.ok) {
          const completeErr = await completeRes.json().catch(() => ({}));
          throw new Error(completeErr.error || 'Failed to complete document upload.');
        }

        const { fileId } = await completeRes.json();
        onUploadSuccess(fileId);
        return;
      }

      // 2. Standard server route upload
      const formData = new FormData();
      formData.append('file', uploadPayload);
      formData.append('fileName', tempFileName);
      formData.append('path', JSON.stringify(pathParts));

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      let data: any = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (res.status === 413 || text.includes('Request Entity Too Large') || text.includes('413')) {
          throw new Error('File size exceeds maximum allowed size of 10 MB.');
        }
        throw new Error(`Upload failed (${res.status} ${res.statusText || 'Server Error'}). Please try again.`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status}). Please try again.`);
      }

      onUploadSuccess(data.fileId);
    } catch (err: any) {
      console.error('[FILE_UPLOAD_ERROR]', err);
      let msg = err.message || 'Upload failed. Please try again.';
      if (msg.includes('Unexpected token') || msg.includes('JSON')) {
        msg = 'Upload failed due to a server error. Please try again.';
      }
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file selection
  const uploadFile = async (file: File) => {
    if (acceptImagesOnly && !file.type.startsWith('image/')) {
      setError('Only image files (JPEG, PNG, WEBP) are allowed.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError(`File size is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 10 MB. Please upload a file of 10 MB or less.`);
      return;
    }

    if (acceptImagesOnly) {
      const reader = new FileReader();
      reader.onload = () => {
        setCropSrc(reader.result as string);
        setOriginalFile(file);
      };
      reader.readAsDataURL(file);
      return;
    }

    await executeUpload(file);
  };

  const handleCropped = async (croppedBase64: string) => {
    setCropSrc(null);
    if (!originalFile) return;

    // Convert base64 data URL to a standard Blob without using fetch() to prevent CSP violations
    const arr = croppedBase64.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });

    // Preserve filename base, but force standard .jpg extension
    const baseName = originalFile.name.includes('.')
      ? originalFile.name.slice(0, originalFile.name.lastIndexOf('.'))
      : originalFile.name;
    const finalName = `${baseName}.jpg`;

    await executeUpload(blob, finalName);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    onUploadSuccess('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <span className="text-label text-xs font-semibold block">
          {label}
        </span>
      )}

      {value ? (
        // --- UPLOADED STATE ---
        <div className="flex items-center justify-between p-3 rounded-lg border border-brand/20 bg-brand/5">
          <div className="flex items-center gap-3 min-w-0">
            {acceptImagesOnly ? (
              // Display photo thumbnail preview
              <div className="w-10 h-10 rounded border border-beige bg-cream overflow-hidden shrink-0 flex items-center justify-center">
                <img
                  src={toViewableImageUrl(value)}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback if image fails to load
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            ) : (
              // Display document icon
              <div className="p-2 rounded bg-brand/10 text-brand shrink-0">
                <FileText size={18} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-ink truncate">
                {acceptImagesOnly ? 'Student Photo' : 'Document File'}
              </p>
              <p className="text-[10px] text-mute font-mono truncate">
                File: {fileId || 'Uploaded File'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={toViewableImageUrl(value)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 text-3xs font-bold border border-brand/20 text-brand rounded bg-paper hover:bg-brand/5 select-none transition-colors"
            >
              Open Link
            </a>
            <button
              onClick={handleRemove}
              className="px-2.5 py-1 text-3xs font-bold border border-red-200 text-red-600 rounded bg-paper hover:bg-red-50 flex items-center gap-1 select-none transition-colors cursor-pointer"
            >
              <Trash2 size={11} />
              <span>Remove</span>
            </button>
          </div>
        </div>
      ) : (
        // --- DROPZONE UPLOAD STATE ---
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-brand bg-brand/5 scale-[0.99]'
              : 'border-beige bg-field hover:border-brand/40 hover:bg-cream/40'
          } ${isUploading ? 'pointer-events-none opacity-80' : ''}`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={acceptPattern}
            className="hidden"
          />

          {isUploading ? (
            <div className="flex flex-col items-center justify-center py-2 space-y-2">
              <Loader2 size={24} className="text-brand animate-spin" />
              <p className="text-xs font-semibold text-brand">Uploading secure document...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-1 space-y-1.5">
              <UploadCloud size={28} className={isDragging ? 'text-brand animate-bounce' : 'text-mute'} />
              <div>
                <p className="text-xs font-bold text-ink">
                  Drag & drop file here, or <span className="text-brand">browse</span>
                </p>
                <p className="text-[10px] text-mute mt-0.5">
                  {acceptImagesOnly
                    ? 'Accepted formats: JPEG, PNG, WEBP (Max 5MB)'
                    : 'Accepted formats: PDF, JPEG, PNG (Max 10MB)'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-3xs font-medium text-red-600 mt-1">
          <AlertCircle size={10} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          isOpen={true}
          onCrop={handleCropped}
          onCancel={() => {
            setCropSrc(null);
            setOriginalFile(null);
          }}
        />
      )}
    </div>
  );
}
