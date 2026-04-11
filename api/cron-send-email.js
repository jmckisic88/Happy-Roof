// Generic Email Sender — Cron Endpoint
// POST /api/cron-send-email
// Sends an email via FormSubmit with proper headers
// Used by scheduled agents that can't reach FormSubmit directly

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subject, message } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: 'subject and message are required' });
  }

  try {
    const formData = new URLSearchParams();
    formData.append('_subject', subject);
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
    return res.status(success ? 200 : 502).json({ success });
  } catch (err) {
    console.error('Cron send email error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
