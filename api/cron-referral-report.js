// Daily Referral Partner Report — Cron Endpoint
// GET /api/cron-referral-report?key=REFERRAL_ADMIN_KEY
// Fetches referral registry and emails the report

import { readBlob } from './_blob-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth: accept either query key or Vercel CRON_SECRET header
  const adminKey = process.env.REFERRAL_ADMIN_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const keyMatch = adminKey && req.query.key === adminKey;
  const cronMatch = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!keyMatch && !cronMatch) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const registry = await readBlob('referral-registry', {});
    const entries = Object.entries(registry);
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

    let message;
    if (entries.length === 0) {
      message = 'No updates — no referral partners registered yet.';
    } else {
      let report = `REFERRAL PARTNER REPORT\n========================\nTotal Partners: ${entries.length}\n\n`;
      entries.forEach(([slug, r], i) => {
        report += `${i + 1}. ${r.name}\n`;
        report += `   Phone: ${r.phone}\n`;
        if (r.email) report += `   Email: ${r.email}\n`;
        report += `   Payment: ${r.paymentMethod || 'Not specified'}\n`;
        report += `   Link: happyroof.com/r/${slug}\n`;
        report += `   Registered: ${new Date(r.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}\n`;
        report += `   Status: ${r.active ? 'Active' : 'Inactive'}\n\n`;
      });
      message = report;
    }

    // Send via FormSubmit
    const formData = new URLSearchParams();
    formData.append('_subject', `Daily Referral Partner Report — ${today}`);
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

    let blocked = false;
    if (emailRes.status === 200) {
      const body = await emailRes.text();
      blocked = body.includes('Just a moment') || body.includes('challenge');
    }
    const success = emailRes.status >= 200 && emailRes.status < 400 && !blocked;
    return res.status(success ? 200 : 502).json({ success, blocked, partners: entries.length, date: today });
  } catch (err) {
    console.error('Cron referral report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
