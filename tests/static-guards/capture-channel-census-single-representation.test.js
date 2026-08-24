/**
 * tests/static-guards/capture-channel-census-single-representation.test.js
 *
 * SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001, FR-1 AC-4.
 *
 * FR-1's own charter is "a single representation" -- 3 pre-existing, disagreeing census-like
 * objects already existed for capture-channel drain state when this SD started (DRAIN_DESCRIPTORS,
 * SLA_CATEGORIES, docs/harness-backlog.md), which is the exact defect class FR-1 converges. This
 * guard prevents a FOURTH from being introduced later: any source file outside the allowlist that
 * mentions 2 or more of the three named capture-channel category tokens
 * (harness_backlog / invariant_gauge_finding / completion_flag) close together is almost certainly
 * a new census-shaped structure, not an incidental single reference.
 *
 * Proximity-window heuristic (not a full object-literal parser, deliberately): 2+ of the 3 tokens
 * within 500 characters of each other. A single incidental mention of one category name elsewhere
 * in a large file does not trip this; a literal listing multiple categories together (the shape of
 * every known census object in this codebase) does.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

const CATEGORY_TOKENS = ['harness_backlog', 'invariant_gauge_finding', 'completion_flag'];
// 6000 chars comfortably spans the real gauge-registry.js gap between its 3 entries (measured
// live: widest gap ~5,816 chars, driven by substantial explanatory comment blocks between
// descriptor entries) while still being far tighter than "anywhere in a multi-file repo".
const PROXIMITY_WINDOW = 6000;

const ALLOWLIST_PATTERNS = [
  /^tests\//,
  /^docs\//,
  /^database\//,
  /^\.prd-payloads\//,
  /\.md$/,
  /^node_modules\//,
  /^\.worktrees\//,
  /^\.git\//,
  /^scripts\/temp\//,
  // The canonical, converged representation this SD builds/maintains.
  /^lib\/governance\/gauge-registry\.js$/,
  /^lib\/governance\/drain-inventory\.js$/,
  /^scripts\/drain-inventory\.mjs$/,
  // The SLA registry this SD's FR-1 explicitly folds INTO the canonical representation (a derived
  // read, not a competing census) -- SLA_CATEGORIES itself legitimately names these categories.
  /^lib\/coordinator\/feedback-sla-gauge\.cjs$/,
  // Consumers that legitimately filter/query by one or more of these exact category strings as
  // part of their OWN narrow, single-purpose job (not a census of "who drains what").
  /^scripts\/feedback-fingerprint-promoter\.mjs$/,
  /^scripts\/capture-completion-flags\.js$/,
  /^scripts\/log-harness-bug\.js$/,
  /^lib\/governance\/feedback-terminal-categories\.cjs$/,
  // A plain enumeration of ALL known feedback categories (for classification/routing purposes,
  // e.g. "which categories exist" for an SD-from-feedback conversion tool) -- no consumer/SLA/
  // drain-rate metadata attached to any entry, so it is not shaped like a competing census.
  // Confirmed by direct inspection (lines 254-256): a flat category-name list, not a
  // per-category disposition record.
  /^scripts\/sd-from-feedback\.js$/,
  // Excludes harness_backlog (QF-20260509-149) and completion_flag (QF-20260704-993) rows from
  // its own inbox streams -- a narrow exclusion list for an unrelated pipeline, not a census of
  // consumer/SLA/drain-rate metadata. Confirmed by direct inspection.
  /^lib\/quality\/assist-engine\.js$/,
];

function isAllowlisted(rel) {
  return ALLOWLIST_PATTERNS.some((p) => p.test(rel));
}

function listSourceFiles(dir, base = '') {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.git')) continue;
    if (entry.name === 'node_modules') continue;
    if (entry.name === '.worktrees') continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full, rel));
    } else if (entry.isFile() && /\.(m?js|cjs|ts)$/.test(entry.name)) {
      out.push({ abs: full, rel: rel.replace(/\\/g, '/') });
    }
  }
  return out;
}

/** True if 2+ of CATEGORY_TOKENS each appear at least once within PROXIMITY_WINDOW chars of another. */
function hasProximateCensusShape(content) {
  const positions = CATEGORY_TOKENS.map((tok) => {
    const idx = content.indexOf(`'${tok}'`);
    const idx2 = content.indexOf(`"${tok}"`);
    const first = [idx, idx2].filter((i) => i !== -1);
    return first.length ? Math.min(...first) : -1;
  }).filter((i) => i !== -1);
  if (positions.length < 2) return false;
  positions.sort((a, b) => a - b);
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] - positions[i - 1] <= PROXIMITY_WINDOW) return true;
  }
  return false;
}

describe('capture-channel census single-representation guard (FR-1 AC-4)', () => {
  it('no file outside the allowlist co-locates 2+ named capture-channel categories (a competing census shape)', () => {
    const allFiles = listSourceFiles(REPO_ROOT);
    const offenders = [];
    for (const f of allFiles) {
      if (isAllowlisted(f.rel)) continue;
      let content;
      try { content = fs.readFileSync(f.abs, 'utf8'); } catch { continue; }
      if (!content.includes('harness_backlog') && !content.includes('completion_flag') && !content.includes('invariant_gauge_finding')) continue;
      if (hasProximateCensusShape(content)) offenders.push(f.rel);
    }
    expect(
      offenders,
      'File(s) co-locate 2+ capture-channel category names, suggesting a new competing census ' +
      `representation outside lib/governance/gauge-registry.js's DRAIN_DESCRIPTORS: ${offenders.join(', ')}. ` +
      'Extend DRAIN_DESCRIPTORS instead (SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001 FR-1).'
    ).toEqual([]);
  });

  it('the allowlisted canonical file (gauge-registry.js) legitimately co-locates all 3 categories (guard is not vacuous)', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'lib/governance/gauge-registry.js'), 'utf8');
    expect(hasProximateCensusShape(content)).toBe(true);
  });

  it('hasProximateCensusShape does not trip on a single incidental mention far from any other token', () => {
    const content = `${'x'.repeat(1000)} 'harness_backlog' ${'y'.repeat(1000)}`;
    // Only ONE category token appears at all, so this should never trip regardless of window size.
    expect(hasProximateCensusShape(content)).toBe(false);
  });

  it('hasProximateCensusShape trips when 2 category tokens sit within the proximity window', () => {
    const content = 'const CENSUS = { \'harness_backlog\': {}, \'completion_flag\': {} };';
    expect(hasProximateCensusShape(content)).toBe(true);
  });

  it('hasProximateCensusShape does not trip when 2 tokens are far apart (beyond the window)', () => {
    const content = `'harness_backlog'${'z'.repeat(6500)}'completion_flag'`;
    expect(hasProximateCensusShape(content)).toBe(false);
  });
});
