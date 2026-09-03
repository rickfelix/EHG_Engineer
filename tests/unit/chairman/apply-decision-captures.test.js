/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 — FR-4: capture classification.
 *
 * Pure logic only, no database. The routing decision is the part worth pinning: misclassifying a
 * hold as an RPC apply would RESOLVE a decision the chairman explicitly left held, and
 * misclassifying an RPC apply as a hold would silently drop a decision he actually made.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCapture, extractUnparkTrigger } from '../../../scripts/apply-chairman-decision-captures.mjs';

const cap = (metadata, description = '') => ({ id: 'x', title: 't', description, metadata });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/apply-chairman-decision-captures.mjs'),
  'utf-8'
);

describe('classifyCapture — routing', () => {
  it('routes an approve capture to the RPC with the resolved action name', () => {
    expect(classifyCapture(cap({ decided: 'approve', decision_id: 'd1' })))
      .toEqual({ action: 'rpc', decisionId: 'd1', rpcAction: 'approved' });
  });

  it('routes a reject capture to the RPC', () => {
    expect(classifyCapture(cap({ decided: 'reject', decision_id: 'd2' })))
      .toEqual({ action: 'rpc', decisionId: 'd2', rpcAction: 'rejected' });
  });

  it('routes a ratified hold to mark_held, NOT to the RPC', () => {
    // The capture that motivated this: "NO RPC apply needed — the row deliberately stays pending
    // so it re-surfaces on unpark". Resolving it would destroy exactly the property it records.
    const r = classifyCapture(cap({ decided: 'hold_ratified', decision_id: 'd3', no_rpc_apply_needed: true }));
    expect(r.action).toBe('mark_held');
    expect(r.decisionId).toBe('d3');
  });

  it('no_rpc_apply_needed WINS over a decided value that looks like an RPC action', () => {
    // Order-of-checks guard. If the decided-branch were evaluated first, a hold carrying
    // decided:'approve' would be resolved. Asserting the precedence, not just the happy path.
    const r = classifyCapture(cap({ decided: 'approve', decision_id: 'd4', no_rpc_apply_needed: true }));
    expect(r.action).toBe('mark_held');
  });

  it('skips a capture with no decision_id rather than guessing a target', () => {
    expect(classifyCapture(cap({ decided: 'approve' })).action).toBe('skip');
  });

  it('skips an unrecognised decided value instead of defaulting to an action', () => {
    // Defaulting here would apply an action the chairman never chose. The SD's own FR-2 makes the
    // same argument for the SQL mapping: refuse, do not default.
    const r = classifyCapture(cap({ decided: 'maybe_later', decision_id: 'd5' }));
    expect(r.action).toBe('skip');
    expect(r.reason).toMatch(/maybe_later/);
  });
});

describe('extractUnparkTrigger', () => {
  it('prefers structured metadata over prose', () => {
    expect(extractUnparkTrigger(cap({ unpark_trigger: 'from metadata' }, 'text (trigger: from prose)')))
      .toBe('from metadata');
  });

  it('falls back to the documented "(trigger: ...)" clause', () => {
    expect(extractUnparkTrigger(cap({}, 're-surfaces on unpark (trigger: Sessions+Roadmap live in EHG, or explicit chairman direction).')))
      .toBe('Sessions+Roadmap live in EHG, or explicit chairman direction');
  });

  it('returns null when no trigger is recorded — so the caller can say so out loud', () => {
    // A hold with an invisible exit condition is the parked-forever shape. Returning null lets the
    // view render "trigger NOT RECORDED" rather than a bare HELD that looks deliberate.
    expect(extractUnparkTrigger(cap({}, 'no trigger here'))).toBeNull();
  });

  it('treats a whitespace-only metadata trigger as absent, not as a trigger', () => {
    expect(extractUnparkTrigger(cap({ unpark_trigger: '   ' }, 'no clause'))).toBeNull();
  });
});

// QF-20260902-882: the main() query and resolve calls use a module-scope supabase client with
// no dependency-injection seam, so the widened category coverage and the resolve-shape fixes are
// pinned as static-source assertions here (matching the established pattern in
// tests/unit/governance/resolve-feedback.test.js's own static-pin section) rather than mocked
// end-to-end, per the same proportionality this QF's own NON-GOALS section calls for.
describe('QF-20260902-882: category widening + resolve-shape static pins', () => {
  it('CATEGORIES covers both chairman_decision_capture and chairman_ruling_capture, queried via .in()', () => {
    expect(SRC).toMatch(/const CATEGORIES = \['chairman_decision_capture', 'chairman_ruling_capture'\];/);
    expect(SRC).toMatch(/\.in\('category', CATEGORIES\)/);
    // The old single-literal query must be gone, not merely supplemented.
    expect(SRC).not.toMatch(/\.eq\('category', CATEGORY\)/);
  });

  it('the RPC-applied resolve routes through the canonical resolveFeedback helper, not a bare update', () => {
    expect(SRC).toMatch(/import \{ resolveFeedback \} from '\.\.\/lib\/governance\/resolve-feedback\.js';/);
    const rpcApplyIdx = SRC.indexOf("counts.applied++; console.log(`APPLIED ${tag}`);");
    expect(rpcApplyIdx).toBeGreaterThan(-1);
    // 800 chars: the resolveFeedback() call sits after a 5-line explanatory comment block, which
    // alone runs ~450 chars -- a 500-char window cut off before the call itself.
    const rpcApplyBlock = SRC.slice(rpcApplyIdx, rpcApplyIdx + 800);
    expect(rpcApplyBlock).toMatch(/resolveFeedback\(\{/);
    expect(rpcApplyBlock).toMatch(/resolutionType: 'chairman_decision_applied'/);
    expect(rpcApplyBlock).not.toMatch(/\.from\('feedback'\)\.update\(\{ status: 'resolved' \}\)/);
  });

  it('the mark_held branch never resolves the capture feedback row (stays status=new)', () => {
    const heldAppliedIdx = SRC.indexOf('APPLIED ${tag}  HELD until:');
    expect(heldAppliedIdx).toBeGreaterThan(-1);
    // Scan to the end of the for-loop body (next top-level closing brace of main's for-loop);
    // 400 chars comfortably covers the trailing comment block with no further code after it.
    const tailBlock = SRC.slice(heldAppliedIdx, heldAppliedIdx + 400);
    expect(tailBlock).not.toMatch(/\.from\('feedback'\)\.update/);
    expect(tailBlock).not.toMatch(/resolveFeedback\(/);
  });
});

// SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001: two VALIDATION-sub-agent findings on the escalated
// SD (already-merged QF-20260902-882 exceeded the Tier-2 LOC cap): isFixApplied() called
// createDatabaseClient(), which needs SUPABASE_DB_PASSWORD/EHG_DB_PASSWORD -- no *cron*.yml in
// this repo injects that (supabase-js + service-role only), so the scheduled run would probe
// FR-1 as permanently UNKNOWN and BLOCK every RPC capture forever. And the RPC-applied branch's
// resolveFeedback() call was unchecked, letting a fail-soft resolve failure still print APPLIED.
describe('SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001: isFixApplied via exec_sql + checked resolve', () => {
  it('isFixApplied queries pg_proc through the exec_sql RPC on the existing supabase-js client, not a direct pg connection', () => {
    // The function body itself (not the historical JSDoc comment above it, which legitimately
    // narrates the prior createDatabaseClient() approach) must no longer import/call it.
    const fnIdx = SRC.indexOf('async function isFixApplied()');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBlock = SRC.slice(fnIdx, fnIdx + 500);
    expect(fnBlock).not.toMatch(/createDatabaseClient/);
    expect(fnBlock).not.toMatch(/supabase-connection\.js/);
    expect(fnBlock).toMatch(/supabase\.rpc\('exec_sql',/);
    expect(fnBlock).toMatch(/pg_proc WHERE proname = 'fn_chairman_decision_value'/);
  });

  it('the RPC-applied resolve result is checked, warning (not silently swallowing) an unresolved feedback row', () => {
    const rpcApplyIdx = SRC.indexOf("counts.applied++; console.log(`APPLIED ${tag}`);");
    const resolveResultIdx = SRC.indexOf('resolveResult', rpcApplyIdx);
    expect(resolveResultIdx).toBeGreaterThan(rpcApplyIdx);
    const checkBlock = SRC.slice(resolveResultIdx, resolveResultIdx + 700);
    expect(checkBlock).toMatch(/if \(!resolveResult\.updated\)/);
    expect(checkBlock).toMatch(/WARN/);
  });
});
