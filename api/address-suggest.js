// Address Autocomplete via Google Places API (server-side proxy)
// GET /api/address-suggest?q=123+Main+St&session=<uuid>
//
// Response shape (backward compatible):
//   {
//     suggestions: ['123 Main St, Tampa, FL 33601', ...],     // legacy string array
//     predictions: [                                          // NEW: rich shape
//       { text: '123 Main St, Tampa, FL 33601', placeId: '...' },
//       ...
//     ]
//   }
//
// The rich `predictions` array is consumed by the hero form so we can
// look the placeId back up via /api/place-details for structured
// address components (street, city, state, zip, lat, lng).
//
// Session token: Google bills Autocomplete + Details as ONE session
// when the same session token is passed through both calls. The client
// generates a UUID once per typing session and passes it here + to
// /api/place-details, so we do not double-charge for the same lookup.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const query = (req.query.q || '').trim();
  const session = (req.query.session || '').trim();
  if (!query || query.length < 3) {
    return res.status(400).json({ suggestions: [], predictions: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    // Graceful degrade: client keeps the plain input working.
    return res.status(500).json({ error: 'API key not configured', suggestions: [], predictions: [] });
  }

  try {
    const body = {
      input: query,
      includedRegionCodes: ['us'],
      locationBias: {
        circle: {
          // Roughly Tampa Bay (Oldsmar HQ) + 50km radius
          center: { latitude: 28.0, longitude: -82.6 },
          radius: 50000,
        },
      },
    };
    if (session) body.sessionToken = session;

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Places autocomplete error:', err);
      return res.status(200).json({ suggestions: [], predictions: [] });
    }

    const data = await response.json();
    const raw = (data.suggestions || []).filter(s => s.placePrediction);
    const predictions = raw.slice(0, 5).map(s => ({
      text: s.placePrediction.text && s.placePrediction.text.text ? s.placePrediction.text.text : '',
      placeId: s.placePrediction.placeId || '',
    }));
    const suggestions = predictions.map(p => p.text);

    return res.status(200).json({ suggestions, predictions });
  } catch (err) {
    console.error('Address suggest error:', err);
    return res.status(200).json({ suggestions: [], predictions: [] });
  }
}
