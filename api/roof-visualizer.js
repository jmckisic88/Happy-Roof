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

  try {
    // Step 1: Get Street View image of the home
    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=1024x768&location=${encodeURIComponent(address)}&key=${googleKey}&fov=90&pitch=15`;

    // Check if Street View image exists
    const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${googleKey}`;
    const metaRes = await fetch(metaUrl);
    const meta = await metaRes.json();

    if (meta.status !== 'OK') {
      return res.status(404).json({
        error: 'No Street View image available for this address',
        status: meta.status,
      });
    }

    // Step 2: Fetch the actual Street View image as base64
    const imgRes = await fetch(streetViewUrl);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64Image = Buffer.from(imgBuffer).toString('base64');
    const imageDataUrl = `data:image/jpeg;base64,${base64Image}`;

    // Step 3: Send to OpenAI to generate roof visualization
    const style = roofStyle || 'architectural shingle';
    const color = roofColor || 'charcoal gray';

    const prompt = `Edit this photo of a house to show what it would look like with a brand new ${color} ${style} roof. Only change the roof - keep the rest of the house, landscaping, driveway, and surroundings exactly the same. The new roof should look realistic, professionally installed, and match the architectural style of the home. Make the roof look clean, new, and high-quality.`;

    const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: (() => {
        // Convert base64 to a Blob for the multipart form
        const formData = new FormData();
        const imageBlob = new Blob([Buffer.from(base64Image, 'base64')], { type: 'image/png' });
        formData.append('image', imageBlob, 'house.png');
        formData.append('prompt', prompt);
        formData.append('n', '1');
        formData.append('size', '1024x1024');
        formData.append('response_format', 'b64_json');
        return formData;
      })(),
    });

    if (!openaiRes.ok) {
      // Fallback: use DALL-E to generate based on description
      const fallbackRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: `A photorealistic image of a beautiful Florida home with a brand new ${color} ${style} roof. The home is in a Tampa Bay neighborhood with palm trees, green lawn, and clear sky. The roof should look professionally installed, clean, and modern. Show the full front of the house with the driveway visible. The style should match typical Florida residential architecture.`,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          response_format: 'b64_json',
        }),
      });

      if (!fallbackRes.ok) {
        const errText = await fallbackRes.text();
        console.error('OpenAI fallback error:', errText);
        return res.status(502).json({ error: 'Failed to generate visualization' });
      }

      const fallbackData = await fallbackRes.json();
      return res.status(200).json({
        success: true,
        originalImage: imageDataUrl,
        generatedImage: `data:image/png;base64,${fallbackData.data[0].b64_json}`,
        method: 'generation',
        style: `${color} ${style}`,
      });
    }

    const editData = await openaiRes.json();
    return res.status(200).json({
      success: true,
      originalImage: imageDataUrl,
      generatedImage: `data:image/png;base64,${editData.data[0].b64_json}`,
      method: 'edit',
      style: `${color} ${style}`,
    });

  } catch (err) {
    console.error('Roof visualizer error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
