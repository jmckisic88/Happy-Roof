// Foundation "Get Notified" Signup Handler
// Stores signups in Vercel Blob + emails info@happyroof.com via FormSubmit

import { put, head } from '@vercel/blob';

const BLOB_KEY = 'foundation-signups.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, phone, email } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required' });
  }

  const signup = {
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    date: new Date().toISOString(),
  };

  try {
    // 1. Load existing signups from Vercel Blob
    let signups = [];
    try {
      const existing = await head(BLOB_KEY);
      if (existing) {
        const response = await fetch(existing.url + '?t=' + Date.now(), { cache: 'no-store' });
        signups = await response.json();
      }
    } catch (e) {
      // File doesn't exist yet — start fresh
    }

    // 2. Append new signup
    signups.push(signup);

    // 3. Store updated list back to Vercel Blob
    await put(BLOB_KEY, JSON.stringify(signups, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // 4. Send email notification via FormSubmit
    try {
      await fetch('https://formsubmit.co/ajax/info@happyroof.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: signup.name,
          phone: signup.phone,
          email: signup.email,
          _subject: 'New Foundation Signup — ' + signup.name,
          message: `New foundation interest signup:\n\nName: ${signup.name}\nPhone: ${signup.phone}\nEmail: ${signup.email}\nDate: ${signup.date}`,
        }),
      });
    } catch (emailErr) {
      console.error('FormSubmit email error (non-blocking):', emailErr);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Foundation signup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
