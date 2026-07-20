/**
 * tests/static-guards/drain-set-registry-readers.test.js
 *
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-5 / TS-6.
 *
 * Child B removed two hand-authored per-role kind-list constants (ADAM_INBOX_KINDS,
 * SOLOMON_INBOX_KINDS) in favor of DERIVED views over the shared DRAIN_SETS constant
 * (lib/fleet/worker-status.cjs) consumed through the registry-reader
 * (lib/fleet/drain-set-registry.js). This guard makes "no new hand-rolled per-role
 * kind-list reappears" a durable, semantic (content-shape) tripwire -- NOT an
 * identifier-name regex (e.g. /_?INBOX_KINDS$/i), which a rename trivially evades.
 *
 * Detection: an array LITERAL (not a derived/computed expression) containing 3+
 * string tokens drawn from the known fleet payload.kind vocabulary
 * (DIRECTIVE_KINDS + PAYLOAD_KINDS values from lib/fleet/worker-status.cjs), found
 * in a file outside the allowlist (worker-status.cjs itself, drain-set-registry.js,
 * tests, docs, migrations, PRD payloads).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { DIRECTIVE_KINDS, PAYLOAD_KINDS } = require('../../lib/fleet/worker-status.cjs');

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

// The known fleet payload.kind vocabulary -- a literal array containing 3+ of these
// tokens outside the allowlist is almost certainly a reintroduced hand-rolled
// per-role recognized-kind list, the exact class of drift Child B closed.
const KNOWN_KIND_VOCAB = new Set([...DIRECTIVE_KINDS, ...Object.values(PAYLOAD_KINDS)]);

const ALLOWLIST_PATTERNS = [
  /^tests\//,
  /^docs\//,
  /^database\/migrations\//,
  /^\.prd-payloads\//,
  /\.md$/,
  /^node_modules\//,
  /^\.worktrees\//,
  /^\.git\//,
  // The sanctioned pair: DRAIN_SETS/ADAM_EXCLUDED_KINDS (the SSOT fallback + exclusion list)
  // and the registry-reader lib that consumes them.
  /^lib\/fleet\/worker-status\.cjs$/,
  /^lib\/fleet\/drain-set-registry\.js$/,
  // NOT a per-role recognized-kinds mirror -- LEGITIMATELY_BODYLESS_KINDS classifies which
  // kinds are legitimately bodyless-by-design for a lane-hygiene lint gauge, an orthogonal
  // concern to "does this role's inbox drain this kind" (the class Child B closed).
  /^lib\/coordination\/lane-lint-gauge\.cjs$/,
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

// Extracts each top-level array-literal `[ ... ]` span from source text (non-nested-aware,
// but adequate for this purpose: a false split inside a nested array only makes detection
// MORE sensitive, never less, which is the safe failure direction for a guard).
function extractArrayLiterals(content) {
  const spans = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '[') { if (depth === 0) start = i; depth++; }
    else if (ch === ']') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start !== -1) { spans.push(content.slice(start, i + 1)); start = -1; }
    }
  }
  return spans;
}

function countKnownKindHits(arrayLiteralText) {
  const stringLiteralPattern = /'([a-zA-Z_][a-zA-Z0-9_]*)'|"([a-zA-Z_][a-zA-Z0-9_]*)"/g;
  let hits = 0;
  let m;
  while ((m = stringLiteralPattern.exec(arrayLiteralText)) !== null) {
    const token = m[1] || m[2];
    if (KNOWN_KIND_VOCAB.has(token)) hits++;
  }
  return hits;
}

describe('drain-set-registry hand-rolled kind-list residual guard (FR-5, TS-6)', () => {
  it('KNOWN_KIND_VOCAB is non-trivial (sanity check the vocabulary loaded)', () => {
    expect(KNOWN_KIND_VOCAB.size).toBeGreaterThan(10);
  });

  it('no file outside the allowlist contains an array literal with 3+ known-kind string tokens', () => {
    const allFiles = listSourceFiles(REPO_ROOT);
    const offenders = [];
    for (const f of allFiles) {
      if (isAllowlisted(f.rel)) continue;
      let content;
      try { content = fs.readFileSync(f.abs, 'utf8'); } catch { continue; }
      if (!content.includes('payload')) continue; // cheap pre-filter, real files touch payload.kind
      for (const span of extractArrayLiterals(content)) {
        if (countKnownKindHits(span) >= 3) {
          offenders.push(f.rel);
          break;
        }
      }
    }
    expect(
      offenders,
      'File(s) contain an array literal with 3+ known fleet payload.kind tokens outside the ' +
      `allowlist: ${offenders.join(', ')}.\n` +
      'A new per-role hand-rolled kind-list constant has likely reappeared -- route it through ' +
      'lib/fleet/drain-set-registry.js\'s resolveRecognizedKinds() instead ' +
      '(SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C Child B).'
    ).toEqual([]);
  });

  it('the allowlisted sanctioned pair legitimately contain kind-vocabulary arrays (guard is not vacuous)', () => {
    const workerStatusSrc = fs.readFileSync(path.join(REPO_ROOT, 'lib/fleet/worker-status.cjs'), 'utf8');
    let maxHits = 0;
    for (const span of extractArrayLiterals(workerStatusSrc)) {
      maxHits = Math.max(maxHits, countKnownKindHits(span));
    }
    expect(maxHits).toBeGreaterThanOrEqual(3);
  });
});
