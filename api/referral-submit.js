// Referral Customer Submission
// POST /api/referral-submit
// Customer submits their info via a referrer's unique link
// Sends to ServiceTitan + email with referrer attribution

const { head } = require('@vercel/blob');

const BLOB_KEY = 'referral-registry.json';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, phone, email, address, service, notes, ref } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  if (!ref) {
    return res.status(400).json({ error: 'Referral code is required' });
  }

  // Look up referrer
  let referrerName = 'Unknown';
  let referrerPhone = '';
  let referrerEmail = '';
  let referrerPayment = '';
  try {
    const existing = await head(BLOB_KEY);
    if (existing) {
      const response = await fetch(existing.url);
      const registry = await response.json();
      const referrer = registry[ref];
      if (referrer && referrer.active) {
        referrerName = referrer.name;
        referrerPhone = referrer.phone;
        referrerEmail = referrer.email;
        referrerPayment = referrer.paymentMethod;
      }
    }
  } catch (e) {
    console.error('Registry lookup error (non-blocking):', e);
  }

  // Build ServiceTitan payload
  const BOOKING_PROVIDER_ID = 46132;
  const TENANT_ID = process.env.ST_TENANT_ID;
  const CLIENT_ID = process.env.ST_CLIENT_ID;
  const CLIENT_SECRET = process.env.ST_CLIENT_SECRET;
  const APP_KEY = process.env.ST_APP_KEY;

  const summaryParts = [
    `[Source: Referral Link]`,
    `[Referred by: ${referrerName} — ${referrerPhone}]`,
    `[Referrer Slug: ${ref}]`,
  ];
  if (service) summaryParts.push(`Service: ${service}`);
  if (notes) summaryParts.push(`Notes: ${notes}`);
  const summary = summaryParts.join(' | ');

  // Send to ServiceTitan
  let stResult = { success: false };
  if (TENANT_ID && CLIENT_ID && CLIENT_SECRET && APP_KEY) {
    try {
      const tokenRes = await fetch('https://auth.servicetitan.io/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const leadRes = await fetch(
          `https://api.servicetitan.io/crm/v2/tenant/${TENANT_ID}/leads/form`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenData.access_token}`,
              'ST-App-Key': APP_KEY,
            },
            body: JSON.stringify({
              name,
              phoneNumber: phone,
              email: email || '',
              summary,
              bookingProviderId: BOOKING_PROVIDER_ID,
              ...(address ? { address: { street: address } } : {}),
            }),
          }
        );
        if (leadRes.ok) {
          const leadData = await leadRes.json();
          stResult = { success: true, leadId: leadData.id };
        }
      }
    } catch (stErr) {
      console.error('ServiceTitan error (non-blocking):', stErr);
    }
  }

  // Send email notification with full referrer + customer details
  try {
    await fetch('https://formsubmit.co/ajax/info@happyroof.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: `Referral Lead from ${referrerName} — ${name}`,
        'Customer Name': name,
        'Customer Phone': phone,
        'Customer Email': email || 'Not provided',
        'Property Address': address || 'Not provided',
        'Service Needed': service || 'Not specified',
        'Additional Notes': notes || 'None',
        '---': '---',
        'Referred By': referrerName,
        'Referrer Phone': referrerPhone,
        'Referrer Email': referrerEmail || 'Not provided',
        'Referrer Payment Pref': referrerPayment || 'Not specified',
        'Referral Slug': ref,
        'Referral Link': `https://www.happyroof.com/r/${ref}`,
        message: `New referral lead submitted via unique link:\n\n` +
          `CUSTOMER:\nName: ${name}\nPhone: ${phone}\nEmail: ${email || 'N/A'}\nAddress: ${address || 'N/A'}\nService: ${service || 'N/A'}\nNotes: ${notes || 'N/A'}\n\n` +
          `REFERRED BY:\nName: ${referrerName}\nPhone: ${referrerPhone}\nEmail: ${referrerEmail || 'N/A'}\nPayment: ${referrerPayment || 'N/A'}\nSlug: ${ref}`,
      }),
    });
  } catch (emailErr) {
    console.error('FormSubmit email error (non-blocking):', emailErr);
  }

  return res.status(200).json({ success: true, serviceTitan: stResult });
};
