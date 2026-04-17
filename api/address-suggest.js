// Address Autocomplete via Google Places API
// GET /api/address-suggest?q=123+Main+St
// Returns address suggestions for the autocomplete input

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const query = (req.query.q || '').trim();
  if (!query || query.length < 3) {
    return res.status(400).json({ suggestions: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ['street_address', 'subpremise', 'premise'],
        includedRegionCodes: ['us'],
        locationBias: {
          circle: {
            center: { latitude: 28.0, longitude: -82.6 },
            radius: 80000,
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Places autocomplete error:', err);
      return res.status(200).json({ suggestions: [] });
    }

    const data = await response.json();
    const suggestions = (data.suggestions || [])
      .filter(s => s.placePrediction)
      .map(s => s.placePrediction.text.text)
      .slice(0, 5);

    return res.status(200).json({ suggestions });
  } catch (err) {
    console.error('Address suggest error:', err);
    return res.status(200).json({ suggestions: [] });
  }
}
