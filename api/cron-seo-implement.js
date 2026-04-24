// Auto-implement SEO audit recommendations
// GET /api/cron-seo-implement?key=REFERRAL_ADMIN_KEY
// Reads latest audit from Vercel Blob, uses Claude to generate code changes,
// pushes to a dated branch via GitHub API, emails summary.
// Runs 30 min after the audit cron.

import OpenAI from 'openai';
import { Resend } from 'resend';
import { readBlob, writeBlob } from './_blob-store.js';

const GITHUB_OWNER = 'jmckisic88';
const GITHUB_REPO = 'Happy-Roof';
const BASE_BRANCH = 'main';

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

async function getFileSha(path) {
  try {
    const data = await githubApi(`/contents/${path}?ref=${BASE_BRANCH}`);
    return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf-8') };
  } catch {
    return null;
  }
}

async function createBranch(branchName) {
  // Get the SHA of the base branch
  const ref = await githubApi(`/git/ref/heads/${BASE_BRANCH}`);
  const sha = ref.object.sha;

  // Create the new branch
  await githubApi('/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  });
  return sha;
}

async function updateFile(branchName, filePath, content, message, sha) {
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: branchName,
  };
  if (sha) body.sha = sha;

  return githubApi(`/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
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
  const githubToken = process.env.GITHUB_TOKEN;
  const resendKey = process.env.RESEND_API_KEY;

  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  if (!githubToken) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
  if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  try {
    // ── PHASE 1: Read latest audit ──
    const audit = await readBlob('seo-audit-latest', null);
    if (!audit || !audit.report) {
      return res.status(404).json({ error: 'No audit found in blob storage' });
    }
    if (audit.implemented) {
      return res.status(200).json({ success: true, message: 'Audit already implemented', date: audit.date });
    }

    const branchName = `seo-audit/${audit.date}`;

    // ── PHASE 2: Read key source files from GitHub ──
    // Read schema-heavy files fully so the bot sees existing content and avoids duplicates.
    // For large pages, send a summary instead of raw content.
    const filesToRead = [
      { path: 'public/sitemap.xml', maxLines: 400 },
      { path: 'src/pages/faq.astro', maxLines: 100, note: 'FAQ page has 44 FAQPage schema questions. Only the first 100 lines (LocalBusiness schema) are shown. Do NOT add FAQ questions that may already exist — there are 44 covering: service areas, licensing, estimates, company history, emergency services, process, timeline, permits, cleanup, materials, shingles, metal, tile, warranties, financing, insurance, storm damage, tarping, energy efficiency, eco-friendly, solar-ready, cool roofs, hurricane prep.' },
      { path: 'src/pages/blog/index.astro', maxLines: 80 },
      { path: 'src/pages/index.astro', maxLines: 100, note: 'Homepage. Has full LocalBusiness + FAQPage schema + OfferCatalog + AggregateRating.' },
    ];

    const fileContents = {};
    const fileShas = {};
    for (const { path: filePath, maxLines, note } of filesToRead) {
      const result = await getFileSha(filePath);
      if (result) {
        const lines = result.content.split('\n');
        const totalLines = lines.length;
        let content = lines.slice(0, maxLines).join('\n');
        if (totalLines > maxLines) {
          content += `\n\n[... ${totalLines - maxLines} more lines not shown ...]`;
        }
        if (note) {
          content += `\n\n[NOTE: ${note}]`;
        }
        fileContents[filePath] = content;
        fileShas[filePath] = result.sha;
      }
    }

    // ── PHASE 3: GPT-4o generates implementation ──
    const openai = new OpenAI({ apiKey: openaiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You implement SEO/AEO/GEO audit recommendations by generating surgical code edits for an Astro-based roofing website (Happy Roof, happyroof.com). You respond with ONLY valid JSON, no explanation.`
        },
        {
          role: 'user',
          content: `## Today's Audit Report
${audit.report}

## Current Source Files (first 300 lines each)
${Object.entries(fileContents).map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``).join('\n\n')}

## Instructions
Based on the audit report, generate ONLY the changes that can be implemented by editing website code. Skip any recommendations that require:
- Action in Google Business Profile dashboard (posting, responding to reviews, uploading photos)
- External platforms (social media, directories, partnerships)
- Content that requires real project photos or customer testimonials

IMPORTANT RULES:
- Only modify files that genuinely need changes based on the audit
- Do NOT make changes just for the sake of making changes — an empty changes array is a valid and expected outcome
- Focus on: meta tag improvements, dateModified freshness, internal linking, sitemap date updates
- NEVER add FAQ schema questions — the FAQ page already has 44 comprehensive questions. Adding more creates duplicates and breaks the JSON-LD structure
- NEVER insert raw JSON objects into the middle of existing JSON-LD schema blocks
- The "search" string MUST exist exactly as-is in the file. If you're not sure it does, don't include the change
- The "replace" string must produce valid code — no broken JSON, no orphaned brackets
- Match the existing code style exactly (inline styles, Barlow Condensed headings, brand colors #E6A817/#3B9FD9/#1A1A1A)
- Keep changes surgical — don't rewrite entire files
- For sitemap.xml, only update lastmod dates to today's date

Respond with this exact JSON format:
{
  "summary": "2-3 sentence summary of what was changed and why",
  "changes": [
    {
      "file": "path/to/file.astro",
      "description": "What this change does",
      "search": "exact string to find in the file (must be unique, include enough context)",
      "replace": "exact string to replace it with"
    }
  ],
  "skipped": ["Brief note about each audit item that was skipped and why (gbp action, external, etc.)"]
}`
        }
      ],
    });

    let implementation;
    try {
      implementation = JSON.parse(completion.choices[0].message.content);
    } catch (parseErr) {
      console.error('Failed to parse GPT response:', completion.choices[0].message.content);
      return res.status(500).json({ error: 'Failed to parse implementation plan', details: parseErr.message });
    }

    // ── PHASE 4: Apply changes via GitHub API ──
    let filesChanged = 0;
    const changeLog = [];

    if (implementation.changes && implementation.changes.length > 0) {
      // Create the branch
      await createBranch(branchName);

      // Apply each change
      for (const change of implementation.changes) {
        try {
          // Get current file content from the new branch
          const fileData = await getFileSha(change.file);
          if (!fileData) {
            changeLog.push(`SKIP: ${change.file} — file not found`);
            continue;
          }

          // Apply search/replace
          if (!fileData.content.includes(change.search)) {
            changeLog.push(`SKIP: ${change.file} — search string not found`);
            continue;
          }

          const newContent = fileData.content.replace(change.search, change.replace);
          if (newContent === fileData.content) {
            changeLog.push(`SKIP: ${change.file} — no change after replace`);
            continue;
          }

          await updateFile(
            branchName,
            change.file,
            newContent,
            `SEO audit ${audit.date}: ${change.description}`,
            fileData.sha
          );

          filesChanged++;
          changeLog.push(`UPDATED: ${change.file} — ${change.description}`);
        } catch (fileErr) {
          changeLog.push(`ERROR: ${change.file} — ${fileErr.message}`);
        }
      }
    }

    // ── PHASE 5: Create PR if files changed ──
    let prUrl = null;
    if (filesChanged > 0) {
      try {
        const prBody = `## SEO Audit Auto-Implementation — ${audit.dateFormatted}\n\n`
          + `**${filesChanged} file(s) changed**\n\n`
          + `### What changed\n${implementation.summary}\n\n`
          + `### Change log\n${changeLog.map(l => `- ${l}`).join('\n')}\n\n`
          + (implementation.skipped?.length > 0
            ? `### Skipped (requires manual action)\n${implementation.skipped.map(s => `- ${s}`).join('\n')}\n\n`
            : '')
          + `---\n*Generated automatically by the SEO audit pipeline*`;

        const pr = await githubApi('/pulls', {
          method: 'POST',
          body: JSON.stringify({
            title: `SEO Audit | ${audit.dateFormatted} | ${filesChanged} file(s)`,
            head: branchName,
            base: BASE_BRANCH,
            body: prBody,
          }),
        });
        prUrl = pr.html_url;
      } catch (prErr) {
        console.error('PR creation error:', prErr.message);
      }
    }

    // ── PHASE 6: Mark audit as implemented ──
    audit.implemented = true;
    audit.implementedAt = new Date().toISOString();
    audit.branch = filesChanged > 0 ? branchName : null;
    audit.prUrl = prUrl;
    audit.filesChanged = filesChanged;
    audit.changeLog = changeLog;
    await writeBlob('seo-audit-latest', audit);

    // ── PHASE 7: Email summary ──
    const resend = new Resend(resendKey);

    let emailBody = `SEO AUDIT AUTO-IMPLEMENTATION SUMMARY\n`;
    emailBody += `Date: ${audit.dateFormatted}\n`;
    emailBody += `${'='.repeat(50)}\n\n`;

    if (filesChanged > 0) {
      emailBody += `FILES CHANGED: ${filesChanged}\n\n`;
      emailBody += `WHAT CHANGED:\n${implementation.summary}\n\n`;
      emailBody += `CHANGE LOG:\n`;
      changeLog.forEach(log => { emailBody += `  ${log}\n`; });
      if (prUrl) {
        emailBody += `\n${'='.repeat(50)}\n`;
        emailBody += `MERGE: ${prUrl}\n`;
        emailBody += `Open the link above and click the green "Merge pull request" button.\n`;
        emailBody += `TO REJECT: Close the PR — nothing touches production until you merge.\n`;
      } else {
        emailBody += `\nBRANCH: ${branchName}\n`;
        emailBody += `GitHub: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${branchName}\n`;
      }
    } else {
      emailBody += `NO WEBSITE CHANGES NEEDED\n`;
      emailBody += `The audit found no website code changes to implement today.\n`;
    }

    if (implementation.skipped && implementation.skipped.length > 0) {
      emailBody += `\nSKIPPED (requires manual action):\n`;
      implementation.skipped.forEach(s => { emailBody += `  - ${s}\n`; });
    }

    await resend.emails.send({
      from: 'Happy Roof Reports <onboarding@resend.dev>',
      to: ['jmckisic@gmail.com'],
      subject: `SEO Auto-Implementation | ${audit.dateFormatted} | ${filesChanged > 0 ? filesChanged + ' file(s) — MERGE READY' : 'No changes'}`,
      text: emailBody,
    });

    return res.status(200).json({
      success: true,
      date: audit.date,
      branch: filesChanged > 0 ? branchName : null,
      filesChanged,
      changeLog,
      summary: implementation.summary,
    });

  } catch (err) {
    console.error('SEO implement error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
