#!/usr/bin/env node
/**
 * verify-upstream-types-parity.js
 *
 * CI guard that the EHG SPA copy of UPSTREAM_ARTIFACT_TYPES matches the
 * canonical EHG_Engineer source. EHG and EHG_Engineer are independent npm
 * packages — there is no shared module boundary, so the two lists must be
 * kept byte-identical by convention + this check.
 *
 * Exit codes:
 *   0 — Lists match (length, items, order)
 *   1 — Drift detected; diff printed
 *   2 — Could not locate one of the source files (config error)
 *
 * SD-MAN-FIX-STAGE-MARKETING-COPY-001
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { UPSTREAM_ARTIFACT_TYPES as CANONICAL } from '../lib/eva/stage-templates/upstream-artifact-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Resolve EHG repo path: env override > sibling-of-EHG_Engineer > sibling-of-worktree-parent
function resolveEhgRoot() {
  if (process.env.EHG_REPO_PATH) return process.env.EHG_REPO_PATH;
  const candidates = [
    resolve(repoRoot, '..', 'ehg'),                  // standard layout
    resolve(repoRoot, '..', '..', 'ehg'),             // worktree layout (.worktrees/<sd>/ → ../..)
    resolve(repoRoot, '..', '..', '..', 'ehg'),       // nested worktree
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'src', 'components', 'stages', 'Stage18MarketingCopy.tsx'))) {
      return candidate;
    }
  }
  return candidates[0];
}

const ehgRoot = resolveEhgRoot();
const spaPath = resolve(ehgRoot, 'src', 'components', 'stages', 'Stage18MarketingCopy.tsx');

if (!existsSync(spaPath)) {
  console.error(`[parity] EHG SPA file not found at ${spaPath}`);
  console.error('[parity] Skipping check — EHG repo not co-located. Set EHG_REPO_PATH to override.');
  process.exit(2);
}

const spaSource = readFileSync(spaPath, 'utf8');

const arrayMatch = spaSource.match(/UPSTREAM_ARTIFACT_TYPES[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
if (!arrayMatch) {
  console.error('[parity] Could not extract UPSTREAM_ARTIFACT_TYPES array from SPA source');
  console.error('[parity] Expected pattern: export const UPSTREAM_ARTIFACT_TYPES ... = Object.freeze([...])');
  process.exit(2);
}

const spaItems = arrayMatch[1]
  .split(',')
  .map((s) => s.trim().replace(/^["']|["']$|\/\/.*$/g, '').trim())
  .filter(Boolean);

const canonical = Array.from(CANONICAL);

if (spaItems.length !== canonical.length) {
  console.error(`[parity] DRIFT: SPA has ${spaItems.length} items; canonical has ${canonical.length}`);
  console.error('[parity] Canonical:', canonical);
  console.error('[parity] SPA:', spaItems);
  process.exit(1);
}

let drift = false;
for (let i = 0; i < canonical.length; i++) {
  if (canonical[i] !== spaItems[i]) {
    console.error(`[parity] DRIFT at index ${i}: canonical="${canonical[i]}" spa="${spaItems[i]}"`);
    drift = true;
  }
}

if (drift) {
  console.error('[parity] Canonical:', canonical);
  console.error('[parity] SPA:', spaItems);
  console.error(`[parity] Update either ${spaPath} or lib/eva/stage-templates/upstream-artifact-types.js to match.`);
  process.exit(1);
}

console.log(`[parity] OK — UPSTREAM_ARTIFACT_TYPES matches across EHG_Engineer (canonical) and EHG SPA (${canonical.length} items).`);
process.exit(0);
