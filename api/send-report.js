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

  // Use FormSubmit's non-AJAX endpoint with form-encoded data
  // This works from server-side without Origin validation
  try {
    const formData = new URLSearchParams();
    formData.append('_subject', subject);
    formData.append('message', message);
    formData.append('_captcha', 'false');
    formData.append('_template', 'table');

    const response = await fetch('https://formsubmit.co/info@happyroof.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://www.happyroof.com/',
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    // FormSubmit redirects on success (302/303)
    if (response.status >= 300 && response.status < 400) {
      return res.status(200).json({ success: true });
    }

    // If we get 200, it also worked (sometimes returns a thank-you page)
    if (response.status === 200) {
      return res.status(200).json({ success: true });
    }

    const text = await response.text();
    return res.status(502).json({ success: false, status: response.status, body: text.substring(0, 200) });
  } catch (err) {
    console.error('Send report error:', err);
    return res.status(500).json({ error: 'Failed to send email', details: err.message });
  }
}
