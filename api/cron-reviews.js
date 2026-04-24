// Daily Google Reviews Sync
// GET /api/cron-reviews?key=REFERRAL_ADMIN_KEY
// Fetches reviews from Google Places API, saves to Vercel Blob,
// and emails when new reviews are detected

import { writeBlob, readBlob } from './_blob-store.js';
import { sendEmail } from './_send-email.js';

const PLACE_ID = 'ChIJDeNr86jtwogRkhTNT5PR1Qo';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = process.env.REFERRAL_ADMIN_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const keyMatch = adminKey && req.query.key === adminKey;
  const cronMatch = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!keyMatch && !cronMatch) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY not configured' });
  }

  try {
    // Fetch reviews from Google Places API
    // Fetch by Place ID directly (not text search — avoids wrong business match)
    const placesRes = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews',
      },
    });

    if (!placesRes.ok) {
      const err = await placesRes.text();
      return res.status(502).json({ error: 'Google API error', details: err });
    }

    const place = await placesRes.json();

    const rating = place.rating;
    const reviewCount = place.userRatingCount;
    const reviews = (place.reviews || []).map(r => ({
      author: r.authorAttribution?.displayName || 'Anonymous',
      rating: r.rating,
      text: r.text?.text || '',
      date: r.publishTime,
      photoUri: r.authorAttribution?.photoUri || null,
      googleMapsUri: r.googleMapsUri || null,
    }));

    // Load previous data to detect new reviews
    const previous = await readBlob('google-reviews', null);
    const previousCount = previous?.reviewCount || 0;
    const isNewReview = reviewCount > previousCount;

    // Save current data to blob
    const reviewData = {
      rating,
      reviewCount,
      reviews,
      lastUpdated: new Date().toISOString(),
      placeId: PLACE_ID,
    };

    await writeBlob('google-reviews', reviewData);

    // Email notification if new review detected
    if (isNewReview && previous) {
      const newReviews = reviews.filter(r => {
        return !previous.reviews?.some(pr => pr.author === r.author && pr.text === r.text);
      });

      const today = new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
      });

      let message = `NEW GOOGLE REVIEW DETECTED\n${'='.repeat(40)}\n\n`;
      message += `Total Reviews: ${reviewCount} (was ${previousCount})\n`;
      message += `Overall Rating: ${rating} stars\n\n`;

      newReviews.forEach(r => {
        message += `${'*'.repeat(5)} (${r.rating} stars)\n`;
        message += `"${r.text}"\n`;
        message += `- ${r.author}\n`;
        message += `Posted: ${new Date(r.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}\n\n`;
      });

      message += `View on Google Maps: https://g.page/r/CZIUzU-T0dUKEBM/review`;

      await sendEmail({
        subject: `New Google Review! ${reviewCount} total (${rating} stars) | ${today}`,
        message,
      });
    }

    return res.status(200).json({
      success: true,
      rating,
      reviewCount,
      reviewsFetched: reviews.length,
      newReviewDetected: isNewReview,
      lastUpdated: reviewData.lastUpdated,
    });
  } catch (err) {
    console.error('Reviews cron error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
