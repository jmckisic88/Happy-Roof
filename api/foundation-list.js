// Foundation Signup List — Protected Admin Endpoint
// GET /api/foundation-list?key=YOUR_ADMIN_KEY
// Optional: ?format=csv for CSV export

import { readBlob } from './_blob-store.js';

const BLOB_PREFIX = 'foundation-signups';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = process.env.FOUNDATION_ADMIN_KEY;
  const provided = req.query.key;

  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const signups = await readBlob(BLOB_PREFIX, []);

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
