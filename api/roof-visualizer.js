// Roof Visualizer API
// POST /api/roof-visualizer
// Takes an address or uploaded image + roof style
// Uses GPT-4o image editing to modify ONLY the roof on the actual photo

import OpenAI from 'openai';

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
    let imageBase64;
    let originalDataUrl;

    if (uploadedImage) {
      // User uploaded a photo directly
      imageBase64 = uploadedImage.replace(/^data:image\/\w+;base64,/, '');
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
      const imgBuffer = await imgRes.arrayBuffer();
      imageBase64 = Buffer.from(imgBuffer).toString('base64');
      originalDataUrl = `data:image/jpeg;base64,${imageBase64}`;
    }

    // Use GPT-4o to edit the actual photo
    const openai = new OpenAI({ apiKey: openaiKey });

    const editPrompt = `Edit this photograph of a house. Replace ONLY the roof with a brand new ${color} ${style} roof. Keep the exact same house, same walls, same windows, same landscaping, same driveway, same trees, same sky, same everything else. Only the roof should change. The new ${style} roof should look:
- Freshly installed and clean
- The correct ${color} color
- Realistic and photographic (not a rendering)
- Properly fitted to the existing house shape and roofline
Do NOT change anything except the roof. The output should look like the exact same photo with just a new roof installed.`;

    const response = await openai.responses.create({
      model: 'gpt-4o',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${imageBase64}`,
            },
            {
              type: 'input_text',
              text: editPrompt,
            },
          ],
        },
      ],
      tools: [{ type: 'image_generation', size: '1024x1024', quality: 'high' }],
    });

    // Extract the generated image from the response
    let generatedImage = null;
    for (const item of response.output) {
      if (item.type === 'image_generation_call' && item.result) {
        generatedImage = `data:image/png;base64,${item.result}`;
        break;
      }
    }

    if (!generatedImage) {
      // Try alternate response format
      for (const item of response.output) {
        if (item.content) {
          for (const c of item.content) {
            if (c.type === 'image' && c.image_url) {
              generatedImage = c.image_url;
              break;
            }
          }
        }
      }
    }

    if (!generatedImage) {
      console.error('No image in GPT-4o response:', JSON.stringify(response.output).substring(0, 500));
      return res.status(502).json({
        error: 'AI could not generate the roof visualization. Please try again.',
        details: 'No image in response',
      });
    }

    return res.status(200).json({
      success: true,
      originalImage: originalDataUrl,
      generatedImage: generatedImage,
      method: 'gpt-4o-edit',
      style: `${color} ${style}`,
    });

  } catch (err) {
    console.error('Roof visualizer error:', err.message || err);
    return res.status(500).json({
      error: 'Failed to generate visualization. Please try again.',
      details: err.message,
    });
  }
}
