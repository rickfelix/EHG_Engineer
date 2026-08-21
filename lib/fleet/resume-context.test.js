// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-3 — resume context resolution.
// SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 / FR-4 — widened the metadata.resume_uuid guard below to
// also catch an ALIASED local-variable read, not just the literal `metadata.resume_uuid` token.

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  transcriptPathFor,
  projectDirName,
  looksLikeWorktreePath,
  resolveResumePlan,
  resumeLaunchFlags,
} from './resume-context.mjs';

const MAIN = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const WT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-X';
const HOME = 'C:/Users/rickf';

// Comments explain WHY a field must not be read; scanning them would fail on the rationale itself --
// the same trap as searching for a flag NAME rather than its USE.
function stripComments(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// A READ, not a write: `subject.resume_uuid` on the right of an assignment or in an expression.
// `resume_uuid:` (an object key being SET) is excluded by requiring no colon (optionally
// whitespace-separated) immediately after.
function readPattern(subject) {
  return new RegExp(`\\b${subject}\\s*[.[]\\s*['"]?resume_uuid['"]?\\]?\\s*(?!\\s*:)`);
}

// FR-4: catches BOTH the DIRECT `metadata.resume_uuid` pattern (the original, baseline behavior) AND
// an ALIASED local-variable read (`const meta = x.metadata; ...later... meta.resume_uuid`) -- the
// exact shape that let lib/fleet/session-registry-adapter.js's read go undetected by a regex that
// required the literal token `metadata` immediately adjacent to the property access. Returns each
// match's provenance so callers (the repo-wide walker) can cross-reference a precise, reviewed
// allowlist rather than a blanket per-file exemption.
//
// KNOWN RESIDUAL LIMITATION (EXEC-phase TESTING, documented rather than chased): this is a regex
// heuristic, not an AST walk, so it does not catch every aliasing shape -- confirmed uncaught:
// destructuring (`const {metadata} = x`), a bare reassignment (`meta = x.metadata` with no
// declarator), a function-parameter alias, optional chaining (`x?.metadata`), a multi-declarator
// comma statement, and `this.meta`. A repo-wide scan at the time this was written found these are
// LATENT, not live -- the only real read is the allowlisted session-registry-adapter.js case; every
// other resume_uuid occurrence is a write or the distinct fleet_desired_slots column. Closing this
// exhaustively needs real AST analysis, out of scope for this FR; the negative controls below prove
// the heuristic is at least non-trivial (catches direct, single-declarator, and multi-line-ternary
// aliasing) without claiming completeness it does not have.
function findResumeUuidReadMatches(code) {
  const matches = [];
  if (readPattern('metadata').test(code)) matches.push({ via: 'metadata' });

  // Declarations whose initializer touches `.metadata` anywhere in the expression (spans newlines,
  // e.g. a multi-line ternary, since only `;` terminates the scan) -- captures the alias name.
  const aliasDeclPattern = /\b(?:const|let|var)\s+(\w+)\s*=\s*[^;]*?\.metadata\b[^;]*;/g;
  const seen = new Set();
  let m;
  while ((m = aliasDeclPattern.exec(code))) {
    const alias = m[1];
    if (seen.has(alias)) continue;
    seen.add(alias);
    if (readPattern(alias).test(code)) matches.push({ via: 'alias', alias });
  }
  return matches;
}

function detectsResumeUuidRead(code) {
  return findResumeUuidReadMatches(code).length > 0;
}

// FR-4: known, load-bearing, intentional reads of claude_sessions.metadata.resume_uuid, explicitly
// exempted WITH RATIONALE -- never a silent way to make the guard stop firing. Keyed on (file, alias)
// so a DIFFERENT future violation in the same file (a renamed/new alias) is NOT silently covered by
// this entry -- the guard re-fires and forces a fresh, conscious decision.
const ALLOWLISTED_RESUME_UUID_READS = [
  {
    file: 'lib/fleet/session-registry-adapter.js',
    alias: 'meta',
    rationale:
      "loadLiveSlotIdentity's meta.resume_uuid read (~line 87) is documented, intentional behavior " +
      "feeding computeLiveSlotDrift's FIELDS comparison (session-manifest.js computeSlotDrift, FIELDS " +
      "includes 'resume_uuid') against fleet_desired_slots.resume_uuid. Because " +
      'claude_sessions.metadata.resume_uuid is populated on only 8/13,110 rows (0.06%, re-measured ' +
      '2026-08-21 -- originally cited as 1/13,025), that comparison likely reports a spurious mismatch ' +
      'for nearly every slot with a captured resume_uuid. That is a REAL but SEPARATE defect: fixing ' +
      "computeSlotDrift's FIELDS list or loadLiveSlotIdentity's sourcing is not something this FR's " +
      'acceptance criteria ask for (NC-EXEC-001 no scope creep) -- tracked as its own follow-up rather ' +
      'than silently left uncaught or bolted onto this FR.',
  },
];

describe('FR3-PATH: the transcript slug comes from the MAIN root, never a worktree', () => {
  it('derives the documented slug shape', () => {
    // Verified against real disk: ~/.claude/projects/C--Users-rickf-Projects--EHG-EHG-Engineer
    expect(projectDirName(MAIN)).toBe('C--Users-rickf-Projects--EHG-EHG-Engineer');
  });

  it('builds the transcript path under the main-root slug', () => {
    const p = transcriptPathFor({ sessionId: 'abc', mainRepoRoot: MAIN, homeDir: HOME });
    expect(p).toBe(path.join(HOME, '.claude', 'projects', 'C--Users-rickf-Projects--EHG-EHG-Engineer', 'abc.jsonl'));
  });

  it('a WORKTREE root yields a DIFFERENT slug — which is why it must not be used', () => {
    // This is the silent failure: the derived directory never exists, so the existence check
    // reports "no transcript" and cold-starts every worktree seat while looking correct.
    expect(projectDirName(WT)).not.toBe(projectDirName(MAIN));
    expect(looksLikeWorktreePath(WT)).toBe(true);
    expect(looksLikeWorktreePath(MAIN)).toBe(false);
  });

  it('warns loudly when handed a worktree path as the slug source', () => {
    const plan = resolveResumePlan({
      sessionId: 'abc', transcriptExists: true, launchCwd: WT, newSessionId: 'new', mainRepoRoot: WT,
    });
    expect(plan.warnings.join(' ')).toMatch(/must come from the MAIN repo root/);
  });
});

describe('FR3-VERIFY: a missing transcript cold-starts AND says so', () => {
  it('cold-starts when the transcript is absent', () => {
    const plan = resolveResumePlan({ sessionId: 'abc', transcriptExists: false, launchCwd: WT, newSessionId: 'new' });
    expect(plan.mode).toBe('cold');
    expect(plan.carriesContext).toBe(false);
    expect(plan.resumeUuid).toBeNull();
  });

  it('SAYS it cold-started — silence would let the operator believe context survived', () => {
    const plan = resolveResumePlan({ sessionId: 'abc', transcriptExists: false, launchCwd: WT, newSessionId: 'new' });
    expect(plan.report).toMatch(/COLD START/);
    expect(plan.report).toMatch(/could NOT be carried over/);
  });

  it('never promises carry-over it did not verify', () => {
    const plan = resolveResumePlan({ sessionId: 'abc', transcriptExists: false, launchCwd: WT, newSessionId: 'new' });
    expect(plan.report).not.toMatch(/RESUME:/);
  });
});

describe('FR3-FORK: fork rather than re-register under the old id', () => {
  it('forks the verified transcript into a FRESH session id', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: true, launchCwd: WT, newSessionId: 'fresh', mainRepoRoot: MAIN });
    expect(plan.mode).toBe('fork');
    expect(plan.resumeUuid).toBe('old');   // the conversation
    expect(plan.sessionId).toBe('fresh');  // the identity
    expect(plan.carriesContext).toBe(true);
  });

  it('emits --fork-session with BOTH the old conversation and the new identity', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: true, launchCwd: WT, newSessionId: 'fresh', mainRepoRoot: MAIN });
    expect(resumeLaunchFlags(plan)).toEqual(['--fork-session', '--resume', 'old', '--session-id', 'fresh']);
  });

  it('a cold start carries no resume flags at all', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: false, launchCwd: WT, newSessionId: 'fresh' });
    expect(resumeLaunchFlags(plan)).toEqual([]);
  });
});

describe('FR3-CWD: launch_cwd is the worktree, and its absence is surfaced', () => {
  it('carries the worktree path through as the launch cwd', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: true, launchCwd: WT, newSessionId: 'fresh', mainRepoRoot: MAIN });
    expect(plan.cwd).toBe(WT); // the SEAT runs in its worktree, even though the transcript slug is the main root
  });

  it('warns when no launch_cwd was recorded — today there is none, and resume works by coincidence', () => {
    const plan = resolveResumePlan({ sessionId: 'old', transcriptExists: true, launchCwd: null, newSessionId: 'fresh', mainRepoRoot: MAIN });
    expect(plan.warnings.join(' ')).toMatch(/no launch_cwd recorded/);
  });
});

describe('FR3-TOKEN: metadata.resume_uuid is never consulted for RESTART/RESUME decisions', () => {
  it('ignores a resume_uuid even when one is supplied alongside', () => {
    // Populated on 8/13,110 rows (0.06%, re-measured 2026-08-21; originally cited as 1/13,025) —
    // anything reading it silently cold-starts almost every time.
    const plan = resolveResumePlan({
      sessionId: 'session-token', transcriptExists: true, launchCwd: WT, newSessionId: 'fresh',
      mainRepoRoot: MAIN, resume_uuid: 'DO-NOT-USE-ME',
    });
    expect(plan.resumeUuid).toBe('session-token');
    expect(JSON.stringify(plan)).not.toMatch(/DO-NOT-USE-ME/);
  });

  it('the module CODE contains no read of metadata.resume_uuid (direct or aliased)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const raw = readFileSync(fileURLToPath(new URL('./resume-context.mjs', import.meta.url)), 'utf8');
    expect(detectsResumeUuidRead(stripComments(raw))).toBe(false);
  });

  it('NO UNDISCLOSED PRODUCTION MODULE READS metadata.resume_uuid (direct or aliased)', async () => {
    // AC-3-4 asks for a REPO-WIDE grep, and the test above is module-scoped. A guard that can only
    // see the one file already known to be correct is not a guard on the invariant — the reader
    // that would actually hurt us is by definition somewhere else. Scoping it to this module made
    // it unfalsifiable.
    //
    // The invariant is about READS of claude_sessions.metadata.resume_uuid, which is populated on
    // 8/13,110 rows (0.06%, re-measured 2026-08-21), so any reader silently cold-starts almost every
    // time. It is NOT about the fleet_desired_slots.resume_uuid COLUMN, which is a different,
    // legitimately-populated field — conflating the two is what made an earlier assessment report a
    // false positive here (lib/fleet/desired-slots-store.js:120 WRITES metadata.resume_uuid, its own
    // legitimate FR-2 purpose, excluded below as a write not a read; desired-slots-store.js's
    // slotsToRoster and lib/fleet/reboot-respawn-runner.js's `slot.resume_uuid` both read the
    // fleet_desired_slots-sourced column via a `slot` never assigned from anything touching
    // `.metadata` — not an alias of the dangerous field under any reasonable static check, DISPOSED
    // as legitimate on 2026-08-21 by direct inspection).
    //
    // FR-4 (SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001): widened past a literal-token-only regex to also
    // catch an ALIASED local-variable read — see findResumeUuidReadMatches/detectsResumeUuidRead above
    // — with one reviewed, rationale'd exception (ALLOWLISTED_RESUME_UUID_READS).
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const repo = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.git' || entry === '.worktrees') continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(?:js|cjs|mjs)$/.test(entry)) continue;
        if (/\.test\.(?:js|cjs|mjs)$/.test(entry)) continue;   // tests may name it to assert absence
        const raw = readFileSync(full, 'utf8');
        const code = stripComments(raw);
        const relNorm = path.relative(repo, full).split(path.sep).join('/');
        const allow = ALLOWLISTED_RESUME_UUID_READS.find((a) => a.file === relNorm);
        const unexplained = findResumeUuidReadMatches(code).filter((mt) => {
          if (!allow) return true;
          if (mt.via === 'metadata') return true; // allowlist covers only the specific alias, never the raw token
          return mt.alias !== allow.alias;
        });
        if (unexplained.length) offenders.push(relNorm);
      }
    };
    for (const top of ['lib', 'scripts', 'server']) {
      try { walk(path.join(repo, top)); } catch { /* dir may not exist */ }
    }

    expect(offenders, `metadata.resume_uuid is READ (unexplained) in: ${offenders.join(', ')}`).toEqual([]);
  });

  describe('FR-4: the aliased-read detector is neither blind nor uselessly permissive', () => {
    it('catches the DIRECT pattern (unchanged baseline behavior)', () => {
      expect(detectsResumeUuidRead('const x = s.metadata.resume_uuid;')).toBe(true);
    });

    it('catches an ALIASED read: const meta = x.metadata; ...meta.resume_uuid', () => {
      // The exact shape of the real, allowlisted case (session-registry-adapter.js:76,87) — proven
      // here against a synthetic string so the detector's discriminating power does not depend on
      // that one file staying broken (the "mutation test proves it discriminates" AC).
      const code = 'const meta = (s && s.metadata) || {}; const v = meta.resume_uuid || null;';
      expect(detectsResumeUuidRead(code)).toBe(true);
    });

    it('catches an ALIASED read spanning a multi-line declaration', () => {
      const code = [
        'const baseMeta = (current && current.metadata',
        '  ? current.metadata',
        '  : {});',
        'return baseMeta.resume_uuid;',
      ].join('\n');
      expect(detectsResumeUuidRead(code)).toBe(true);
    });

    it('NEGATIVE CONTROL: does not flag an alias of .metadata reading a DIFFERENT field', () => {
      const code = 'const meta = row.metadata; const v = meta.some_other_field;';
      expect(detectsResumeUuidRead(code)).toBe(false);
    });

    it('NEGATIVE CONTROL: does not flag an alias of an unrelated object sharing the field name (the fleet_desired_slots.resume_uuid shape)', () => {
      // Mirrors the real, legitimate desired-slots-store.js / reboot-respawn-runner.js code: `slot`
      // is never assigned from anything touching `.metadata`.
      const code = 'const slot = slots[i]; const resumeUuid = slot.resume_uuid || null;';
      expect(detectsResumeUuidRead(code)).toBe(false);
    });

    it('NEGATIVE CONTROL: does not flag a WRITE (object-literal key set), aliased or not', () => {
      const code = 'const meta = x.metadata; const merged = { ...meta, resume_uuid: sessionId };';
      expect(detectsResumeUuidRead(code)).toBe(false);
    });

    it('the real session-registry-adapter.js shape is genuinely caught by the raw detector -- the allowlist is doing real work, not silently matching nothing', async () => {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const path = await import('node:path');
      const repo = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
      const raw = readFileSync(path.join(repo, 'lib', 'fleet', 'session-registry-adapter.js'), 'utf8');
      const matches = findResumeUuidReadMatches(stripComments(raw));
      expect(matches).toContainEqual({ via: 'alias', alias: 'meta' });
    });
  });
});
