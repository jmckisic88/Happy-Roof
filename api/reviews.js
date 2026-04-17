// Public Reviews API
// GET /api/reviews
// Returns cached Google reviews from Vercel Blob (updated daily by cron)

import { readBlob } from './_blob-store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = await readBlob('google-reviews', null);

    if (!data) {
      return res.status(200).json({
        rating: 5.0,
        reviewCount: 0,
        reviews: [],
        lastUpdated: null,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Reviews API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
