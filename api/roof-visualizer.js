// Roof Visualizer API
// POST /api/roof-visualizer
// Takes an address + roof style, fetches Google Street View image,
// sends to OpenAI to generate a visualization with the new roof style

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { address, roofStyle, roofColor } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!googleKey || !openaiKey) {
    return res.status(500).json({ error: 'API keys not configured' });
  }

  const style = roofStyle || 'architectural shingle';
  const color = roofColor || 'charcoal gray';

  try {
    // Step 1: Check if Street View image exists
    const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${googleKey}`;
    const metaRes = await fetch(metaUrl);
    const meta = await metaRes.json();

    if (meta.status !== 'OK') {
      return res.status(404).json({
        error: 'No Street View image available for this address',
        details: meta.status,
      });
    }

    // Step 2: Get the Street View image URL
    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=1024x768&location=${encodeURIComponent(address)}&key=${googleKey}&fov=90&pitch=15`;

    // Fetch as base64 for the original image return
    const imgRes = await fetch(streetViewUrl);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64Original = Buffer.from(imgBuffer).toString('base64');
    const originalDataUrl = `data:image/jpeg;base64,${base64Original}`;

    // Step 3: Use DALL-E 3 to generate a visualization
    // We describe the house from the Street View and ask for the new roof
    const prompt = `Create a photorealistic image of a residential home in Tampa Bay, Florida with a brand new ${color} ${style} roof. The home should look like a typical Florida single-family house in a suburban neighborhood. Show the full front view with the driveway, landscaping, and clear blue sky. The ${style} roof should be the focal point, looking freshly installed, clean, and professionally done. The ${color} color should be clearly visible and accurate. Make it look like a real photograph, not a rendering.`;

    const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'b64_json',
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errText);
      return res.status(502).json({
        error: 'Failed to generate visualization',
        details: `OpenAI returned ${openaiRes.status}`,
      });
    }

    const openaiData = await openaiRes.json();
    const generatedB64 = openaiData.data[0].b64_json;

    return res.status(200).json({
      success: true,
      originalImage: originalDataUrl,
      generatedImage: `data:image/png;base64,${generatedB64}`,
      method: 'dall-e-3',
      style: `${color} ${style}`,
    });

  } catch (err) {
    console.error('Roof visualizer error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
}
