// Foundation Signup List — Protected Admin Endpoint
// GET /api/foundation-list?key=YOUR_ADMIN_KEY
// Optional: ?format=csv for CSV export

import { list } from '@vercel/blob';

const BLOB_KEY = 'foundation-signups.json';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Simple key-based auth — set FOUNDATION_ADMIN_KEY in Vercel env vars
  const adminKey = process.env.FOUNDATION_ADMIN_KEY;
  const provided = req.query.key;

  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let signups = [];
    try {
      const result = await list({ prefix: BLOB_KEY });
      if (result.blobs.length > 0) {
        const response = await fetch(result.blobs[0].downloadUrl + '&t=' + Date.now(), { cache: 'no-store' });
        signups = await response.json();
      }
    } catch (e) {
      // No signups yet
    }

    // CSV export
    if (req.query.format === 'csv') {
      const header = 'Name,Phone,Email,Date';
      const rows = signups.map(
        (s) => `"${s.name}","${s.phone}","${s.email}","${s.date}"`
      );
      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=foundation-signups.csv');
      return res.status(200).send(csv);
    }

    return res.status(200).json({ total: signups.length, signups });
  } catch (err) {
    console.error('Foundation list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
