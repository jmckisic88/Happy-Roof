// Enhanced Daily SEO/AEO/GEO/GBP Audit v3
// GET /api/cron-seo-audit-v3?key=REFERRAL_ADMIN_KEY
// Crawls live pages + audits GBP + AI analysis + stores results for auto-implementation
// Runs as Vercel cron at 8am ET daily

import OpenAI from 'openai';
import { Resend } from 'resend';

// ── GBP Audit via Google Places API ──
// Uses the same GOOGLE_PLACES_API_KEY and Place ID as cron-reviews.js
const GBP_PLACE_ID = 'ChIJDeNr86jtwogRkhTNT5PR1Qo';

async function auditGbp() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { available: false, reason: 'GOOGLE_PLACES_API_KEY not configured' };
  }

  const gbpData = { available: true, issues: [], stats: {} };

  try {
    // Fetch place details by Place ID (not text search — avoids wrong business match)
    const placesRes = await fetch(`https://places.googleapis.com/v1/places/${GBP_PLACE_ID}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'displayName', 'rating', 'userRatingCount',
          'reviews', 'photos', 'currentOpeningHours',
          'regularOpeningHours', 'websiteUri', 'nationalPhoneNumber',
          'internationalPhoneNumber', 'formattedAddress',
          'primaryType', 'types', 'editorialSummary',
          'businessStatus', 'googleMapsUri',
        ].join(','),
      },
    });

    if (!placesRes.ok) {
      const err = await placesRes.text();
      return { available: false, reason: `Places API error: ${err}` };
    }

    const place = await placesRes.json();

    // ── Reviews ──
    const reviews = place.reviews || [];
    gbpData.stats.totalReviews = place.userRatingCount || reviews.length;
    gbpData.stats.averageRating = place.rating || 0;
    gbpData.stats.reviewsReturned = reviews.length;

    // Check for owner responses
    const replied = reviews.filter(r => r.authorAttribution?.displayName && r.text?.text);
    // Places API doesn't expose owner replies directly, but we track review count
    if (gbpData.stats.totalReviews < 10) {
      gbpData.issues.push({
        priority: 'HIGH',
        issue: `Only ${gbpData.stats.totalReviews} Google reviews. Businesses with 10+ reviews rank significantly higher in local pack. Actively request reviews from satisfied customers after each completed project.`,
        type: 'gbp_reviews',
      });
    }

    // Check for recent reviews (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recentReviews = reviews.filter(r => r.publishTime && new Date(r.publishTime) > thirtyDaysAgo);
    gbpData.stats.recentReviews = recentReviews.length;
    if (recentReviews.length === 0) {
      gbpData.issues.push({
        priority: 'MEDIUM',
        issue: 'No new Google reviews in the last 30 days. Review velocity is a ranking factor — aim for 2-4 new reviews per month.',
        type: 'gbp_reviews',
      });
    }

    // Include actual review content for AI analysis
    gbpData.stats.reviewSummary = reviews.slice(0, 5).map(r => ({
      author: r.authorAttribution?.displayName || 'Anonymous',
      rating: r.rating,
      text: (r.text?.text || '').substring(0, 200),
      date: r.publishTime,
    }));

    // ── Photos ──
    const photos = place.photos || [];
    gbpData.stats.photoCount = photos.length;
    if (photos.length < 10) {
      gbpData.issues.push({
        priority: 'MEDIUM',
        issue: `Only ${photos.length} photos on GBP listing. Businesses with 100+ photos get 520% more calls and 2,717% more direction requests. Upload project photos, team photos, before/after shots, and truck/equipment photos.`,
        type: 'gbp_photos',
      });
    }

    // ── NAP Consistency ──
    gbpData.stats.phone = place.nationalPhoneNumber || place.internationalPhoneNumber || '';
    gbpData.stats.website = place.websiteUri || '';
    gbpData.stats.address = place.formattedAddress || '';
    gbpData.stats.businessStatus = place.businessStatus || '';

    if (gbpData.stats.phone && !gbpData.stats.phone.replace(/\D/g, '').includes('8135957663')) {
      gbpData.issues.push({
        priority: 'CRITICAL',
        issue: `GBP phone (${gbpData.stats.phone}) doesn't match website phone (813) 595-7663. NAP inconsistency hurts local SEO rankings.`,
        type: 'gbp_nap',
      });
    }

    if (gbpData.stats.website && !gbpData.stats.website.includes('happyroof.com')) {
      gbpData.issues.push({
        priority: 'CRITICAL',
        issue: `GBP website URL (${gbpData.stats.website}) doesn't point to happyroof.com. Fix immediately.`,
        type: 'gbp_nap',
      });
    }

    // ── Business Hours ──
    gbpData.stats.hasHours = !!(place.regularOpeningHours?.periods?.length);
    gbpData.stats.hoursDescription = place.regularOpeningHours?.weekdayDescriptions || [];
    if (!gbpData.stats.hasHours) {
      gbpData.issues.push({
        priority: 'HIGH',
        issue: 'GBP business hours not set. Set hours to match website (Mon-Fri 9am-5pm). Missing hours reduce visibility in "open now" searches.',
        type: 'gbp_profile',
      });
    } else {
      // Check if GBP hours match website hours (Mon-Fri 9am-5pm, closed Sat/Sun)
      const periods = place.regularOpeningHours?.periods || [];
      const weekdayOpen = periods.find(p => p.open?.day === 1);
      if (weekdayOpen && (weekdayOpen.open?.hour !== 9 || weekdayOpen.close?.hour !== 17)) {
        gbpData.issues.push({
          priority: 'HIGH',
          issue: `GBP weekday hours (${place.regularOpeningHours?.weekdayDescriptions?.[0] || 'unknown'}) don't match website hours (Mon-Fri 9:00 AM – 5:00 PM). NAP inconsistency.`,
          type: 'gbp_profile',
        });
      }
    }

    // ── Categories ──
    gbpData.stats.primaryType = place.primaryType || 'Not set';
    gbpData.stats.types = place.types || [];

    // ── Editorial Summary (Google's auto-generated description) ──
    gbpData.stats.editorialSummary = place.editorialSummary?.text || 'None generated yet';

    // ── Google Maps link ──
    gbpData.stats.googleMapsUri = place.googleMapsUri || '';

    // ── General GBP best-practice checks ──
    // Posts (not available via Places API — flag as manual check)
    gbpData.issues.push({
      priority: 'MEDIUM',
      issue: 'GBP posts cannot be audited via API. Manually verify: are you posting weekly updates about completed projects, promotions, or roofing tips? Stale profiles rank lower.',
      type: 'gbp_posts',
    });

    // Q&A (not available via Places API — flag as manual check)
    gbpData.issues.push({
      priority: 'MEDIUM',
      issue: 'GBP Q&A cannot be audited via API. Manually check for unanswered questions on your Google Business Profile and respond promptly. Consider pre-seeding common questions.',
      type: 'gbp_qa',
    });

  } catch (e) {
    return { available: false, reason: `Places API error: ${e.message}` };
  }

  return gbpData;
}

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

  const openaiKey = process.env.OPENAI_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!openaiKey || !resendKey) {
    return res.status(500).json({ error: 'API keys not configured' });
  }

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });
  const isoDate = new Date().toISOString().slice(0, 10);

  try {
    // ── PHASE 1: Audit live pages ──
    const BASE = 'https://www.happyroof.com';
    const pages = [
      { path: '/', name: 'Homepage' },
      { path: '/services', name: 'Services' },
      { path: '/about', name: 'About' },
      { path: '/contact', name: 'Contact' },
      { path: '/referrals', name: 'Referrals' },
      { path: '/faq', name: 'FAQ' },
      { path: '/blog', name: 'Blog Index' },
      { path: '/roof-repair', name: 'Roof Repair' },
      { path: '/residential-roofing', name: 'Residential Roofing' },
      { path: '/tampa-roofing', name: 'Tampa Roofing' },
      { path: '/clearwater-roofing', name: 'Clearwater Roofing' },
      { path: '/st-petersburg-roofing', name: 'St. Petersburg Roofing' },
      { path: '/roof-inspection', name: 'Roof Inspection' },
      { path: '/reviews', name: 'Reviews' },
      { path: '/finance', name: 'Financing' },
      { path: '/eco-friendly-roofing', name: 'Eco-Friendly Roofing' },
    ];

    const fetches = pages.map(async (page) => {
      try {
        const resp = await fetch(BASE + page.path, {
          headers: { 'User-Agent': 'HappyRoofSEOBot/3.0' },
        });
        if (!resp.ok) return { page, issues: [`HTTP ${resp.status}`], html: '' };
        const html = await resp.text();

        const issues = [];

        // Title check
        const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
        if (!titleMatch || !titleMatch[1].trim()) issues.push('Missing title');
        else if (titleMatch[1].length > 70) issues.push(`Title too long (${titleMatch[1].length} chars)`);

        // Meta description
        const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
        if (!descMatch || !descMatch[1].trim()) issues.push('Missing meta description');
        else if (descMatch[1].length > 170) issues.push(`Meta description too long (${descMatch[1].length} chars)`);

        // Schema
        if (!html.includes('application/ld+json')) issues.push('Missing JSON-LD schema');

        // H1
        if (!html.match(/<h1[\s>]/i)) issues.push('Missing H1 tag');

        // dateModified freshness
        const modMatch = html.match(/dateModified[^"]*"([^"]+)"/);
        if (modMatch) {
          const modDate = new Date(modMatch[1]);
          const daysSince = (Date.now() - modDate.getTime()) / 86400000;
          if (daysSince > 30) issues.push(`dateModified is ${Math.round(daysSince)} days old`);
        }

        // FAQ schema for AEO
        const hasFaq = html.includes('FAQPage');

        return { page, issues, hasFaq };
      } catch (e) {
        return { page, issues: [`Fetch error: ${e.message}`] };
      }
    });

    const auditResults = await Promise.all(fetches);

    // Build audit summary
    let auditSummary = 'SITE AUDIT RESULTS:\n';
    let totalIssues = 0;
    auditResults.forEach(r => {
      if (r.issues && r.issues.length > 0) {
        auditSummary += `${r.page.name} (${r.page.path}): ${r.issues.join(', ')}\n`;
        totalIssues += r.issues.length;
      }
    });
    if (totalIssues === 0) auditSummary += 'All pages passed technical checks.\n';

    const faqPages = auditResults.filter(r => r.hasFaq).map(r => r.page.name);
    auditSummary += `\nPages with FAQPage schema: ${faqPages.join(', ') || 'None'}\n`;

    // ── PHASE 2: GBP Audit (via Google Places API — same key as cron-reviews) ──
    const gbpAudit = await auditGbp();

    let gbpSummary = '\nGOOGLE BUSINESS PROFILE AUDIT:\n';
    if (!gbpAudit.available) {
      gbpSummary += `GBP data not available (${gbpAudit.reason}). Providing general GBP recommendations based on best practices.\n`;
    } else {
      const s = gbpAudit.stats;
      gbpSummary += `Reviews: ${s.totalReviews || 0} total, ${s.averageRating || 'N/A'} avg rating\n`;
      gbpSummary += `Recent reviews (30 days): ${s.recentReviews || 0}\n`;
      gbpSummary += `Photos on listing: ${s.photoCount || 0}\n`;
      gbpSummary += `Phone on GBP: ${s.phone || 'Not found'}\n`;
      gbpSummary += `Website on GBP: ${s.website || 'Not found'}\n`;
      gbpSummary += `Address: ${s.address || 'Not found'}\n`;
      gbpSummary += `Business status: ${s.businessStatus || 'Unknown'}\n`;
      gbpSummary += `Hours set: ${s.hasHours ? 'Yes' : 'No'}\n`;
      gbpSummary += `Primary type: ${s.primaryType || 'Not set'}\n`;
      gbpSummary += `All types: ${s.types?.join(', ') || 'None'}\n`;
      gbpSummary += `Google editorial summary: ${s.editorialSummary || 'None'}\n`;

      if (s.reviewSummary && s.reviewSummary.length > 0) {
        gbpSummary += `\nRecent Reviews:\n`;
        s.reviewSummary.forEach(r => {
          gbpSummary += `  - ${r.rating}/5 by ${r.author} (${r.date?.substring(0, 10) || 'N/A'}): "${r.text}"\n`;
        });
      }

      if (gbpAudit.issues.length > 0) {
        gbpSummary += `\nGBP Issues Found:\n`;
        gbpAudit.issues.forEach(i => {
          gbpSummary += `- [${i.priority}] ${i.issue}\n`;
        });
      } else {
        gbpSummary += '\nNo GBP issues found.\n';
      }
    }

    // ── PHASE 3: AI Research + Analysis ──
    const openai = new OpenAI({ apiKey: openaiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 5000,
      messages: [
        {
          role: 'system',
          content: `You are an AEO (Answer Engine Optimization) specialist for Happy Roof (happyroof.com), a roofing contractor in Tampa Bay, FL. Your PRIMARY focus is AEO. SEO, GEO, and GBP are secondary.

═══ EXISTING SITE INVENTORY (DO NOT RECOMMEND CREATING ANY OF THESE) ═══

PAGES THAT EXIST:
- /faq — 44 FAQPage schema Q&As covering: service areas, licensing, estimates, company history, emergency services, process, timeline, permits, cleanup, materials (shingles/metal/tile/TPO), warranties, financing, insurance claims, storm damage, energy efficiency, eco-friendly, solar-ready, cool roofs, hurricane prep
- /eco-friendly-roofing — Dedicated page with 6 solution cards (metal, cool shingles, reflective tile, radiant barrier, ventilation, solar-ready), energy savings stats, 5 FAQ schema Q&As on energy efficiency and sustainability
- /blog — 13 blog posts with category filter tabs, each post has FAQPage + BlogPosting schema
- /reviews — Dynamic reviews page pulling live data from Google Places API
- 10 city roofing pages (Tampa, St. Pete, Clearwater, Largo, Oldsmar, Palm Harbor, Dunedin, Tarpon Springs, Safety Harbor, Pinellas Park) — each with city-specific FAQ schema, GBP-pinned Google Maps, Related Services cross-links
- 16 city sub-pages (roof repair, replacement, inspection per city) — each with service+city FAQ schema
- /residential-roofing — 5 FAQ schema Q&As on residential costs, materials, timeline, warranty, licensing
- /commercial-roofing — 7 FAQ schema Q&As including TPO roofing benefits and lifespan
- /roof-repair — 6 FAQ schema Q&As including flat/TPO repair
- /roof-inspection, /roof-maintenance, /storm-damage-repair, /emergency-roof-repair — all with FAQ schema
- /roof-cost-calculator, /roof-replacement-cost — pricing content with schema

FEATURES THAT EXIST:
- FAQPage schema on virtually every page (DO NOT suggest "add FAQ schema")
- LocalBusiness + RoofingContractor schema on all pages
- BreadcrumbList schema on key pages
- BlogPosting schema on all blog posts
- AggregateRating schema (6 reviews, 5.0 stars)
- llms.txt and robots.txt allowing all AI bots (GPTBot, PerplexityBot, ClaudeBot)
- Blog category filter tabs (Materials, Insurance, Education, Process, Maintenance, Emergency, Codes, Commercial, Hiring)
- Business hours: Mon-Fri 9am-5pm (matches GBP exactly)
- Google Maps embed pinned to GBP listing on all 26 location pages
- Energy/sustainability FAQ category on /faq page

═══ RULES (VIOLATIONS MAKE THE REPORT USELESS) ═══

1. NEVER recommend creating a page, FAQ section, or feature listed above. If you suggest "create a roofing FAQ page" or "add energy efficiency content" or "add FAQ schema to pages" — you are wrong, it already exists.
2. NEVER recommend vague actions like "improve content structure" or "add more FAQs." Every recommendation must name a SPECIFIC question, a SPECIFIC page URL, and a SPECIFIC reason.
3. Before recommending ANY new content, verify it doesn't overlap with existing pages/FAQs listed above.
4. If something is already well-implemented, say "DONE: [feature] is already in place" and move on. Do NOT pad the report with praise or restatements.
5. Focus recommendations on NET-NEW value: queries the site doesn't target yet, structural improvements to existing content, or emerging AEO patterns the site hasn't adopted.
6. Classify each recommendation as: "website" / "gbp" / "external"
7. Maximum 5 recommendations per section. Quality over quantity.`
        },
        {
          role: 'user',
          content: `Today is ${today}. Generate the daily AEO-focused audit for Happy Roof (happyroof.com).

Technical audit from ${pages.length} live pages:
${auditSummary}

${gbpSummary}

REMINDER: Read the EXISTING SITE INVENTORY in your system prompt before making any recommendation. If your recommendation overlaps with something already listed there, delete it and replace with "DONE: [feature] already exists."

Format:

1. ALGORITHM & TREND UPDATES — Only confirmed changes this week. No speculation.

2. AEO FINDINGS & RECOMMENDATIONS (PRIMARY, max 5 items) — Net-new opportunities only. For each:
   - What specific query or pattern is the site missing?
   - Which specific page URL should be changed?
   - What exact content/schema change would improve AI citation?
   - Classification: website/gbp/external
   DO NOT recommend: adding FAQ schema (already on every page), creating an FAQ page (exists with 44 Q&As), adding energy efficiency content (eco-friendly page exists), or improving blog structure (already well-structured with schema).

3. SEO FINDINGS (max 3 items) — Only technical issues found in the scan above. No AEO repeats.

4. GEO FINDINGS (max 2 items) — Entity/citation issues only.

5. GBP FINDINGS (max 3 items) — Specific actions based on the live GBP data above.

6. COMPETITIVE INTELLIGENCE — AEO-specific competitor moves only.

7. NEW CONTENT — Only if you can name the exact query AND confirm it's not covered by existing pages listed in your system prompt. If it's already covered, say "DONE: covered by [page]."

8. OVERALL GRADE (A+ through C) — Weight AEO readiness heavily.`
        }
      ],
    });

    const report = completion.choices[0].message.content;

    // ── PHASE 4: Send report via Resend ──
    const resend = new Resend(resendKey);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Happy Roof Reports <onboarding@resend.dev>',
      to: ['jmckisic@gmail.com'],
      subject: `Daily AEO/SEO/GEO/GBP Audit | ${today}`,
      text: report,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(502).json({ success: false, error: emailError.message });
    }

    return res.status(200).json({
      success: true,
      emailId: emailData.id,
      date: today,
      technicalIssues: totalIssues,
      pagesAudited: pages.length,
      gbpAvailable: gbpAudit.available,
      gbpIssueCount: (gbpAudit.issues || []).length,
    });

  } catch (err) {
    console.error('SEO audit v3 error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
