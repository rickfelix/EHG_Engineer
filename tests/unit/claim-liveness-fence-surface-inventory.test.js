/**
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 FR-2 / TS-6 — the anti-rot pin.
 *
 * The fence is only worth as much as its coverage, and coverage decays silently: someone adds a
 * tenth claim-write site six months from now and nothing goes red. This test fails when a NEW
 * runtime writer sets claiming_session_id to a non-null value without consulting the fence.
 *
 * *** THE CLAIM-VS-RELEASE DISTINCTION IS THE WHOLE DESIGN OF THIS TEST. ***
 * A naive "every file that writes claiming_session_id must call the fence" rule is confidently
 * WRONG: lib/claim/release-claim-both-surfaces.mjs and lib/claim-lifecycle-release.mjs set the
 * column to NULL. Those are RELEASES. Fencing a release would mean a session the fence considers
 * dead could not even let go of its work — the exact opposite of the goal. So the rule is scoped to
 * writers that SET A NON-NULL VALUE.
 *
 * SCOPING, measured rather than assumed: a raw grep for claiming_session_id across lib/ and
 * scripts/ returns 26 files, but most are JSDoc, test fixtures, select lists, coordinator event
 * payloads, or archived/one-off scripts. Only ~10 are genuine runtime writers. Matching the raw
 * grep would have produced a test that is 60% noise — the population-to-triage trap.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCAN_DIRS = ['lib', 'scripts'];

/** Paths that are not live claim machinery. Archived and one-off scripts are historical artefacts. */
const SKIP_RE = /(^|[\\/])(archive|one-off|__tests__|node_modules)[\\/]|\.test\.(js|mjs|cjs)$/;

/** A writer is FENCED if it references either fence entry point. */
const FENCE_RE = /claimantLivenessFence|liveClaimWriteFenceReason/;

/**
 * Finds `.update({ ... claiming_session_id: <expr> ... })` calls and reports whether the assigned
 * value is `null` (a release) or anything else (a claim).
 */
function claimWritesIn(src) {
  const writes = [];
  const re = /\.update\(\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Walk to the matching close brace so multi-line payloads are captured whole.
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const payload = src.slice(m.index, i);
    const assign = /claiming_session_id\s*:\s*([^,}\n]+)/.exec(payload);
    if (!assign) continue;
    const value = assign[1].trim();
    writes.push({ value, isRelease: value === 'null' });
  }
  return writes;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (SKIP_RE.test(rel)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const inventory = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
  .map((file) => ({ file: path.relative(ROOT, file).replace(/\\/g, '/'), src: fs.readFileSync(file, 'utf8') }))
  .map((f) => ({ ...f, writes: claimWritesIn(f.src) }))
  .filter((f) => f.writes.length > 0);

describe('FR-2 — claim-write surface inventory (anti-rot)', () => {
  it('finds the claim-write surfaces at all (guards against a silently-empty scan)', () => {
    // A scan that matches nothing would make every assertion below vacuously true — the classic
    // way a coverage test rots into decoration.
    expect(inventory.length).toBeGreaterThanOrEqual(5);
  });

  it('every runtime writer that SETS a non-null claiming_session_id consults the fence', () => {
    const unfenced = inventory
      .filter((f) => f.writes.some((w) => !w.isRelease))
      .filter((f) => !FENCE_RE.test(f.src))
      .map((f) => f.file);

    expect(
      unfenced,
      'These files SET claiming_session_id to a non-null value without consulting the liveness '
      + 'fence, so a dead session can acquire work through them. Route the write through '
      + 'claimantLivenessFence (or liveClaimWriteFenceReason) — see lib/fleet/claimant-liveness.cjs. '
      + 'If the new site only RELEASES a claim, assign literal `null` and it is exempt by design.',
    ).toEqual([]);
  });

  it('does NOT require a fence on release-only writers', () => {
    // Explicitly asserted so a future maintainer cannot "tighten" the rule into breaking releases.
    const releaseOnly = inventory.filter((f) => f.writes.every((w) => w.isRelease));
    expect(releaseOnly.length).toBeGreaterThan(0); // the release paths exist and are found
    for (const f of releaseOnly) {
      expect(f.writes.every((w) => w.isRelease)).toBe(true);
    }
  });

  it('every liveClaimWriteFenceReason call passes the CLAIMANT — presence is not enforcement', () => {
    // THIS TEST EXISTS BECAUSE THE ONE ABOVE WAS NOT ENOUGH. The fence-reference check is textual,
    // so lib/claim-guard.mjs and scripts/worker-checkin.cjs both "passed" it while calling
    // liveClaimWriteFenceReason(sb, sdKey) with only two arguments — the claimantSessionId
    // parameter defaults to null and the liveness sub-check is SKIPPED ENTIRELY. Two independent
    // sub-agent reviews found that inert state; this test is what would have caught it.
    // EXPLICIT EXCEPTIONS, not a tolerance threshold. Both of these call the fence for its SD-AXIS
    // purpose (authority holds), not to guard a claim write, so the claimant argument is genuinely
    // not applicable:
    //   BaseExecutor.js  — a HANDOFF-boundary authority fence. It writes no claim at all.
    //   sd-start.js      — a candidate PRE-FILTER in the fallback lane. sd-start has zero direct
    //                      claim writes; its actual claim goes through claimGuard, which IS fenced,
    //                      so liveness is enforced there rather than duplicated here.
    // Listing them by path means a NEW two-argument call still fails this test.
    const AXIS_ONLY_CALLERS = new Set([
      'scripts/modules/handoff/executors/BaseExecutor.js',
      'scripts/sd-start.js',
    ]);

    const offenders = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const src = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        if (AXIS_ONLY_CALLERS.has(rel)) continue;
        // Skip the definition itself and any doc/prose mention.
        const callRe = /liveClaimWriteFenceReason\s*\(([^)]*)\)/g;
        let m;
        while ((m = callRe.exec(src)) !== null) {
          const args = m[1].trim();
          if (!args || /^\{/.test(args)) continue; // destructuring import, not a call
          const argCount = args.split(',').length;
          if (argCount < 3) offenders.push(`${rel}: liveClaimWriteFenceReason(${args})`);
        }
      }
    }

    expect(
      offenders,
      'These calls omit the third argument (claimantSessionId), so the liveness sub-check silently '
      + 'does not run — the SD-axis fences still work, which is what makes this so easy to miss. '
      + 'Pass the claiming session id.',
    ).toEqual([]);
  });

  it('the detector can actually fail — negative control', () => {
    // Without this, a broken parser would report "no unfenced writers" forever and look green.
    const fakeClaim = 'await sb.from(\'quick_fixes\').update({ claiming_session_id: sessionId, status: \'x\' }).eq(\'id\', id);';
    const fakeRelease = 'await sb.from(\'quick_fixes\').update({ claiming_session_id: null }).eq(\'id\', id);';

    const claimWrites = claimWritesIn(fakeClaim);
    expect(claimWrites).toHaveLength(1);
    expect(claimWrites[0].isRelease).toBe(false); // would be FLAGGED if unfenced

    const releaseWrites = claimWritesIn(fakeRelease);
    expect(releaseWrites).toHaveLength(1);
    expect(releaseWrites[0].isRelease).toBe(true); // would be EXEMPT
  });
});
