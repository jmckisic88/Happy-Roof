// Enhanced Daily SEO/AEO/GEO Audit v2
// GET /api/cron-seo-audit-v2?key=REFERRAL_ADMIN_KEY
// Uses OpenAI to research trends + audits live pages + sends via Resend
// Runs as Vercel cron at 8am ET daily

import OpenAI from 'openai';
import { Resend } from 'resend';

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
    ];

    // Fetch all pages in parallel
    const fetches = pages.map(async (page) => {
      try {
        const resp = await fetch(BASE + page.path, {
          headers: { 'User-Agent': 'HappyRoofSEOBot/2.0' },
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

        // First 200 words check for AEO answer-first
        const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 1000);

        return { page, issues, hasFaq, bodyPreview: bodyText.substring(0, 300) };
      } catch (e) {
        return { page, issues: [`Fetch error: ${e.message}`] };
      }
    });

    const auditResults = await Promise.all(fetches);

    // Build audit summary for OpenAI
    let auditSummary = 'SITE AUDIT RESULTS:\n';
    let totalIssues = 0;
    auditResults.forEach(r => {
      if (r.issues && r.issues.length > 0) {
        auditSummary += `${r.page.name} (${r.page.path}): ${r.issues.join(', ')}\n`;
        totalIssues += r.issues.length;
      }
    });
    if (totalIssues === 0) auditSummary += 'All 15 pages passed technical checks.\n';

    const faqPages = auditResults.filter(r => r.hasFaq).map(r => r.page.name);
    auditSummary += `\nPages with FAQPage schema: ${faqPages.join(', ') || 'None'}\n`;

    // ── PHASE 2: AI Research + Analysis ──
    const openai = new OpenAI({ apiKey: openaiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4000,
      messages: [
        {
          role: 'system',
          content: `You are a world-class SEO/AEO/GEO strategist for a roofing contractor in Tampa Bay, Florida called Happy Roof (happyroof.com). You produce daily audit reports with equal weight given to SEO, AEO (Answer Engine Optimization), and GEO (Generative Engine Optimization).

Your knowledge includes the latest search algorithm changes, AI search optimization strategies, and competitive intelligence for the roofing and home services industry. Focus on Tampa Bay but leverage insights from other major markets (Dallas, Phoenix, Miami) when relevant.

Also consider broader trades and construction services for cross-industry insights.

Be specific and actionable. Don't manufacture issues. Only suggest new pages, backlinks, or content when there's genuine evidence of value.`
        },
        {
          role: 'user',
          content: `Today is ${today}. Generate a comprehensive daily SEO/AEO/GEO audit report for Happy Roof (happyroof.com).

Here are the technical audit results from scanning 15 live pages:
${auditSummary}

The site has:
- 12 blog posts
- 25+ location-specific pages with Google Maps + keywords
- llms.txt for AI crawlers
- robots.txt allowing all AI bots (GPTBot, PerplexityBot, ClaudeBot)
- 4 Google reviews (5.0 stars)
- Owens Corning Preferred Installer certification
- FL License #CCC1337380
- Up to 15-year workmanship warranty
- Referral program with unique link system
- Enhancify financing partnership

Format the report with these sections:
1. ALGORITHM & TREND UPDATES - What's new in Google, AI search, AEO, GEO this week. Include any confirmed algorithm changes, emerging trends, or shifts in how AI engines cite local businesses.

2. SEO FINDINGS & RECOMMENDATIONS - Technical and on-page issues. Each with Priority (Critical/High/Medium/Low), specific action, and why it matters.

3. AEO FINDINGS & RECOMMENDATIONS - How well the site is structured for answer engines (ChatGPT, Perplexity, Google AI Overviews, voice search). Focus on content structure, FAQ optimization, direct-answer formatting.

4. GEO FINDINGS & RECOMMENDATIONS - How well the site performs in generative search. Entity consistency, citation likelihood, schema completeness, PR/media mentions, multi-platform presence.

5. COMPETITIVE INTELLIGENCE - What top Tampa Bay roofers and top roofers in other major markets are doing. What can Happy Roof learn from the best home services/construction websites nationally?

6. NEW PAGES / BACKLINKS / CONTENT SUGGESTIONS - Only include if genuinely valuable. Cite evidence (competitor ranking for a term, specific directory opportunity, content gap with search demand).

7. OVERALL GRADE (A+ through C) with brief justification.

Keep the report actionable and specific to happyroof.com. No generic advice.`
        }
      ],
    });

    const report = completion.choices[0].message.content;

    // ── PHASE 3: Send via Resend ──
    const resend = new Resend(resendKey);
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Happy Roof Reports <onboarding@resend.dev>',
      to: ['jmckisic@gmail.com'],
      subject: `Daily SEO/AEO/GEO Audit | ${today}`,
      text: report,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(502).json({ success: false, error: emailError.message });
    }

    // Disable the old remote agent since this replaces it
    return res.status(200).json({
      success: true,
      emailId: emailData.id,
      date: today,
      technicalIssues: totalIssues,
      pagesAudited: pages.length,
    });

  } catch (err) {
    console.error('SEO audit v2 error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
