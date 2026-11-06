// Roof Visualizer API v3
// POST /api/roof-visualizer
// Body: { address? | uploadedImage?, roofStyle?, colors: [{name,hex?}, ...] }  (1–4 colors)
// For each color, uses gpt-image-1 to edit the ACTUAL photo of the house,
// replacing only the roof. All colors generate in parallel for speed.
// Returns { success, originalImage, generatedImages: [dataURL,...], colors: [...] }
//
// Back-compat: accepts single `roofColor` string in place of `colors` array.

import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { sendEmail } from './_send-email.js';

// Vercel: give the function enough runway for 4 parallel image gens.
// Hobby plan caps at 60s, Pro (this project's tier) at 300s. 120s is a
// comfortable middle ground for 4 parallel gpt-image-2.5-flare edits.
// The Next.js-shaped `export const config = { maxDuration }` form is ignored
// on bare Vercel Node functions; only the top-level export is honored.
export const maxDuration = 120;

function buildVisualizerNotification({ lead, colors, delivered, requested, failed, source }) {
  const fn = (lead && lead.first_name) || '';
  const ln = (lead && lead.last_name) || '';
  const fullName = ((fn + ' ' + ln).trim()) || (lead && lead.name) || 'Unknown visitor';
  const addr = (lead && lead.address) || '(no address on record)';
  const email = (lead && lead.email) || '';
  const phone = (lead && lead.phone) || '';
  const noContact = !email && !phone;

  const colorLines = (colors || [])
    .map((c, i) => '  ' + (i + 1) + '. ' + (c && c.name ? c.name : '(unnamed)'))
    .join('\n') || '  (none recorded)';

  const warn = noContact
    ? '\n⚠️  NO EMAIL OR PHONE PROVIDED. If this lead is high-intent,\n    plan a door-knock or Street-View outreach to the address above.\n'
    : '';

  const partial = (failed && failed > 0)
    ? '\nPartial result: ' + delivered + ' of ' + requested + ' color generations succeeded (' + failed + ' failed).'
    : '';

  const subject = '🏠 Roof Visualizer · ' + fullName + ' · ' + addr;

  const message = [
    'A visitor just generated a roof color comparison on happyroof.com.',
    '',
    'Name:     ' + fullName,
    'Address:  ' + addr,
    'Email:    ' + (email || 'not provided'),
    'Phone:    ' + (phone || 'not provided'),
    '',
    'Colors compared:',
    colorLines,
    partial,
    warn,
    'Source:   ' + (source || '/assessment?tab=viz'),
    'Fired at: ' + new Date().toISOString(),
    '',
    'The matching lead row should also be in Project Breeze under the',
    '"Roof Color Visualizer" service tag. If it is missing there, check',
    'the submit-lead fallback emails from the same minute.',
  ].join('\n');

  return { subject, message };
}

// Primary + fallback image-edit models, tried in order per color.
// gpt-image-1 was retired by OpenAI on 2026-10-23. gpt-image-1-mini and
// gpt-image-1.5 shut down 2026-12-01 so they are NOT in the chain. 2.5-flare
// is the speed/cost replacement, 2.5-sunburst is the higher-fidelity backup.
// Both still require org verification at the URL below.
const MODEL_CHAIN = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'];
const OPENAI_VERIFICATION_URL = 'https://platform.openai.com/settings/organization/general';

async function callOpenAIEdit(imageBuffer, style, colorName, openaiKey, quality, model) {
  const prompt = `Edit this photograph of a house. Replace ONLY the roof with a brand new ${colorName} ${style} roof. Keep the exact same house, same walls, same windows, same doors, same landscaping, same driveway, same trees, same sky, same everything else completely unchanged. Only the roof material and color should change to ${colorName} ${style}. The new roof should look freshly installed, clean, and photorealistic.`;

  const boundary = '----FormBoundary' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  const parts = [];
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n1024x1024`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\n${quality}`);

  const imageHeader = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="house.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const imageFooter = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(parts.join('\r\n') + '\r\n'),
    Buffer.from(imageHeader),
    imageBuffer,
    Buffer.from(imageFooter),
  ]);

  const editRes = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: body,
  });

  if (!editRes.ok) {
    const errText = await editRes.text();
    const err = new Error(`OpenAI ${editRes.status}: ${errText.slice(0, 400)}`);
    err.status = editRes.status;
    err.body = errText;
    throw err;
  }

  const editData = await editRes.json();
  const b64 = editData.data?.[0]?.b64_json;
  const url = editData.data?.[0]?.url;

  if (b64) return `data:image/png;base64,${b64}`;
  if (url) {
    const imgResp = await fetch(url);
    const imgBuf = Buffer.from(await imgResp.arrayBuffer());
    return `data:image/png;base64,${imgBuf.toString('base64')}`;
  }
  throw new Error('No image returned from OpenAI');
}

async function generateOne(imageBuffer, style, colorName, openaiKey) {
  // Walk the model chain. For each model: try medium quality first, retry at
  // low quality on transient 429/5xx. Fall through to the next model on
  // "model gated / unknown" signals (400 model_not_found, 401, 403, 404).
  let lastErr;
  for (const model of MODEL_CHAIN) {
    try {
      return await callOpenAIEdit(imageBuffer, style, colorName, openaiKey, 'medium', model);
    } catch (e1) {
      lastErr = e1;
      const status = e1.status || 0;
      const body = String(e1.body || e1.message || '');
      const modelGated =
        status === 404 ||
        status === 401 ||
        status === 403 ||
        (status === 400 && /does not exist|model_not_found|invalid_value|must be verified/i.test(body));
      const transient = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

      if (modelGated) {
        console.warn(`[roof-viz] ${colorName} model ${model} rejected (${status}); trying next model in chain`);
        continue;
      }
      if (!transient) throw e1;

      console.warn(`[roof-viz] ${colorName} ${model} medium failed (${status}); retrying at low quality`);
      try {
        return await callOpenAIEdit(imageBuffer, style, colorName, openaiKey, 'low', model);
      } catch (e2) {
        // Transient at both qualities counts as a real outage for this color; surface the original error.
        throw e1;
      }
    }
  }
  throw lastErr || new Error('No image-edit model succeeded');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { address, uploadedImage, roofStyle, colors, roofColor, lead, source } = req.body || {};

  // Accept either `colors` array or back-compat single `roofColor` string
  let colorList = Array.isArray(colors) ? colors.slice() : null;
  if (!colorList && roofColor) colorList = [{ name: roofColor }];
  if (!colorList || !colorList.length) {
    return res.status(400).json({ error: 'At least one color is required' });
  }
  if (colorList.length > 4) colorList = colorList.slice(0, 4);

  // Normalize color entries so each has a name
  colorList = colorList
    .map(c => typeof c === 'string' ? { name: c } : c)
    .filter(c => c && c.name);
  if (!colorList.length) {
    return res.status(400).json({ error: 'At least one named color is required' });
  }

  if (!address && !uploadedImage) {
    return res.status(400).json({ error: 'Address or uploaded image is required' });
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

  const style = roofStyle || 'architectural shingle';

  try {
    let imageBuffer;
    let originalDataUrl;

    if (uploadedImage) {
      const base64Data = uploadedImage.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
      originalDataUrl = uploadedImage;
    } else {
      if (!googleKey) return res.status(500).json({ error: 'Google API key not configured' });

      const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${googleKey}`;
      const metaRes = await fetch(metaUrl);
      const meta = await metaRes.json();

      if (meta.status !== 'OK') {
        return res.status(404).json({
          error: 'No Street View image available for this address. Try uploading a photo instead.',
          noStreetView: true,
        });
      }

      const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=1024x768&location=${encodeURIComponent(address)}&key=${googleKey}&fov=90&pitch=15`;
      const imgRes = await fetch(streetViewUrl);
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      originalDataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    }

    // Persist a temp file as a diagnostic breadcrumb (kept for parity with v2)
    const tmpPath = join(tmpdir(), `roof-viz-${Date.now()}.jpg`);
    try { await writeFile(tmpPath, imageBuffer); } catch (e) { /* ignore */ }

    // Generate each color in parallel. Failures don't take down the whole batch.
    const perColor = await Promise.all(
      colorList.map(c =>
        generateOne(imageBuffer, style, c.name, openaiKey)
          .then(dataUrl => ({ ok: true, color: c, image: dataUrl }))
          .catch(err => ({ ok: false, color: c, error: String(err && err.message || err) }))
      )
    );

    try { await unlink(tmpPath); } catch (e) { /* ignore */ }

    const successes = perColor.filter(r => r.ok);
    const failures = perColor.filter(r => !r.ok);

    if (!successes.length) {
      const details = failures.map(f => `${f.color.name}: ${f.error}`).join(' | ');
      const verificationGated = /does not exist|model_not_found|invalid_value|must be verified|403|401/i.test(details);
      return res.status(502).json({
        error: verificationGated
          ? 'The AI image model this visualizer calls is not available on the current OpenAI organization (likely verification required).'
          : 'All AI generations failed. Please try again.',
        details,
        verificationUrl: verificationGated ? OPENAI_VERIFICATION_URL : undefined,
        hint: verificationGated
          ? `Site owner: verify the Happy Roof OpenAI org at ${OPENAI_VERIFICATION_URL} (Persona ID check). Access to GPT Image 2.5 models can take up to 15 minutes to propagate after approval.`
          : undefined,
        attemptedModels: MODEL_CHAIN,
      });
    }

    // Belt-and-suspenders notification — every successful visualizer run
    // fires a direct email in addition to the client's Breeze submit-lead
    // call, so Josh gets a notification even if Breeze is silent.
    // Lead object comes from the client (name, address, optional contact).
    // Address falls back to the Street View address when no explicit lead
    // address was provided, so the notification always has the house.
    let emailNotified = false;
    let emailError = null;
    try {
      const normalizedLead = Object.assign({}, lead || {});
      if (!normalizedLead.address && address) normalizedLead.address = address;
      const { subject, message } = buildVisualizerNotification({
        lead: normalizedLead,
        colors: successes.map(r => r.color),
        delivered: successes.length,
        requested: colorList.length,
        failed: failures.length,
        source,
      });
      const emailRes = await sendEmail({ subject, message });
      emailNotified = !!(emailRes && emailRes.success);
      if (!emailNotified) emailError = (emailRes && emailRes.error) || 'unknown';
    } catch (e) {
      emailError = String(e && e.message || e);
      console.error('Visualizer notification email failed:', e);
    }

    return res.status(200).json({
      success: true,
      originalImage: originalDataUrl,
      generatedImages: successes.map(r => r.image),
      colors: successes.map(r => ({ name: r.color.name, hex: r.color.hex || null })),
      method: MODEL_CHAIN.join(' -> '),
      requested: colorList.length,
      delivered: successes.length,
      failed: failures.length,
      failures: failures.length ? failures.map(f => ({ name: f.color.name, error: f.error })) : undefined,
      notified: emailNotified,
      notifyError: emailError,
    });
  } catch (err) {
    console.error('Roof visualizer error:', err);
    return res.status(500).json({
      error: 'Failed to generate visualization. Please try again.',
      details: err.message,
    });
  }
}
