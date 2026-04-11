// Daily Foundation Signups Report — Cron Endpoint
// GET /api/cron-foundation-report?key=FOUNDATION_ADMIN_KEY
// Fetches foundation signups and emails the report

import { readBlob } from './_blob-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = process.env.FOUNDATION_ADMIN_KEY;
  if (!adminKey || req.query.key !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const signups = await readBlob('foundation-signups', []);
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

    let message;
    if (signups.length === 0) {
      message = 'No updates — no foundation signups yet.';
    } else {
      let report = `FOUNDATION SIGNUPS REPORT\n========================\nTotal Signups: ${signups.length}\n\n`;
      signups.forEach((s, i) => {
        report += `${i + 1}. ${s.name}\n`;
        report += `   Phone: ${s.phone}\n`;
        report += `   Email: ${s.email}\n`;
        report += `   Signed Up: ${new Date(s.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}\n\n`;
      });
      message = report;
    }

    const formData = new URLSearchParams();
    formData.append('_subject', `Daily Foundation Signups Report — ${today}`);
    formData.append('message', message);
    formData.append('_captcha', 'false');
    formData.append('_template', 'table');

    const emailRes = await fetch('https://formsubmit.co/info@happyroof.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; HappyRoofBot/1.0; +https://www.happyroof.com)',
        Referer: 'https://www.happyroof.com/',
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    const success = emailRes.status >= 200 && emailRes.status < 400;
    return res.status(success ? 200 : 502).json({ success, signups: signups.length, date: today });
  } catch (err) {
    console.error('Cron foundation report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
