// Weekly Blog Post Generator
// GET /api/cron-blog-generator?key=REFERRAL_ADMIN_KEY
// Runs Wednesdays at 8am ET — generates a blog draft, pushes to a PR for review.
// Uses GPT-4o with full site inventory to avoid duplicate topics.

import OpenAI from 'openai';
import { Resend } from 'resend';

const GITHUB_OWNER = 'jmckisic88';
const GITHUB_REPO = 'Happy-Roof';
const BASE_BRANCH = 'main';

// ── Existing blog topics (so the generator doesn't duplicate) ──
const EXISTING_BLOGS = [
  { slug: 'choosing-right-roof-type-florida', title: 'Choosing the Right Roof Type for Your Florida Home', category: 'Materials' },
  { slug: 'tile-vs-shingle-vs-metal', title: 'Tile vs. Shingle vs. Metal: Which Roof Is Right for Your Florida Home?', category: 'Materials' },
  { slug: 'metal-roof-benefits-florida', title: '7 Benefits of Metal Roofing in Florida\'s Climate', category: 'Materials' },
  { slug: 'gaf-vs-owens-corning', title: 'GAF vs. Owens Corning: Which Shingle Brand Is Better?', category: 'Materials' },
  { slug: 'impact-resistant-shingles-florida', title: 'Why Impact-Resistant Shingles Are Worth It in Florida', category: 'Materials' },
  { slug: 'commercial-roofing-types', title: 'Commercial Roofing Systems Explained: TPO, EPDM, Metal & More', category: 'Commercial' },
  { slug: 'how-to-file-roof-insurance-claim', title: 'How to File a Roof Insurance Claim in Florida (Step-by-Step)', category: 'Insurance' },
  { slug: 'hail-damage-florida-guide', title: 'Hail Damage on Your Roof: A Florida Homeowner\'s Guide', category: 'Insurance' },
  { slug: 'signs-you-need-roof-replacement', title: '5 Signs You Need a Roof Replacement (Not Just a Repair)', category: 'Education' },
  { slug: 'florida-roofing-codes-2025', title: 'Florida Roofing Building Codes: What Homeowners Need to Know', category: 'Codes' },
  { slug: '5-questions-to-ask-your-roofer', title: '5 Questions to Ask Before Hiring a Roofer in Tampa Bay', category: 'Hiring' },
  { slug: 'roof-replacement-timeline', title: 'How Long Does a Roof Replacement Take?', category: 'Process' },
  { slug: 'roof-maintenance-checklist', title: 'Seasonal Roof Maintenance Checklist for Tampa Bay', category: 'Maintenance' },
  { slug: 'emergency-roof-repair-what-to-do', title: 'Emergency Roof Leak? Here\'s What to Do Right Now', category: 'Emergency' },
  { slug: 'hurricane-season-roof-prep', title: 'How to Prepare Your Roof for Hurricane Season in Tampa Bay', category: 'Seasonal' },
];

// ── GitHub API helpers ──
async function githubApi(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const resp = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`GitHub API ${resp.status}: ${error}`);
  }
  return resp.json();
}

async function getFile(path) {
  try {
    const data = await githubApi(`/contents/${path}?ref=${BASE_BRANCH}`);
    return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf-8') };
  } catch {
    return null;
  }
}

async function createBranch(branchName) {
  const ref = await githubApi(`/git/ref/heads/${BASE_BRANCH}`);
  await githubApi('/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: ref.object.sha }),
  });
}

async function createFile(branchName, filePath, content, message) {
  return githubApi(`/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      branch: branchName,
    }),
  });
}

async function updateFile(branchName, filePath, content, message, sha) {
  return githubApi(`/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      branch: branchName,
      sha,
    }),
  });
}

// ── Topic generation ──
async function pickTopicAndOutline(openai, today) {
  const existingList = EXISTING_BLOGS.map(b => `- ${b.title} (${b.category})`).join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a roofing industry content strategist for Happy Roof, a Tampa Bay roofing contractor (FL License #CCC1337380). You pick blog topics that have genuine search demand, fill gaps in the existing content library, and would be cited by AI answer engines for Tampa Bay roofing queries.`
      },
      {
        role: 'user',
        content: `Today is ${today}. Pick ONE blog topic for this week's post.

EXISTING BLOG TOPICS (DO NOT DUPLICATE):
${existingList}

CONSTRAINTS:
- Topic must NOT overlap with any existing blog above
- Topic must be specific to Tampa Bay or Florida roofing
- Topic must answer a real homeowner question
- Topic should target a specific search query that AI engines would cite
- Prefer seasonal relevance (we're in ${new Date(today).toLocaleString('en-US', { month: 'long' })})

CATEGORIES: Materials, Insurance, Education, Process, Maintenance, Emergency, Codes, Commercial, Hiring, Seasonal

Return JSON:
{
  "slug": "url-slug-with-dashes",
  "title": "Full blog title (Tampa Bay or Florida specific)",
  "category": "one of the categories above",
  "metaDescription": "150-160 char meta description",
  "primaryQuery": "the exact search query this targets",
  "outline": [
    "H2 section 1 title",
    "H2 section 2 title",
    "..."
  ],
  "faqQuestions": [
    "FAQ Q1",
    "FAQ Q2",
    "FAQ Q3"
  ],
  "rationale": "1-2 sentences on why this topic, not in the blog"
}`
      }
    ],
  });

  return JSON.parse(completion.choices[0].message.content);
}

async function generateBlogContent(openai, topic, today) {
  const formattedDate = new Date(today).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const isoDate = today;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 6000,
    messages: [
      {
        role: 'system',
        content: `You are a roofing expert writing for Happy Roof's blog. Tampa Bay roofing contractor, FL License #CCC1337380, phone (813) 595-7663.

Voice: practical, direct, no hype, no fluff. Florida-specific. Speak to homeowners as equals — informed but not technical-snob.

NEVER use em dashes (—) — use dashes (-) instead. NEVER use the word "delve". Write like you're explaining to a neighbor, not lecturing.

Use existing internal links where relevant: /faq, /contact, /finance, /reviews, /storm-damage-repair, /roof-repair, /residential-roofing, /commercial-roofing, /eco-friendly-roofing, /roof-inspection, /roof-maintenance, /blog/[other posts]`
      },
      {
        role: 'user',
        content: `Write a complete blog post in Astro format following this exact template structure.

Topic: ${topic.title}
Slug: ${topic.slug}
Category: ${topic.category}
Date: ${formattedDate} (${isoDate})
Meta description: ${topic.metaDescription}
Primary query: ${topic.primaryQuery}
H2 outline: ${topic.outline.join(' | ')}
FAQ questions: ${topic.faqQuestions.join(' | ')}

Use Owens Corning, GAF, and Gulf Coast Supply as preferred manufacturers when relevant. Mention Verea for tile.

Output ONLY the complete .astro file content starting with --- and ending with </BaseLayout>. Use this exact template structure (replace the placeholders):

---
import BaseLayout from '../../layouts/BaseLayout.astro';

const schema = \`[{
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "${topic.title}",
    "datePublished": "${isoDate}",
    "author": { "@type": "Organization", "name": "Happy Roof Team" },
    "publisher": { "@type": "Organization", "name": "Happy Roof LLC", "url": "https://happyroof.com" },
    "description": "${topic.metaDescription}"
  },{
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      // 3 FAQ entries with full answers
    ]
  }]\`;
---

<BaseLayout
  title="${topic.title} | Happy Roof"
  description="${topic.metaDescription}"
  canonical="https://happyroof.com/blog/${topic.slug}"
  ogTitle="${topic.title}"
  ogDescription="(short version)"
  schema={schema}
>

<!-- HERO with category tag, date, By Happy Roof Team -->
<!-- ARTICLE with intro paragraphs, H2 sections per outline, internal links, lists -->
<!-- FAQ accordion at end with 3 questions matching schema -->
<!-- CTA section -->

</BaseLayout>

Write 1500-2200 words of substantive content. Each H2 section should be 200-400 words. End with a CTA section identical in style to other Happy Roof blog posts.`
      }
    ],
  });

  return completion.choices[0].message.content;
}

// ── Main handler ──
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
  const githubToken = process.env.GITHUB_TOKEN;
  const resendKey = process.env.RESEND_API_KEY;

  if (!openaiKey || !githubToken || !resendKey) {
    return res.status(500).json({ error: 'Required API keys not configured' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const formattedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });

  try {
    const openai = new OpenAI({ apiKey: openaiKey });

    // ── PHASE 1: Pick topic ──
    const topic = await pickTopicAndOutline(openai, today);

    // Validate slug doesn't already exist
    if (EXISTING_BLOGS.some(b => b.slug === topic.slug)) {
      return res.status(200).json({
        success: false,
        message: 'Generator picked a duplicate slug — skipping this week',
        topic,
      });
    }

    // ── PHASE 2: Generate full post ──
    let blogContent = await generateBlogContent(openai, topic, today);
    // Clean up any markdown code fences
    blogContent = blogContent.replace(/^```astro\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();

    // ── PHASE 3: Create branch + commit blog file ──
    const branchName = `blog/${today}-${topic.slug}`;
    await createBranch(branchName);
    await createFile(
      branchName,
      `src/pages/blog/${topic.slug}.astro`,
      blogContent,
      `Add weekly blog: ${topic.title}`
    );

    // ── PHASE 4: Update blog index to add the new card at the top ──
    const indexFile = await getFile('src/pages/blog/index.astro');
    if (indexFile) {
      const tagColors = {
        Materials: 'rgba(59,159,217,.1);color:#3B9FD9',
        Insurance: 'rgba(59,159,217,.1);color:#3B9FD9',
        Commercial: 'rgba(59,159,217,.1);color:#3B9FD9',
        Codes: 'rgba(59,159,217,.1);color:#3B9FD9',
        Education: 'rgba(230,168,23,.1);color:#E6A817',
        Process: 'rgba(230,168,23,.1);color:#E6A817',
        Maintenance: 'rgba(230,168,23,.1);color:#E6A817',
        Emergency: 'rgba(230,168,23,.1);color:#E6A817',
        Hiring: 'rgba(230,168,23,.1);color:#E6A817',
        Seasonal: 'rgba(230,168,23,.1);color:#E6A817',
      };
      const tagStyle = tagColors[topic.category] || 'rgba(230,168,23,.1);color:#E6A817';

      const newCard = `      <a href="/blog/${topic.slug}" class="blog-card" data-publish="${today}" data-category="${topic.category}" style="text-decoration:none;color:inherit">
        <div style="padding:2rem 2rem 0">
          <div style="margin-bottom:1rem">
            <span class="blog-tag" style="background:${tagStyle}">${topic.category}</span>
            <span style="color:#888888;font-size:.8rem;margin-left:.75rem">${formattedDate}</span>
          </div>
          <h2 style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:1.35rem;color:#1A1A1A;line-height:1.15;margin-bottom:.75rem">${topic.title}</h2>
          <p style="color:#555555;font-size:.95rem;line-height:1.7;margin-bottom:1.25rem">${topic.metaDescription}</p>
        </div>
        <div style="padding:0 2rem 2rem;margin-top:auto">
          <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.95rem;color:#E6A817;letter-spacing:.02em">Read More &rarr;</span>
        </div>
      </a>

`;

      const insertMarker = '<div id="blog-grid" class="grid md:grid-cols-2 gap-8">\n';
      const newIndexContent = indexFile.content.replace(
        insertMarker,
        insertMarker + '\n' + newCard
      );

      await updateFile(
        branchName,
        'src/pages/blog/index.astro',
        newIndexContent,
        `Add ${topic.slug} to blog index`,
        indexFile.sha
      );
    }

    // ── PHASE 5: Create PR ──
    const prBody = `## Auto-generated blog post for ${formattedDate}\n\n`
      + `**Topic:** ${topic.title}\n`
      + `**Category:** ${topic.category}\n`
      + `**Primary query:** ${topic.primaryQuery}\n`
      + `**Slug:** \`${topic.slug}\`\n\n`
      + `### Why this topic\n${topic.rationale}\n\n`
      + `### Outline\n${topic.outline.map(s => `- ${s}`).join('\n')}\n\n`
      + `### FAQ Questions\n${topic.faqQuestions.map(q => `- ${q}`).join('\n')}\n\n`
      + `---\n\n**To publish:** Review the new blog file and merge this PR.\n**To reject:** Close this PR and delete the branch.\n\n*Generated automatically by /api/cron-blog-generator*`;

    const pr = await githubApi('/pulls', {
      method: 'POST',
      body: JSON.stringify({
        title: `Weekly Blog | ${formattedDate} | ${topic.title}`,
        head: branchName,
        base: BASE_BRANCH,
        body: prBody,
      }),
    });

    // ── PHASE 6: Email summary ──
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'Happy Roof Reports <onboarding@resend.dev>',
      to: ['jmckisic@gmail.com'],
      subject: `Weekly Blog Draft Ready | ${formattedDate} | ${topic.title}`,
      text: `WEEKLY BLOG DRAFT READY FOR REVIEW\n`
        + `${'='.repeat(50)}\n\n`
        + `Title: ${topic.title}\n`
        + `Category: ${topic.category}\n`
        + `Primary Query: ${topic.primaryQuery}\n\n`
        + `Why this topic: ${topic.rationale}\n\n`
        + `MERGE: ${pr.html_url}\n\n`
        + `Open the link, review the blog post, and click "Merge pull request" to publish.\n`
        + `To reject: close the PR.\n`,
    });

    return res.status(200).json({
      success: true,
      slug: topic.slug,
      title: topic.title,
      category: topic.category,
      branch: branchName,
      prUrl: pr.html_url,
    });

  } catch (err) {
    console.error('Blog generator error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
