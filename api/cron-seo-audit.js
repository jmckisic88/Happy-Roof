// Daily SEO/AIEO/GEO Audit — Self-Contained Cron Endpoint
// GET /api/cron-seo-audit?key=REFERRAL_ADMIN_KEY
// Fetches live site pages, audits SEO elements, emails report

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

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });

  try {
    // Pages to audit — key public-facing pages
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
      { path: '/commercial-roofing', name: 'Commercial Roofing' },
      { path: '/roof-inspection', name: 'Roof Inspection' },
      { path: '/tampa-roofing', name: 'Tampa Roofing' },
      { path: '/clearwater-roofing', name: 'Clearwater Roofing' },
      { path: '/st-petersburg-roofing', name: 'St. Petersburg Roofing' },
      { path: '/finance', name: 'Financing' },
      { path: '/reviews', name: 'Reviews' },
      { path: '/warranties', name: 'Warranties' },
      { path: '/roof-cost-calculator', name: 'Cost Calculator' },
      { path: '/foundation', name: 'Foundation' },
      { path: '/storm-damage-repair', name: 'Storm Damage' },
    ];

    const BASE = 'https://www.happyroof.com';
    const issues = [];
    const passing = [];
    let totalChecks = 0;
    let passedChecks = 0;

    // Fetch all pages in parallel for speed
    const fetches = pages.map(async (page) => {
      try {
        const resp = await fetch(BASE + page.path, {
          headers: { 'User-Agent': 'HappyRoofSEOBot/1.0' },
          redirect: 'follow',
        });
        if (!resp.ok) return { page, html: null, error: `HTTP ${resp.status}` };
        return { page, html: await resp.text(), error: null };
      } catch (e) {
        return { page, html: null, error: e.message };
      }
    });

    const results = await Promise.all(fetches);

    for (const { page, html, error } of results) {
      if (error || !html) {
        issues.push({ page: page.name, path: page.path, priority: 'CRITICAL', issue: error || 'Failed to fetch' });
        continue;
      }

        // Check: Title tag
        totalChecks++;
        const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
        if (!titleMatch || !titleMatch[1].trim()) {
          issues.push({ page: page.name, path: page.path, priority: 'CRITICAL', issue: 'Missing <title> tag' });
        } else {
          passedChecks++;
          const title = titleMatch[1];
          if (title.length > 70) {
            issues.push({ page: page.name, path: page.path, priority: 'LOW', issue: `Title too long (${title.length} chars, recommend <70): "${title.substring(0, 60)}..."` });
          }
        }

        // Check: Meta description
        totalChecks++;
        const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
        if (!descMatch || !descMatch[1].trim()) {
          issues.push({ page: page.name, path: page.path, priority: 'HIGH', issue: 'Missing or empty meta description' });
        } else {
          passedChecks++;
          const desc = descMatch[1];
          if (desc.length < 50) {
            issues.push({ page: page.name, path: page.path, priority: 'MEDIUM', issue: `Meta description too short (${desc.length} chars, recommend 120-160)` });
          } else if (desc.length > 170) {
            issues.push({ page: page.name, path: page.path, priority: 'LOW', issue: `Meta description too long (${desc.length} chars, recommend <160)` });
          }
        }

        // Check: Canonical URL
        totalChecks++;
        const canonMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i);
        if (!canonMatch) {
          issues.push({ page: page.name, path: page.path, priority: 'HIGH', issue: 'Missing canonical URL' });
        } else {
          passedChecks++;
        }

        // Check: H1 tag
        totalChecks++;
        const h1Match = html.match(/<h1[\s>]/i);
        if (!h1Match) {
          issues.push({ page: page.name, path: page.path, priority: 'MEDIUM', issue: 'Missing H1 tag' });
        } else {
          passedChecks++;
        }

        // Check: JSON-LD schema
        totalChecks++;
        const schemaMatch = html.match(/application\/ld\+json/i);
        if (!schemaMatch) {
          issues.push({ page: page.name, path: page.path, priority: 'HIGH', issue: 'Missing JSON-LD structured data' });
        } else {
          passedChecks++;
          // Check for dateModified
          totalChecks++;
          if (html.includes('dateModified')) {
            passedChecks++;
          } else {
            issues.push({ page: page.name, path: page.path, priority: 'MEDIUM', issue: 'Schema missing dateModified (AI engines prioritize fresh content)' });
          }
        }

        // Check: Open Graph tags
        totalChecks++;
        const ogTitle = html.match(/og:title/i);
        const ogDesc = html.match(/og:description/i);
        if (!ogTitle || !ogDesc) {
          issues.push({ page: page.name, path: page.path, priority: 'LOW', issue: 'Missing OG title or description (affects social sharing)' });
        } else {
          passedChecks++;
        }

        // Check: Image alt text (sample)
        totalChecks++;
        const imgs = html.match(/<img[^>]+>/gi) || [];
        const imgsWithoutAlt = imgs.filter(img => !img.match(/alt\s*=\s*"[^"]+"/i));
        if (imgsWithoutAlt.length > 0) {
          issues.push({ page: page.name, path: page.path, priority: 'MEDIUM', issue: `${imgsWithoutAlt.length} image(s) missing alt text` });
        } else {
          passedChecks++;
        }

    }

    // Check: robots.txt
    totalChecks++;
    try {
      const robotsResp = await fetch(BASE + '/robots.txt');
      const robotsTxt = await robotsResp.text();
      if (robotsTxt.includes('Sitemap:')) passedChecks++;
      else issues.push({ page: 'robots.txt', path: '/robots.txt', priority: 'MEDIUM', issue: 'robots.txt missing Sitemap reference' });

      // Check for AI bot allowances
      totalChecks++;
      const aiBots = ['GPTBot', 'PerplexityBot', 'ClaudeBot'];
      const missingBots = aiBots.filter(bot => !robotsTxt.includes(bot));
      if (missingBots.length === 0) {
        passedChecks++;
      } else {
        issues.push({ page: 'robots.txt', path: '/robots.txt', priority: 'HIGH', issue: `Missing AI bot allowances: ${missingBots.join(', ')}` });
      }
    } catch (e) {
      issues.push({ page: 'robots.txt', path: '/robots.txt', priority: 'HIGH', issue: 'robots.txt not accessible' });
    }

    // Check: llms.txt
    totalChecks++;
    try {
      const llmsResp = await fetch(BASE + '/llms.txt');
      if (llmsResp.ok) passedChecks++;
      else issues.push({ page: 'llms.txt', path: '/llms.txt', priority: 'HIGH', issue: 'llms.txt not found (needed for AI engine optimization)' });
    } catch (e) {
      issues.push({ page: 'llms.txt', path: '/llms.txt', priority: 'HIGH', issue: 'llms.txt not accessible' });
    }

    // Check: sitemap.xml
    totalChecks++;
    try {
      const smResp = await fetch(BASE + '/sitemap.xml');
      const smText = await smResp.text();
      const urlCount = (smText.match(/<url>/gi) || []).length;
      if (urlCount > 30) passedChecks++;
      else issues.push({ page: 'sitemap.xml', path: '/sitemap.xml', priority: 'MEDIUM', issue: `Sitemap only has ${urlCount} URLs (expected 40+)` });

      // Check for recent lastmod
      totalChecks++;
      const recentMod = smText.match(/2026-04/);
      if (recentMod) passedChecks++;
      else issues.push({ page: 'sitemap.xml', path: '/sitemap.xml', priority: 'MEDIUM', issue: 'Sitemap lastmod dates may be stale (not updated this month)' });
    } catch (e) {
      issues.push({ page: 'sitemap.xml', path: '/sitemap.xml', priority: 'HIGH', issue: 'sitemap.xml not accessible' });
    }

    // Calculate grade
    const score = Math.round((passedChecks / totalChecks) * 100);
    let grade;
    if (score >= 98) grade = 'A+';
    else if (score >= 95) grade = 'A';
    else if (score >= 90) grade = 'A-';
    else if (score >= 85) grade = 'B+';
    else if (score >= 80) grade = 'B';
    else if (score >= 75) grade = 'B-';
    else grade = 'C';

    // Sort issues by priority
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    issues.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Build report
    let report = `HAPPY ROOF — AUTOMATED SEO AUDIT\n${today}\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `SITE GRADE: ${grade} (${score}%)\n`;
    report += `Checks Run: ${totalChecks} | Passed: ${passedChecks} | Issues: ${issues.length}\n`;
    report += `Pages Audited: ${pages.length}\n\n`;

    if (issues.length === 0) {
      report += `No issues found. All pages are optimized against current best practices.\n`;
    } else {
      report += `${'='.repeat(50)}\n`;
      report += `ISSUES FOUND (${issues.length})\n`;
      report += `${'='.repeat(50)}\n\n`;

      let currentPriority = '';
      issues.forEach((issue, idx) => {
        if (issue.priority !== currentPriority) {
          currentPriority = issue.priority;
          report += `--- ${currentPriority} PRIORITY ---\n\n`;
        }
        report += `${idx + 1}. [${issue.priority}] ${issue.page} (${issue.path})\n`;
        report += `   ${issue.issue}\n\n`;
      });
    }

    report += `${'='.repeat(50)}\n`;
    report += `PASSING CHECKS SUMMARY\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `- Title tags: checked across ${pages.length} pages\n`;
    report += `- Meta descriptions: checked across ${pages.length} pages\n`;
    report += `- Canonical URLs: checked across ${pages.length} pages\n`;
    report += `- H1 tags: checked across ${pages.length} pages\n`;
    report += `- JSON-LD schema: checked across ${pages.length} pages\n`;
    report += `- Open Graph tags: checked across ${pages.length} pages\n`;
    report += `- Image alt text: checked across ${pages.length} pages\n`;
    report += `- robots.txt: AI bot allowances verified\n`;
    report += `- llms.txt: AI crawler guidance verified\n`;
    report += `- sitemap.xml: URL count and freshness verified\n\n`;
    report += `This automated audit runs daily at 8am ET.\n`;
    report += `For competitive analysis and algorithm updates, consult with your SEO team.\n`;

    // Save report to Vercel Blob, then trigger a separate function to email it
    const { writeBlob } = await import('./_blob-store.js');
    await writeBlob('seo-audit-report', {
      subject: `Daily SEO Audit — ${today} — Grade: ${grade} (${score}%)`,
      message: report,
      date: today,
      grade,
      score,
    });

    // Trigger the email sender endpoint (separate cold function = clean IP for Cloudflare)
    const emailRes = await fetch('https://www.happyroof.com/api/cron-seo-email', {
      method: 'GET',
    });
    const emailData = await emailRes.json().catch(() => ({ success: false }));
    const emailSuccess = emailData.success === true;

    return res.status(200).json({
      success: emailSuccess,
      grade,
      score,
      totalChecks,
      passedChecks,
      issueCount: issues.length,
      date: today,
    });
  } catch (err) {
    console.error('SEO audit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
