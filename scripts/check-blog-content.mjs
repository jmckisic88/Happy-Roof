#!/usr/bin/env node
/**
 * check-blog-content.mjs
 *
 * Build-time guardrail against the failure pattern that shipped 3
 * corrupted blog posts (how-heat-affects-roofs-florida,
 * pros-and-cons-of-flat-roofing-in-tampa-bay,
 * stay-cool-summer-roofing-tips-tampa-bay). The automated weekly-blog
 * PR bot generated model-refusal text and committed it as blog
 * content. Files landed as 44 bytes containing "I'm sorry, I can't
 * assist with that request." and were merged without content review.
 *
 * This check fails the build if any src/pages/blog/*.astro file:
 *   1. Is under MIN_SIZE_BYTES (a real post is >5KB).
 *   2. Contains any known refusal phrase.
 *   3. Is missing the basic Astro post structure (BaseLayout import
 *      and closing tag).
 *
 * Exit code 0 = clean. Exit code 1 = corruption found (build fails).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BLOG_DIR = 'src/pages/blog';
const MIN_SIZE_BYTES = 500;

// Any of these phrases in a blog file are a hard fail. Add here as new
// bot failure modes are observed.
const REFUSAL_PHRASES = [
  "I'm sorry, I can't assist",
  "I'm sorry, I can't help",
  "I cannot assist with that request",
  "I cannot help with that request",
  "I'm not able to assist",
  "I'm not able to help",
  "As an AI language model",
  "As an AI, I",
];

// Required structural elements every blog post must contain.
const REQUIRED_ELEMENTS = [
  { needle: 'BaseLayout', description: 'BaseLayout import or usage' },
  { needle: '</BaseLayout>', description: 'closing BaseLayout tag' },
];

// Files under src/pages/blog/ that are NOT individual posts and
// should be skipped.
const NON_POST_FILES = new Set(['index.astro']);

const failures = [];

const entries = readdirSync(BLOG_DIR, { withFileTypes: true });
let checked = 0;

for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith('.astro')) continue;
  if (NON_POST_FILES.has(entry.name)) continue;

  const filePath = join(BLOG_DIR, entry.name);
  const content = readFileSync(filePath, 'utf8');
  const bytes = Buffer.byteLength(content, 'utf8');
  checked++;

  // Check 1: file size
  if (bytes < MIN_SIZE_BYTES) {
    failures.push({
      file: filePath,
      reason: `file is only ${bytes} bytes (minimum: ${MIN_SIZE_BYTES}). A real blog post is 5KB+. This usually means the file was overwritten with an empty stub or a bot refusal.`,
    });
    continue;
  }

  // Check 2: refusal phrases
  for (const phrase of REFUSAL_PHRASES) {
    if (content.includes(phrase)) {
      failures.push({
        file: filePath,
        reason: `contains refusal phrase "${phrase}". A blog post file should never contain AI-model refusal text. The automated weekly-blog bot generated a refusal and committed it as content.`,
      });
      break;
    }
  }

  // Check 3: required structural elements
  for (const req of REQUIRED_ELEMENTS) {
    if (!content.includes(req.needle)) {
      failures.push({
        file: filePath,
        reason: `missing ${req.description} ("${req.needle}"). The blog post is not a complete Astro page.`,
      });
    }
  }
}

if (failures.length > 0) {
  console.error('\n\x1b[31m✗ Blog content check FAILED\x1b[0m\n');
  for (const f of failures) {
    console.error(`  \x1b[31m${f.file}\x1b[0m`);
    console.error(`    ${f.reason}\n`);
  }
  console.error(`Scanned ${checked} blog file(s). Found ${failures.length} problem(s).`);
  console.error(`\nTo bypass this check temporarily (do NOT deploy corrupted content):`);
  console.error(`  npm run build -- --skip-check   (not implemented; edit prebuild in package.json)`);
  console.error(`\nMore likely: fix the underlying content or delete the broken file(s) plus their entries in src/pages/blog/index.astro.\n`);
  process.exit(1);
}

console.log(`\x1b[32m✓ Blog content check passed:\x1b[0m ${checked} post(s) verified.`);
process.exit(0);
