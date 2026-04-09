// Shared blob read/write helper
// Uses versioned filenames to bypass Vercel Blob CDN caching.
// Each write creates a new blob (unique suffix) and deletes the old one,
// so reads always hit a fresh URL that was never cached.

import { put, list, del } from '@vercel/blob';

export async function readBlob(prefix, fallback) {
  try {
    const result = await list({ prefix });
    if (result.blobs.length > 0) {
      // Sort by uploadedAt descending to get the latest version
      const latest = result.blobs.sort((a, b) =>
        new Date(b.uploadedAt) - new Date(a.uploadedAt)
      )[0];
      const response = await fetch(latest.url, { cache: 'no-store' });
      return await response.json();
    }
  } catch (e) {
    // Blob doesn't exist yet
  }
  return fallback;
}

export async function writeBlob(prefix, data) {
  // List existing blobs with this prefix
  const existing = await list({ prefix });

  // Write new version with a random suffix (unique URL = no cache hit)
  const result = await put(prefix, JSON.stringify(data, null, 2), {
    access: 'public',
    addRandomSuffix: true,
    cacheControlMaxAge: 0,
  });

  // Delete all old versions
  const oldUrls = existing.blobs.map(b => b.url);
  if (oldUrls.length > 0) {
    await del(oldUrls);
  }

  return result;
}
