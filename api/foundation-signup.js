// Foundation "Get Notified" Signup Handler
// Stores signups in Vercel Blob + emails info@happyroof.com via FormSubmit

import { readBlob, writeBlob } from './_blob-store.js';

const BLOB_PREFIX = 'foundation-signups';

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
    let signups = await readBlob(BLOB_PREFIX, []);
    signups.push(signup);
    await writeBlob(BLOB_PREFIX, signups);

    // Send email notification via FormSubmit
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
