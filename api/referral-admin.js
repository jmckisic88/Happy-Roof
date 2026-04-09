// Referral Partner Admin — List & Manage
// GET  /api/referral-admin?key=ADMIN_KEY              → list all referrers
// GET  /api/referral-admin?key=ADMIN_KEY&format=csv    → CSV export
// POST /api/referral-admin?key=ADMIN_KEY               → toggle active status
//   body: { slug: "josh-m", active: false }

import { put, head } from '@vercel/blob';

const BLOB_KEY = 'referral-registry.json';

export default async function handler(req, res) {
  // Simple key-based auth — set REFERRAL_ADMIN_KEY in Vercel env vars
  const adminKey = process.env.REFERRAL_ADMIN_KEY;
  const provided = req.query.key;

  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let registry = {};
    try {
      const existing = await head(BLOB_KEY);
      if (existing) {
        const response = await fetch(existing.url);
        registry = await response.json();
      }
    } catch (e) {
      // No registry yet
    }

    // POST — toggle a referrer's active status
    if (req.method === 'POST') {
      const { slug, active } = req.body;
      if (!slug || !registry[slug]) {
        return res.status(404).json({ error: 'Referrer not found' });
      }
      registry[slug].active = active !== false;
      await put(BLOB_KEY, JSON.stringify(registry, null, 2), {
        access: 'public',
        addRandomSuffix: false,
      allowOverwrite: true,
      });
      return res.status(200).json({ success: true, slug, active: registry[slug].active });
    }

    // GET — list all referrers
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const entries = Object.entries(registry).map(([slug, r]) => ({
      slug,
      link: `https://www.happyroof.com/r/${slug}`,
      ...r,
    }));

    // CSV export
    if (req.query.format === 'csv') {
      const header = 'Slug,Name,Phone,Email,Payment,Active,Created,Link';
      const rows = entries.map(
        (e) =>
          `"${e.slug}","${e.name}","${e.phone}","${e.email}","${e.paymentMethod || ''}","${e.active}","${e.createdAt}","${e.link}"`
      );
      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=referral-partners.csv');
      return res.status(200).send(csv);
    }

    return res.status(200).json({ total: entries.length, referrers: entries });
  } catch (err) {
    console.error('Referral admin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
