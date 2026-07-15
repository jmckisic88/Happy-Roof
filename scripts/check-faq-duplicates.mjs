#!/usr/bin/env node
/**
 * check-faq-duplicates.mjs
 *
 * Build-time guardrail against the failure pattern documented in
 * feedback_no_duplicate_faq: an FAQPage JSON-LD block accidentally
 * gets appended twice on the same page (or the same Question "name"
 * gets repeated inside a single FAQPage.mainEntity array).
 *
 * Scans every .astro file under src/pages/ and fails the build if:
 *   1. Any single page contains more than one FAQPage block whose
 *      Question set overlaps (even one shared "name" value).
 *   2. Any single FAQPage.mainEntity array on a page repeats the same
 *      Question "name" value.
 *
 * The scan is intentionally regex-based, not a JSON parser, because
 * the schemas live inside Astro template literals with ${...}
 * interpolation and cannot be JSON.parse'd directly.
 *
 * Exit code 0 = clean. Exit code 1 = duplicates found (build fails).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES_DIR = join(REPO_ROOT, 'src', 'pages');

/** Recursively collect every .astro file under a directory. */
function collectAstroFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...collectAstroFiles(full));
    } else if (entry.endsWith('.astro')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Locate every FAQPage block inside a file's source text.
 * Returns [{ start, end, questions: string[] }].
 *
 * We look for the literal token `"@type": "FAQPage"` then walk forward
 * to find its enclosing mainEntity array's Question "name" values.
 * Because our schemas are hand-authored strings (not JSON), we scan
 * with a small brace-balancing loop rather than JSON.parse.
 */
function extractFaqBlocks(src) {
  const blocks = [];
  const typeRegex = /"@type"\s*:\s*"FAQPage"/g;
  let m;
  while ((m = typeRegex.exec(src)) !== null) {
    // Walk back to the opening `{` of this FAQPage object.
    let objStart = m.index;
    let depth = 0;
    for (let i = m.index; i >= 0; i--) {
      const c = src[i];
      if (c === '}') depth++;
      else if (c === '{') {
        if (depth === 0) { objStart = i; break; }
        depth--;
      }
    }
    // Walk forward to the matching closing `}`.
    let objEnd = src.length;
    depth = 0;
    for (let i = objStart; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { objEnd = i + 1; break; }
      }
    }
    const body = src.slice(objStart, objEnd);
    // Collect all Question names within this FAQPage body.
    const names = [];
    const nameRegex = /"@type"\s*:\s*"Question"[\s\S]*?"name"\s*:\s*"([^"]+)"/g;
    let n;
    while ((n = nameRegex.exec(body)) !== null) {
      names.push(n[1]);
    }
    blocks.push({ start: objStart, end: objEnd, questions: names });
    // Advance past this block to avoid re-matching nested FAQPage tokens.
    typeRegex.lastIndex = objEnd;
  }
  return blocks;
}

/** Return duplicate values (case-insensitive) inside a string array. */
function findDuplicates(arr) {
  const seen = new Map();
  const dups = new Set();
  for (const v of arr) {
    const key = v.toLowerCase().trim();
    if (seen.has(key)) dups.add(v);
    else seen.set(key, true);
  }
  return [...dups];
}

const failures = [];
const files = collectAstroFiles(PAGES_DIR);

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const blocks = extractFaqBlocks(src);
  if (blocks.length === 0) continue;

  // Rule 2: dupes within a single FAQPage.mainEntity.
  blocks.forEach((b, idx) => {
    const dups = findDuplicates(b.questions);
    if (dups.length > 0) {
      failures.push(
        `${relative(REPO_ROOT, file)}: FAQPage block #${idx + 1} contains duplicate Question "name" values: ${dups.map((d) => JSON.stringify(d)).join(', ')}`
      );
    }
  });

  // Rule 1: two FAQPage blocks on the same page share any Question name.
  if (blocks.length > 1) {
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = new Set(blocks[i].questions.map((v) => v.toLowerCase().trim()));
        const overlap = blocks[j].questions.filter((v) =>
          a.has(v.toLowerCase().trim())
        );
        if (overlap.length > 0) {
          failures.push(
            `${relative(REPO_ROOT, file)}: FAQPage blocks #${i + 1} and #${j + 1} share ${overlap.length} Question(s): ${overlap.map((d) => JSON.stringify(d)).join(', ')}`
          );
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error('\nFAQ duplicate check FAILED. See feedback_no_duplicate_faq.\n');
  for (const line of failures) console.error(`  - ${line}`);
  console.error('');
  process.exit(1);
}

console.log(`FAQ duplicate check passed (${files.length} pages scanned).`);
