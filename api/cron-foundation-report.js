// Daily Foundation Signups Report — Cron Endpoint
// GET /api/cron-foundation-report?key=FOUNDATION_ADMIN_KEY
// Fetches foundation signups and emails the report via Resend

import { readBlob } from './_blob-store.js';
import { sendEmail } from './_send-email.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = process.env.FOUNDATION_ADMIN_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const keyMatch = adminKey && req.query.key === adminKey;
  const cronMatch = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!keyMatch && !cronMatch) {
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

    const result = await sendEmail({
      subject: `Daily Foundation Signups Report — ${today}`,
      message,
    });

    return res.status(result.success ? 200 : 502).json({ ...result, signups: signups.length, date: today });
  } catch (err) {
    console.error('Cron foundation report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
