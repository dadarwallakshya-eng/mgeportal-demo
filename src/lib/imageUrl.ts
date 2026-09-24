/**
 * @file src/lib/imageUrl.ts
 * @description Convert user-pasted file-share URLs into URLs that actually load
 *              when used as the `src` of an <img> tag.
 *
 * Operators paste links from Google Drive, Dropbox, OneDrive — each provider's
 * share URL is an HTML *viewer page*, not the raw file, so the browser can't
 * render it as an image. We detect a known share pattern, extract the file ID,
 * and return the provider's direct-image (thumbnail) endpoint.
 *
 * Unknown URLs are returned unchanged. The fallback letter avatar still kicks
 * in on image load failure, so this helper is a pure best-effort upgrade.
 */

/** Normalize a Dropbox share URL to a direct-render URL. */
function dropboxDirect(url: string): string | null {
  // dropbox.com/s/<token>/<filename>?dl=0  →  switch ?dl=0 to ?raw=1
  if (!/dropbox\.com\//.test(url)) return null;
  if (/[?&]raw=1/.test(url)) return url; // already direct
  // Replace dl=0/dl=1 with raw=1; if neither present, append raw=1.
  if (/[?&]dl=[01]/.test(url)) return url.replace(/([?&])dl=[01]/, '$1raw=1');
  return url + (url.includes('?') ? '&raw=1' : '?raw=1');
}

/** Normalize a OneDrive share URL to a direct-render URL. */
function oneDriveDirect(url: string): string | null {
  if (!/1drv\.ms\/|onedrive\.live\.com\//.test(url)) return null;
  // OneDrive: append download=1 to force direct serve.
  if (/[?&]download=1/.test(url)) return url;
  return url + (url.includes('?') ? '&download=1' : '?download=1');
}

import { obfuscatePath } from './cipher';

/**
 * Public API. Returns a URL that an <img> tag can actually render.
 * Returns the input unchanged if it doesn't look like a known share URL.
 */
export function toViewableImageUrl(input: string | null | undefined): string {
  if (!input) return '';
  const url = input.trim();
  if (!url) return '';

  // Cloudflare R2 relative keys (do not start with http/https protocols)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const token = obfuscatePath(url);
    return `/api/docs/t/${token}`;
  }

  const dbx = dropboxDirect(url);
  if (dbx) return dbx;

  const odv = oneDriveDirect(url);
  if (odv) return odv;

  return url;
}
