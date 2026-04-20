// Roof Visualizer API v2
// POST /api/roof-visualizer
// Takes an address or uploaded image + roof style
// Uses gpt-image-1 to edit the ACTUAL photo, changing only the roof

import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { address, uploadedImage, roofStyle, roofColor } = req.body;

  if (!address && !uploadedImage) {
    return res.status(400).json({ error: 'Address or uploaded image is required' });
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const style = roofStyle || 'architectural shingle';
  const color = roofColor || 'charcoal gray';

  try {
    let imageBuffer;
    let originalDataUrl;

    if (uploadedImage) {
      // User uploaded a photo
      const base64Data = uploadedImage.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
      originalDataUrl = uploadedImage;
    } else {
      // Fetch Street View image
      if (!googleKey) {
        return res.status(500).json({ error: 'Google API key not configured' });
      }

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

    // Write image to temp file (required for multipart form upload)
    const tmpPath = join(tmpdir(), `roof-viz-${Date.now()}.jpg`);
    await writeFile(tmpPath, imageBuffer);

    // Use gpt-image-1 to edit the actual photo
    const prompt = `Edit this photograph of a house. Replace ONLY the roof with a brand new ${color} ${style} roof. Keep the exact same house, same walls, same windows, same doors, same landscaping, same driveway, same trees, same sky, same everything else completely unchanged. Only the roof material and color should change to ${color} ${style}. The new roof should look freshly installed, clean, and photorealistic.`;

    // Build multipart form data manually
    const boundary = '----FormBoundary' + Date.now();
    const parts = [];

    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-1`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n1024x1024`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\nhigh`);

    // Image part
    const imageHeader = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="house.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const imageFooter = `\r\n--${boundary}--\r\n`;

    const headerBuf = Buffer.from(imageHeader);
    const footerBuf = Buffer.from(imageFooter);
    const textParts = Buffer.from(parts.join('\r\n') + '\r\n');
    const body = Buffer.concat([textParts, headerBuf, imageBuffer, footerBuf]);

    const editRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    // Clean up temp file
    try { await unlink(tmpPath); } catch (e) { /* ignore */ }

    if (!editRes.ok) {
      const errText = await editRes.text();
      console.error('gpt-image-1 error:', editRes.status, errText);
      return res.status(502).json({
        error: 'Failed to generate roof visualization. Please try again.',
        details: `OpenAI returned ${editRes.status}`,
      });
    }

    const editData = await editRes.json();
    const generatedB64 = editData.data?.[0]?.b64_json;
    const generatedUrl = editData.data?.[0]?.url;

    let generatedImage;
    if (generatedB64) {
      generatedImage = `data:image/png;base64,${generatedB64}`;
    } else if (generatedUrl) {
      // Fetch the URL and convert to base64
      const imgResp = await fetch(generatedUrl);
      const imgBuf = Buffer.from(await imgResp.arrayBuffer());
      generatedImage = `data:image/png;base64,${imgBuf.toString('base64')}`;
    }

    if (!generatedImage) {
      return res.status(502).json({
        error: 'No image returned from AI. Please try again.',
      });
    }

    return res.status(200).json({
      success: true,
      originalImage: originalDataUrl,
      generatedImage: generatedImage,
      method: 'gpt-image-1',
      style: `${color} ${style}`,
    });

  } catch (err) {
    console.error('Roof visualizer error:', err);
    return res.status(500).json({
      error: 'Failed to generate visualization. Please try again.',
      details: err.message,
    });
  }
}
