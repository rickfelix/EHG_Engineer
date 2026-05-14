#!/usr/bin/env node
/**
 * context-md-lint.mjs — Pocock format compliance for CONTEXT.md (Child A)
 *
 * Asserts the Pocock glossary format:
 *   - File exists at the resolved repo root.
 *   - First line is the POCOCK-RPC-SIGNED HTML comment marker (any sha is OK
 *     — freshness is enforced by .githooks/commit-msg, not by lint).
 *   - At least 30 H2 (## ...) headers — the seed-term threshold for ship.
 *     Headers under the "# Not Yet Witnessed in LEO" section count.
 *   - Each H2 section body is <= 10 lines of prose.
 *   - No code fences (``` ... ```) inside a glossary entry body.
 *
 * Exit 0 on success; exit 1 on any violation; prints a summary JSON line.
 *
 * SD: SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-A
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function findRepoRoot() {
  let dir = path.dirname(url.fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function lint(filePath) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(filePath)) {
    return { ok: false, errors: [`file not found: ${filePath}`], warnings, h2_count: 0 };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  // Rule 1: signed marker on first line
  const marker = /<!--\s*POCOCK-RPC-SIGNED:\s*[0-9a-fA-F]{16,}\s*-->/;
  if (!marker.test(lines[0] || '')) {
    errors.push('first line missing POCOCK-RPC-SIGNED marker comment');
  }

  // Walk H2 sections and count + body-length-check + no-code-fence-check
  let h2_count = 0;
  let currentH2 = null;
  let body = [];
  const sections = [];

  function flushSection() {
    if (currentH2 != null) {
      sections.push({ heading: currentH2.heading, lineNo: currentH2.lineNo, body: body.slice() });
    }
    currentH2 = null;
    body = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const h2 = ln.match(/^##\s+(.+?)\s*$/);
    const h1 = ln.match(/^#\s+(.+?)\s*$/);
    if (h2) {
      flushSection();
      h2_count++;
      currentH2 = { heading: h2[1], lineNo: i + 1 };
    } else if (h1) {
      flushSection();
    } else if (currentH2) {
      body.push(ln);
    }
  }
  flushSection();

  // Rule 2: H2 count
  if (h2_count < 30) {
    errors.push(`H2 count ${h2_count} below required minimum of 30`);
  }

  // Rule 3: each section body <= 10 non-empty lines (Pocock format)
  for (const sec of sections) {
    const nonEmpty = sec.body.filter(l => l.trim().length > 0);
    if (nonEmpty.length > 10) {
      warnings.push(`section "${sec.heading}" (line ${sec.lineNo}) has ${nonEmpty.length} non-empty body lines (Pocock target: <=10)`);
    }
    // Rule 4: no code fences inside entry bodies
    const fenceLine = sec.body.findIndex(l => /^```/.test(l));
    if (fenceLine >= 0) {
      errors.push(`section "${sec.heading}" (line ${sec.lineNo}) contains a code fence at body line ${fenceLine + 1} (Pocock format: glossary-only, no code)`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, h2_count, section_count: sections.length };
}

function main() {
  const repoRoot = findRepoRoot();
  const filePath = path.join(repoRoot, 'CONTEXT.md');
  const result = lint(filePath);
  result.path = filePath;
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(`\n[context-md-lint] FAILED: ${result.errors.length} error(s)`);
    for (const err of result.errors) console.error('  - ' + err);
    process.exit(1);
  }
  console.error(`[context-md-lint] CONTEXT.md compliant (${result.section_count} sections, ${result.h2_count} H2 headers, ${result.warnings.length} warnings)`);
  if (result.warnings.length) {
    for (const w of result.warnings) console.error('  warning: ' + w);
  }
  process.exit(0);
}

main();
