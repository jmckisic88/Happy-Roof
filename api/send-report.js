// Send Report Email — Internal endpoint for scheduled agents
// POST /api/send-report
// Proxies email through FormSubmit.co with proper headers

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subject, message, to } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: 'subject and message are required' });
  }

  // Send to both info@ (activated) and josh@ via FormSubmit
  const recipients = ['info@happyroof.com'];
  const results = [];

  for (const recipient of recipients) {
    try {
      const response = await fetch(`https://formsubmit.co/ajax/${recipient}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://www.happyroof.com',
          Referer: 'https://www.happyroof.com/',
        },
        body: JSON.stringify({
          _subject: subject,
          message: message,
          _replyto: 'noreply@happyroof.com',
        }),
      });
      const data = await response.json();
      results.push({ recipient, ...data });
    } catch (err) {
      results.push({ recipient, success: 'false', error: err.message });
    }
  }

  const anySuccess = results.some(r => r.success === 'true');
  return res.status(anySuccess ? 200 : 502).json({ results });
}
