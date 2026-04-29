// Lead Submission Proxy — routes to Project Breeze
// POST /api/submit-lead

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, phone, email, service, notes, address, source, page, priority, sms_transactional, sms_marketing, terms_consent } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  const BREEZE_API_KEY = process.env.BREEZE_INBOUND_API_KEY;
  const BREEZE_URL = 'https://project-breeze.com/api/inbound-lead';

  if (!BREEZE_API_KEY) {
    console.error('Missing BREEZE_INBOUND_API_KEY environment variable');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const leadRes = await fetch(`${BREEZE_URL}?key=${encodeURIComponent(BREEZE_API_KEY)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BREEZE_API_KEY,
      },
      body: JSON.stringify({
        name,
        phone,
        email: email || '',
        service: service || '',
        notes: notes || '',
        address: address || '',
        source: source || 'Website',
        page: page || '',
        priority: priority || 'normal',
        sms_transactional: sms_transactional || 'No',
        sms_marketing: sms_marketing || 'No',
        terms_consent: terms_consent || 'No',
      }),
    });

    if (!leadRes.ok) {
      const errText = await leadRes.text();
      console.error('Breeze lead submission error:', leadRes.status, errText);
      return res.status(502).json({ error: 'Failed to submit lead', details: errText });
    }

    const leadData = await leadRes.json();
    return res.status(200).json({ success: true, leadId: leadData.leadId });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
