// Auto-implement SEO audit recommendations
// GET /api/cron-seo-implement?key=REFERRAL_ADMIN_KEY
// Reads latest audit from Vercel Blob, uses Claude to generate code changes,
// pushes to a dated branch via GitHub API, emails summary.
// Runs 30 min after the audit cron.

import Anthropic from '@anthropic-ai/sdk';
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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const resendKey = process.env.RESEND_API_KEY;

  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
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
    const filesToRead = [
      'src/pages/faq.astro',
      'src/pages/blog/index.astro',
      'public/sitemap.xml',
      'src/pages/index.astro',
      'src/pages/services.astro',
      'src/pages/residential-roofing.astro',
      'src/pages/tampa-roofing.astro',
      'src/pages/eco-friendly-roofing.astro',
    ];

    const fileContents = {};
    const fileShas = {};
    for (const filePath of filesToRead) {
      const result = await getFileSha(filePath);
      if (result) {
        // Only include first 300 lines to stay within token limits
        const lines = result.content.split('\n');
        fileContents[filePath] = lines.slice(0, 300).join('\n');
        fileShas[filePath] = result.sha;
      }
    }

    // ── PHASE 3: Claude generates implementation ──
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: `You are implementing SEO/AEO/GEO audit recommendations for Happy Roof (happyroof.com), an Astro-based roofing website.

## Today's Audit Report
${audit.report}

## Current Source Files (first 300 lines each)
${Object.entries(fileContents).map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``).join('\n\n')}

## Instructions
Based on the audit report, generate ONLY the changes that can be implemented by editing website code. Skip any recommendations that require:
- Action in Google Business Profile dashboard (posting, responding to reviews, uploading photos)
- External platforms (social media, directories, partnerships)
- Content that requires real project photos or customer testimonials

For each file change, output valid JSON. Each change should be a complete file edit that I can apply via the GitHub API.

IMPORTANT RULES:
- Only modify files that genuinely need changes based on the audit
- Do NOT make changes just for the sake of making changes
- Focus on: schema updates, FAQ additions, meta tag improvements, dateModified freshness, internal linking, sitemap updates
- Match the existing code style exactly (inline styles, Barlow Condensed headings, brand colors #E6A817/#3B9FD9/#1A1A1A)
- If the audit says everything is fine, return an empty changes array
- Keep changes surgical — don't rewrite entire files
- For sitemap.xml, only update lastmod dates and add new entries if needed

Respond with ONLY a JSON object in this exact format (no markdown, no explanation):
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
      const responseText = claudeResponse.content[0].text;
      // Handle potential markdown code blocks
      const jsonStr = responseText.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      implementation = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('Failed to parse Claude response:', claudeResponse.content[0].text);
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

    // ── PHASE 5: Mark audit as implemented ──
    audit.implemented = true;
    audit.implementedAt = new Date().toISOString();
    audit.branch = filesChanged > 0 ? branchName : null;
    audit.filesChanged = filesChanged;
    audit.changeLog = changeLog;
    await writeBlob('seo-audit-latest', audit);

    // ── PHASE 6: Email summary ──
    const resend = new Resend(resendKey);

    let emailBody = `SEO AUDIT AUTO-IMPLEMENTATION SUMMARY\n`;
    emailBody += `Date: ${audit.dateFormatted}\n`;
    emailBody += `${'='.repeat(50)}\n\n`;

    if (filesChanged > 0) {
      emailBody += `BRANCH: ${branchName}\n`;
      emailBody += `FILES CHANGED: ${filesChanged}\n\n`;
      emailBody += `WHAT CHANGED:\n${implementation.summary}\n\n`;
      emailBody += `CHANGE LOG:\n`;
      changeLog.forEach(log => { emailBody += `  ${log}\n`; });
      emailBody += `\nTO MERGE: Go to GitHub and merge branch "${branchName}" into main.\n`;
      emailBody += `TO UNDO: Delete the branch — no changes touch main until you merge.\n`;
      emailBody += `\nGitHub: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${branchName}\n`;
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
      subject: `SEO Auto-Implementation | ${audit.dateFormatted} | ${filesChanged} file(s) changed`,
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
