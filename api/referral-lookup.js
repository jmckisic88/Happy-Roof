// Referral Partner Lookup
// GET /api/referral-lookup?ref=josh-m
// Returns the referrer's display name if the slug is valid and active

import { list } from '@vercel/blob';

const BLOB_KEY = 'referral-registry.json';

async function loadRegistry() {
  try {
    const result = await list({ prefix: BLOB_KEY });
    if (result.blobs.length > 0) {
      const response = await fetch(result.blobs[0].downloadUrl + '&t=' + Date.now(), { cache: 'no-store' });
      return await response.json();
    }
  } catch (e) { /* blob doesn't exist yet */ }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const slug = (req.query.ref || '').trim().toLowerCase();

  if (!slug) {
    return res.status(400).json({ error: 'ref parameter is required' });
  }

  try {
    const registry = await loadRegistry();

    const referrer = registry[slug];

    if (!referrer || !referrer.active) {
      return res.status(404).json({ error: 'Referral link not found' });
    }

    // Only return the display name — no PII exposed
    const firstName = referrer.name.split(/\s+/)[0];
    return res.status(200).json({
      success: true,
      name: firstName,
      fullName: referrer.name,
    });
  } catch (err) {
    console.error('Referral lookup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
