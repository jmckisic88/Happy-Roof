// Referral Partner Registration
// POST /api/referral-register
// Creates a new referrer with a unique slug and stores in Vercel Blob

const { put, head } = require('@vercel/blob');

const BLOB_KEY = 'referral-registry.json';

function generateSlug(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const first = parts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const lastInitial = parts[parts.length - 1][0].toLowerCase();
  return `${first}-${lastInitial}`;
}

function dedupeSlug(base, existing) {
  if (!existing[base]) return base;
  let i = 2;
  while (existing[`${base}-${i}`]) i++;
  return `${base}-${i}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, phone, email, paymentMethod } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  try {
    // Load existing registry
    let registry = {};
    try {
      const existing = await head(BLOB_KEY);
      if (existing) {
        const response = await fetch(existing.url);
        registry = await response.json();
      }
    } catch (e) {
      // Registry doesn't exist yet — start fresh
    }

    // Check if this person already has a link (by phone number)
    const existingEntry = Object.entries(registry).find(
      ([, r]) => r.phone === phone.trim()
    );
    if (existingEntry) {
      return res.status(200).json({
        success: true,
        slug: existingEntry[0],
        existing: true,
        message: 'You already have a referral link!',
      });
    }

    // Generate unique slug
    const baseSlug = generateSlug(name);
    const slug = dedupeSlug(baseSlug, registry);

    // Add to registry
    registry[slug] = {
      name: name.trim(),
      phone: phone.trim(),
      email: (email || '').trim(),
      paymentMethod: (paymentMethod || '').trim(),
      active: true,
      createdAt: new Date().toISOString(),
    };

    // Save back to Blob
    await put(BLOB_KEY, JSON.stringify(registry, null, 2), {
      access: 'public',
      addRandomSuffix: false,
    });

    // Email notification
    try {
      await fetch('https://formsubmit.co/ajax/info@happyroof.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: 'New Referral Partner — ' + name.trim(),
          name: name.trim(),
          phone: phone.trim(),
          email: (email || '').trim(),
          paymentMethod: (paymentMethod || '').trim(),
          referralLink: `https://www.happyroof.com/r/${slug}`,
          message: `New referral partner registered:\n\nName: ${name.trim()}\nPhone: ${phone.trim()}\nEmail: ${(email || '').trim()}\nPayment: ${(paymentMethod || '').trim()}\nSlug: ${slug}\nLink: https://www.happyroof.com/r/${slug}`,
        }),
      });
    } catch (emailErr) {
      console.error('FormSubmit email error (non-blocking):', emailErr);
    }

    return res.status(200).json({ success: true, slug });
  } catch (err) {
    console.error('Referral register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
