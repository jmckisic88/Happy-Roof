// Lead Submission Proxy — routes to Project Breeze
// POST /api/submit-lead
//
// 2026-06-25 hardening (Josh — Trever Gray incident, Q3 audit):
//   - 8s AbortSignal timeout on the Breeze call so slow upstream
//     responses don't burn the full 10s Vercel Edge / 60s Node
//     function budget. The user-facing form gets a fast failure +
//     fallback rather than a stuck spinner.
//   - On Breeze non-2xx (and on Turnstile failure, env-var miss, or
//     network error), send Josh a fallback email via Resend with the
//     raw inbound payload + the Breeze error text. Previously these
//     silently 502'd to the marketing site; now every silent
//     rejection lands in Josh's inbox the same minute it happens
//     with enough detail to replay the submission manually.

import crypto from 'crypto';
import { verifyTurnstile, getClientIp } from './_turnstile.js';
import { sendEmail } from './_send-email.js';

const BREEZE_URL = 'https://project-breeze.com/api/inbound-lead';
const BREEZE_TIMEOUT_MS = 8000;
const CALL_CTA = '(813) 595-7663';

// Layer 3 (trusted-proxy) HMAC — when Breeze rejects a submission at
// its Turnstile gate, we retry ONCE with a signed header so Breeze can
// treat this proxy as a trusted origin and route the lead into the
// platform-admin pending-review queue instead of dropping it. The
// shared secret is HAPPY_ROOF_PROXY_HMAC_KEY on both sides.
function signProxyBody(rawBody) {
  const key = process.env.HAPPY_ROOF_PROXY_HMAC_KEY;
  if (!key) return null;
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto
    .createHmac('sha256', key)
    .update(rawBody + ts)
    .digest('hex');
  return { 'x-hr-proxy-sig': sig, 'x-hr-proxy-ts': ts };
}

function sanitizeForEmail(obj) {
  // Strip secrets out of the payload before mailing it. Mirrors the
  // Breeze-side redaction so the two audit trails carry the same shape.
  const SECRET = new Set(['turnstile_token', 'cf-turnstile-response', 'key']);
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (!SECRET.has(k)) out[k] = v;
  }
  return out;
}

function buildFallbackEmail({ payload, status, errText, ip }) {
  const safe = sanitizeForEmail(payload);
  const lines = [
    'A website form submission could NOT be created in Project Breeze.',
    '',
    'IMPORTANT: this lead is NOT in your dashboard. The customer may',
    'have been told the form succeeded (the marketing site falls back',
    "to FormSubmit so they don't see a broken-form experience), but",
    'no lead row exists. Add this customer manually OR diagnose why',
    'Breeze rejected the submission.',
    '',
    `Breeze HTTP status: ${status}`,
    `Breeze response:    ${errText || '(empty)'}`,
    `Submitted by IP:    ${ip}`,
    `Submitted at:       ${new Date().toISOString()}`,
    '',
    'Raw payload:',
    JSON.stringify(safe, null, 2),
    '',
    'Diagnostic checklist:',
    '  - 401/403 = bad or missing INBOUND_LEAD_API_KEY env var, or',
    '              the Turnstile token was empty/expired (most common',
    '              cause; usually a real customer whose Turnstile',
    '              widget failed to render).',
    '  - 429     = rate limit; the IP fired too many submissions in',
    '              the last minute.',
    '  - 500     = Breeze server error; check inbound_lead_attempts',
    '              and Sentry on the Breeze side.',
    '  - 502/504 = network issue between this site and Breeze.',
  ];
  return {
    subject: `[Breeze REJECTED] Website lead from ${safe.name || 'unknown'} (${status})`,
    message: lines.join('\n'),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    name,
    phone,
    email,
    service,
    notes,
    address,
    address_street,
    address_city,
    address_state,
    address_postal_code,
    address_lat,
    address_lng,
    address_place_id,
    source,
    page,
    priority,
    sms_transactional,
    sms_marketing,
    terms_consent,
    newsletter,
    turnstile_token,
  } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  const ip = getClientIp(req);

  // Verify Turnstile token to block bot submissions
  const turnstile = await verifyTurnstile(turnstile_token, ip);
  if (!turnstile.success) {
    // 2026-06-25: also notify Josh when Turnstile rejects a likely-
    // real customer. The Trever Gray incident was caused by an empty
    // turnstile token (widget failed to render); without this email
    // alert, those rejections went completely invisible.
    try {
      await sendEmail(
        buildFallbackEmail({
          payload: req.body,
          status: 403,
          errText: 'Turnstile verification failed (likely empty/expired token at the client; could be a real customer whose widget never rendered)',
          ip,
        }),
      );
    } catch (mailErr) {
      console.error('Fallback email send failed:', mailErr);
    }
    return res.status(403).json({
      error: 'Bot verification failed. Please refresh and try again.',
      code: 'verification_expired',
      callCta: CALL_CTA,
    });
  }

  const BREEZE_API_KEY = process.env.BREEZE_INBOUND_API_KEY;

  if (!BREEZE_API_KEY) {
    console.error('Missing BREEZE_INBOUND_API_KEY environment variable');
    try {
      await sendEmail(
        buildFallbackEmail({
          payload: req.body,
          status: 0,
          errText: 'BREEZE_INBOUND_API_KEY env var is unset on the Vercel project — every submission is failing at the proxy.',
          ip,
        }),
      );
    } catch (mailErr) {
      console.error('Fallback email send failed:', mailErr);
    }
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Structured address (from Google Places autocomplete) is forwarded
  // in addition to the display string so Breeze can populate the
  // property master record + kick off PCPA / parcel enrichment without
  // reparsing the freeform text.
  const breezeBody = JSON.stringify({
    name,
    phone,
    email: email || '',
    service: service || '',
    notes: notes || '',
    address: address || '',
    address_street: address_street || '',
    address_city: address_city || '',
    address_state: address_state || '',
    address_postal_code: address_postal_code || '',
    address_lat: address_lat === '' || address_lat == null ? null : Number(address_lat),
    address_lng: address_lng === '' || address_lng == null ? null : Number(address_lng),
    address_place_id: address_place_id || '',
    source: source || 'Website',
    page: page || '',
    priority: priority || 'normal',
    sms_transactional: sms_transactional || 'No',
    sms_marketing: sms_marketing || 'No',
    terms_consent: terms_consent || 'No',
    newsletter: newsletter === true,
  });

  async function postToBreeze(extraHeaders) {
    return fetch(`${BREEZE_URL}?key=${encodeURIComponent(BREEZE_API_KEY)}`, {
      method: 'POST',
      headers: Object.assign(
        {
          'Content-Type': 'application/json',
          'x-api-key': BREEZE_API_KEY,
        },
        extraHeaders || {},
      ),
      body: breezeBody,
      signal: AbortSignal.timeout(BREEZE_TIMEOUT_MS),
    });
  }

  try {
    let leadRes = await postToBreeze();

    // Layer 3: if Breeze rejected at its Turnstile gate (per Layer 2
    // Breeze route returns { code: 'turnstile_failed' }), retry ONCE
    // with the HMAC-signed proxy header. Breeze will (a) accept via
    // the trusted-proxy path AND (b) write a durable
    // pending_lead_reviews row so nothing is silently dropped.
    if (leadRes.status === 403) {
      let firstBodyText = '';
      let firstBody = {};
      try {
        firstBodyText = await leadRes.clone().text();
        firstBody = JSON.parse(firstBodyText);
      } catch (_) {}
      if (firstBody && firstBody.code === 'turnstile_failed') {
        const sig = signProxyBody(breezeBody);
        if (sig) {
          try {
            leadRes = await postToBreeze(sig);
          } catch (retryErr) {
            console.error('Breeze HMAC retry error:', retryErr);
          }
        }
      }
    }

    if (!leadRes.ok) {
      const errText = await leadRes.text().catch(() => '');
      let parsedCode = null;
      try { parsedCode = (JSON.parse(errText) || {}).code || null; } catch (_) {}
      console.error('Breeze lead submission error:', leadRes.status, errText);
      try {
        await sendEmail(
          buildFallbackEmail({
            payload: req.body,
            status: leadRes.status,
            errText,
            ip,
          }),
        );
      } catch (mailErr) {
        console.error('Fallback email send failed:', mailErr);
      }
      // Signal to the client whether this was a Turnstile-family
      // failure (customer should refresh / call in) vs a generic
      // upstream failure. Client uses this to pick error copy.
      if (leadRes.status === 403 && (parsedCode === 'turnstile_failed' || parsedCode === 'verification_expired')) {
        return res.status(403).json({
          error: 'Verification expired. Please refresh and try again, or call us.',
          code: 'verification_expired',
          callCta: CALL_CTA,
        });
      }
      return res.status(502).json({ error: 'Failed to submit lead', details: errText });
    }

    const leadData = await leadRes.json();
    return res.status(200).json({ success: true, leadId: leadData.leadId });

  } catch (err) {
    // Network error, Breeze unreachable, or the 8s timeout fired.
    // All three are "Breeze is broken" signals that warrant the same
    // fallback email so Josh doesn't lose the customer.
    const isTimeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const errText = isTimeout ? `Timeout after ${BREEZE_TIMEOUT_MS}ms` : (err?.message || String(err));
    console.error('Unexpected error:', errText);
    try {
      await sendEmail(
        buildFallbackEmail({
          payload: req.body,
          status: isTimeout ? 504 : 502,
          errText,
          ip,
        }),
      );
    } catch (mailErr) {
      console.error('Fallback email send failed:', mailErr);
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
