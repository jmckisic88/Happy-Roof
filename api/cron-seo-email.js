// SEO Audit Email Sender — reads saved report from Blob and emails it
// GET /api/cron-seo-email
// Called by cron-seo-audit after it saves the report

import { readBlob } from './_blob-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const report = await readBlob('seo-audit-report', null);

    if (!report || !report.message) {
      return res.status(404).json({ success: false, error: 'No report found' });
    }

    const formData = new URLSearchParams();
    formData.append('_subject', report.subject);
    formData.append('message', report.message);
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

    // Check for Cloudflare block
    let blocked = false;
    if (emailRes.status === 200) {
      const body = await emailRes.text();
      blocked = body.includes('Just a moment') || body.includes('challenge');
    }

    const success = emailRes.status >= 200 && emailRes.status < 400 && !blocked;
    return res.status(200).json({ success, status: emailRes.status, blocked });
  } catch (err) {
    console.error('SEO email error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
