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

// Vercel: give the function enough runway for 4 parallel image gens
export const config = { maxDuration: 60 };
export const maxDuration = 60;

async function generateOne(imageBuffer, style, colorName, openaiKey) {
  const prompt = `Edit this photograph of a house. Replace ONLY the roof with a brand new ${colorName} ${style} roof. Keep the exact same house, same walls, same windows, same doors, same landscaping, same driveway, same trees, same sky, same everything else completely unchanged. Only the roof material and color should change to ${colorName} ${style}. The new roof should look freshly installed, clean, and photorealistic.`;

  const boundary = '----FormBoundary' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  const parts = [];
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-1`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n1024x1024`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\nhigh`);

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
    throw new Error(`OpenAI ${editRes.status}: ${errText.slice(0, 200)}`);
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { address, uploadedImage, roofStyle, colors, roofColor } = req.body || {};

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
      return res.status(502).json({
        error: 'All AI generations failed. Please try again.',
        details: failures.map(f => `${f.color.name}: ${f.error}`).join(' | '),
      });
    }

    return res.status(200).json({
      success: true,
      originalImage: originalDataUrl,
      generatedImages: successes.map(r => r.image),
      colors: successes.map(r => ({ name: r.color.name, hex: r.color.hex || null })),
      method: 'gpt-image-1',
      requested: colorList.length,
      delivered: successes.length,
      failed: failures.length,
      failures: failures.length ? failures.map(f => ({ name: f.color.name, error: f.error })) : undefined,
    });
  } catch (err) {
    console.error('Roof visualizer error:', err);
    return res.status(500).json({
      error: 'Failed to generate visualization. Please try again.',
      details: err.message,
    });
  }
}
