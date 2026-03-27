// ServiceTitan Lead Submission Proxy
// Credentials are stored as Vercel Environment Variables (never in code)
// POST /api/submit-lead

module.exports = async (req, res) => {
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

  const { name, phone, email, service, notes, address, source, page, priority } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  // Booking Provider ID (registered in ServiceTitan)
  const BOOKING_PROVIDER_ID = 46132;

  const TENANT_ID = process.env.ST_TENANT_ID;
  const CLIENT_ID = process.env.ST_CLIENT_ID;
  const CLIENT_SECRET = process.env.ST_CLIENT_SECRET;
  const APP_KEY = process.env.ST_APP_KEY;

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !APP_KEY) {
    console.error('Missing ServiceTitan environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Step 1: Get OAuth2 access token
    const tokenRes = await fetch('https://auth.servicetitan.io/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Token error:', tokenRes.status, errText);
      return res.status(502).json({ error: 'Authentication failed' });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Step 2: Build summary with source tracking
    const summaryParts = [];
    if (source) summaryParts.push(`[Source: ${source}]`);
    if (page) summaryParts.push(`[Page: ${page}]`);
    if (service) summaryParts.push(`Service: ${service}`);
    if (notes) summaryParts.push(`Notes: ${notes}`);
    const summary = summaryParts.join(' | ') || 'Website lead — no details provided';

    // Map priority: emergency/PPC leads get flagged
    const leadPriority = priority === 'high' ? 'Urgent' : undefined;

    // Step 3: Submit lead to ServiceTitan
    const leadRes = await fetch(
      `https://api.servicetitan.io/crm/v2/tenant/${TENANT_ID}/leads/form`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'ST-App-Key': APP_KEY,
        },
        body: JSON.stringify({
          name: name,
          phoneNumber: phone,
          email: email || '',
          summary: summary,
          bookingProviderId: BOOKING_PROVIDER_ID,
          priority: leadPriority,
          ...(address ? { address: { street: address } } : {}),
        }),
      }
    );

    if (!leadRes.ok) {
      const errText = await leadRes.text();
      console.error('Lead submission error:', leadRes.status, errText);
      return res.status(502).json({ error: 'Failed to submit lead', details: errText });
    }

    const leadData = await leadRes.json();
    return res.status(200).json({ success: true, leadId: leadData.id });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
