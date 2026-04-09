// Referral Partner Admin — List & Manage
// GET  /api/referral-admin?key=ADMIN_KEY              → list all referrers
// GET  /api/referral-admin?key=ADMIN_KEY&format=csv    → CSV export
// POST /api/referral-admin?key=ADMIN_KEY               → toggle active status
//   body: { slug: "josh-m", active: false }

import { readBlob, writeBlob } from './_blob-store.js';

const BLOB_PREFIX = 'referral-registry';

export default async function handler(req, res) {
  const adminKey = process.env.REFERRAL_ADMIN_KEY;
  const provided = req.query.key;

  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let registry = await readBlob(BLOB_PREFIX, {});

    // POST — toggle a referrer's active status
    if (req.method === 'POST') {
      const { slug, active } = req.body;
      if (!slug || !registry[slug]) {
        return res.status(404).json({ error: 'Referrer not found' });
      }
      registry[slug].active = active !== false;
      await writeBlob(BLOB_PREFIX, registry);
      return res.status(200).json({ success: true, slug, active: registry[slug].active });
    }

    // GET — list all referrers
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const entries = Object.entries(registry).map(([slug, r]) => ({
      slug,
      link: `https://www.happyroof.com/r/${slug}`,
      ...r,
    }));

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
