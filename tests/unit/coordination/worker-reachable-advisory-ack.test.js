/**
 * A worker can acknowledge an ADVISORY row, and the DIRECTIVE lane is unchanged.
 * SD-LEO-INFRA-WORKER-REACHABLE-ACK-001 — FR-1..FR-5.
 *
 * THE SYMPTOM WAS TWO DEFECTS AND ONLY ONE WAS A BUG.
 *
 * The kind refusal in worker-ack-directive.cjs is CORRECT and deliberate: DIRECTIVE_KINDS
 * excludes coordinator_reply/completion_nudge because that path is "reserved for genuine
 * directives, never advisory rows". Widening it would have been the small edit and the wrong one —
 * DIRECTIVE_KINDS also drives deliver-not-consume (read_at stays NULL) and priority-exempt
 * selection, so buying an ack verb by widening it would change semantics the ack has nothing to do
 * with. FR-3 pins that it did NOT widen.
 *
 * The real bugs: (1) the refusal was UNREADABLE — the script intended exit 2 but the process
 * ABORTED during teardown ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 * src/win/async.c:76") and the shell saw 127, i.e. command-not-found; and (2) the advisory lane had
 * NO worker-reachable ack at all, so coordinator RULINGS sat unacknowledged until some later
 * /checkin drained them.
 *
 * WHY THE read_at ARM IS A UNIT TEST. Live, there were no undrained DIRECTIVE rows at the moment I
 * checked, so read_at had NOTHING TO OBSERVE — and an unobserved invariant is not a passed one. It
 * is pinned here structurally instead: the ack writes an exact key set, so a future edit that
 * starts stamping read_at reds regardless of what rows happen to exist.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const REPO_ROOT = process.cwd();
const { ackDirective, ackAdvisory } = require_(path.join(REPO_ROOT, 'scripts/worker-ack-directive.cjs'));
const { DIRECTIVE_KINDS, ADVISORY_KINDS } = require_(path.join(REPO_ROOT, 'lib/fleet/worker-status.cjs'));

const ROW_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** Fake client capturing exactly what the ack writes. */
function makeSupabase(kind, { acknowledged_at = null } = {}) {
  const capture = { updates: [] };
  const client = {
    capture,
    from() {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: ROW_ID, payload: { kind }, target_session: null, acknowledged_at }, error: null }) }) }),
        update(patch) { capture.updates.push(patch); return { eq: async () => ({ error: null }) }; }
      };
    }
  };
  return client;
}

describe('SD-LEO-INFRA-WORKER-REACHABLE-ACK-001', () => {
  describe('FR-1: the refusal exit code is REACHABLE (not an abort reported as 127)', () => {
    const CLIS = ['scripts/worker-ack-directive.cjs', 'scripts/worker-ack-advisory.cjs'];

    // WHY THE SOURCE PIN IS THE LOAD-BEARING ARM, and this is the honest part.
    //
    // My first attempt spawned each CLI with NO --id and asserted exit 2. That test was VACUOUS,
    // and mutation is what exposed it: restoring `process.exit(2)` on that path reddened NOTHING.
    // The reason is structural — with no --id, main() returns BEFORE getServiceClient(), so no
    // async handles are open and process.exit() exits cleanly. The abort only happens once a
    // supabase client EXISTS: that is the catch path, measured live at exit 127 with
    // "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src/win/async.c:76", and now
    // measured at a clean exit 1 after the fix.
    //
    // A credential-free unit test cannot construct that client, so it cannot reach the failing
    // branch by spawning. Rather than keep an arm that only LOOKS like it covers FR-1, the
    // invariant is pinned where it is actually decidable: this file must never call process.exit.
    // Comments must be stripped before this assertion. Both CLIs EXPLAIN the fix in prose that
    // contains the literal "process.exit()", and a naive grep counts that comment as the code it
    // describes — the same trap that nearly made me report an unlanded fix earlier in this
    // session. Strip block and line comments, then test only what executes.
    const codeOf = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('neither CLI calls process.exit — the abort path is closed by construction', () => {
      for (const rel of CLIS) {
        expect(codeOf(rel), `${rel} still calls process.exit() — it will abort whenever a client is open`).not.toMatch(/process\.exit\(/);
      }
    });

    it('CONTROL: the comment-stripper does not blind the pin — it still sees real code', () => {
      // A stripper that ate everything would make the arm above vacuous. Prove it retains the
      // executable statements this file is actually about.
      for (const rel of CLIS) {
        const code = codeOf(rel);
        expect(code).toMatch(/process\.exitCode/);
        expect(code).toMatch(/argVal\(argv, '--id'\)/);
      }
    });

    it('CONTROL: both CLIs still SET an exit code — the fix is not "delete the exit"', () => {
      // Two-sided. Deleting process.exit() without setting process.exitCode would satisfy the pin
      // above while making every refusal exit 0 — a silent success, strictly worse than 127.
      for (const rel of CLIS) {
        const src = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        expect(src).toMatch(/process\.exitCode\s*=\s*2/);
        expect(src).toMatch(/process\.exitCode\s*=\s*1/);
      }
    });

    it('the usage refusal (no --id) reaches the shell as the documented code 2', () => {
      // Kept because it proves the code genuinely propagates, but it is NOT the FR-1 detector —
      // see the note above. Exit status read from execFileSync, never through a pipe.
      for (const rel of CLIS) {
        let status = 0;
        try {
          execFileSync(process.execPath, [path.join(REPO_ROOT, rel)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e) { status = e.status; }
        expect(status, `${rel} usage refusal`).toBe(2);
      }
    });
  });

  describe('FR-2: the ADVISORY lane has a worker-reachable ack', () => {
    it('acks a coordinator_reply and stamps acknowledged_at + actioned_by', async () => {
      const sb = makeSupabase('coordinator_reply');
      const res = await ackAdvisory(sb, ROW_ID, { sessionId: 'sess-1' });

      expect(res.alreadyAcked).toBe(false);
      expect(res.kind).toBe('coordinator_reply');
      const patch = sb.capture.updates[0];
      expect(patch.acknowledged_at).toBeTruthy();
      expect(patch.payload.actioned_by).toBe('sess-1');
    });

    it('acks a completion_nudge too — both advisory kinds are reachable', async () => {
      const sb = makeSupabase('completion_nudge');
      await expect(ackAdvisory(sb, ROW_ID, {})).resolves.toMatchObject({ kind: 'completion_nudge' });
    });

    it('is idempotent: an already-acked row is a no-op, not a re-stamp', async () => {
      const sb = makeSupabase('coordinator_reply', { acknowledged_at: '2099-01-01T00:00:00Z' });
      const res = await ackAdvisory(sb, ROW_ID, {});
      expect(res.alreadyAcked).toBe(true);
      expect(sb.capture.updates, 'an idempotent no-op must not write').toEqual([]);
    });
  });

  describe('FR-3: the DIRECTIVE contract did NOT widen', () => {
    it('DIRECTIVE_KINDS still excludes both advisory kinds', () => {
      expect(DIRECTIVE_KINDS).not.toContain('coordinator_reply');
      expect(DIRECTIVE_KINDS).not.toContain('completion_nudge');
    });

    it('the directive verb STILL REFUSES an advisory row', async () => {
      // The refusal that exposed the gap is correct and must survive the fix.
      const sb = makeSupabase('coordinator_reply');
      const err = await ackDirective(sb, ROW_ID, {}).catch((e) => e);
      expect(err.code).toBe('NOT_A_DIRECTIVE');
      expect(sb.capture.updates, 'a refused directive ack must not write').toEqual([]);
    });

    it('the advisory verb REFUSES a directive row — the lanes do not blur in either direction', async () => {
      // Two-sided. Without this, "advisory acks anything" would satisfy every arm above while
      // quietly making the advisory verb a back door into the directive lane.
      const sb = makeSupabase('coordinator_directive');
      const err = await ackAdvisory(sb, ROW_ID, {}).catch((e) => e);
      expect(err.code).toBe('NOT_AN_ADVISORY');
      expect(sb.capture.updates).toEqual([]);
    });

    it('CONTROL: a genuine directive kind still acks normally', async () => {
      const sb = makeSupabase('coordinator_request');
      await expect(ackDirective(sb, ROW_ID, {})).resolves.toMatchObject({ alreadyAcked: false, kind: 'coordinator_request' });
    });

    it('ADVISORY_KINDS is its OWN list, not the complement of DIRECTIVE_KINDS', () => {
      // Structural. A complement ("everything not a directive") would silently enrol every FUTURE
      // kind into the advisory lane by default — the exclusion-set trap. An explicit frozen list
      // means a new kind joins nothing until someone names it.
      expect(Object.isFrozen(ADVISORY_KINDS)).toBe(true);
      expect([...ADVISORY_KINDS].sort()).toEqual(['completion_nudge', 'coordinator_reply']);
      for (const k of ADVISORY_KINDS) expect(DIRECTIVE_KINDS).not.toContain(k);
    });
  });

  describe('FR-4: deliver-not-consume — the ack never touches read_at', () => {
    it('the ack writes EXACTLY {acknowledged_at, payload} and nothing else', async () => {
      // read_at IS NULL is the deliberate delivered-but-not-consumed signal for DIRECTIVE_KINDS
      // (scripts/hooks/coordination-inbox.cjs); resume.cjs:176-179 records that forcing it
      // re-introduces a corrected regression. Asserting the exact key set catches a future edit
      // that adds read_at, which a "read_at is still null" assertion over incidental rows would
      // miss whenever no such row happens to exist.
      for (const kind of ['coordinator_request', 'coordinator_reply']) {
        const sb = makeSupabase(kind);
        const ack = kind === 'coordinator_reply' ? ackAdvisory : ackDirective;
        await ack(sb, ROW_ID, {});
        expect(Object.keys(sb.capture.updates[0]).sort()).toEqual(['acknowledged_at', 'payload']);
      }
    });
  });
});
