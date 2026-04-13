// Daily Referral Partner Report — Cron Endpoint
// GET /api/cron-referral-report?key=REFERRAL_ADMIN_KEY
// Fetches referral registry and emails the report via Resend

import { readBlob } from './_blob-store.js';
import { sendEmail } from './_send-email.js';

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

    const result = await sendEmail({
      subject: `Daily Referral Partner Report — ${today}`,
      message,
    });

    return res.status(result.success ? 200 : 502).json({ ...result, partners: entries.length, date: today });
  } catch (err) {
    console.error('Cron referral report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
