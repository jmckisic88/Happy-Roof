// Place Details via Google Places API (server-side proxy)
// GET /api/place-details?placeId=<id>&session=<uuid>
//
// Called by the hero-form autocomplete AFTER the customer picks a
// suggestion. Uses the same session token as /api/address-suggest so
// Google bills autocomplete + details as a single session.
//
// Response:
//   {
//     ok: true,
//     street: '123 Main St',
//     city: 'Tampa',
//     state: 'FL',
//     postal_code: '33601',
//     lat: 27.9506,
//     lng: -82.4572,
//     placeId: '...',
//     formattedAddress: '123 Main St, Tampa, FL 33601, USA'
//   }
//
// On any failure (missing key, upstream error, bad placeId) responds
// with { ok: false } and HTTP 200 so the client stays functional and
// simply falls back to submitting the raw typed address string.

const FIELD_MASK = [
  'id',
  'addressComponents',
  'location',
  'formattedAddress',
].join(',');

function componentValue(components, type, useShort = false) {
  if (!Array.isArray(components)) return '';
  const hit = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
  if (!hit) return '';
  return useShort ? (hit.shortText || hit.longText || '') : (hit.longText || hit.shortText || '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.happyroof.com');
  res.setHeader('Cache-Control', 'private, max-age=60');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const placeId = (req.query.placeId || '').trim();
  const session = (req.query.session || '').trim();
  if (!placeId) {
    return res.status(200).json({ ok: false, reason: 'missing_placeId' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ ok: false, reason: 'no_api_key' });
  }

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
    if (session) url.searchParams.set('sessionToken', session);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('Place details error:', response.status, errText);
      return res.status(200).json({ ok: false, reason: 'upstream_error', status: response.status });
    }

    const data = await response.json();
    const components = data.addressComponents || [];

    const streetNumber = componentValue(components, 'street_number');
    const route = componentValue(components, 'route');
    const street = [streetNumber, route].filter(Boolean).join(' ').trim();
    const city =
      componentValue(components, 'locality') ||
      componentValue(components, 'sublocality') ||
      componentValue(components, 'sublocality_level_1') ||
      componentValue(components, 'postal_town') ||
      componentValue(components, 'administrative_area_level_2');
    const state = componentValue(components, 'administrative_area_level_1', true);
    const postal_code = componentValue(components, 'postal_code');
    const lat = data.location && typeof data.location.latitude === 'number' ? data.location.latitude : null;
    const lng = data.location && typeof data.location.longitude === 'number' ? data.location.longitude : null;

    return res.status(200).json({
      ok: true,
      street,
      city,
      state,
      postal_code,
      lat,
      lng,
      placeId: data.id || placeId,
      formattedAddress: data.formattedAddress || '',
    });
  } catch (err) {
    console.error('Place details exception:', err);
    return res.status(200).json({ ok: false, reason: 'exception' });
  }
}
