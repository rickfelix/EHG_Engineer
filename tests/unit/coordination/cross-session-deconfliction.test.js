// Tests for SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001
// FR-1 (worker-signal INTENT broadcast) + FR-2 (stale-session-sweep INTENT collision reader)
//
// TS-WC-1 (MANDATORY): pins the EXACT payload keys the FR-1 writer emits against the
// EXACT keys the FR-2 sweep reader consumes, in ONE test, so they cannot drift.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../');

// Importing the .cjs modules. stale-session-sweep.cjs guards main() behind
// require.main === module, so requiring it here does NOT run the sweep.
const workerSignal = require(path.resolve(ROOT, 'scripts/worker-signal.cjs'));
const sweep = require(path.resolve(ROOT, 'scripts/stale-session-sweep.cjs'));

const {
  buildIntentPayload,
  INTENT_ACTIONS,
  INTENT_PAYLOAD_KEYS: WRITER_KEYS,
  redact
} = workerSignal;
const {
  detectCrossSessionCollisions,
  loadRecentIntents,
  INTENT_PAYLOAD_KEYS: READER_KEYS
} = sweep;

// ── TS-WC-1 (integration, MANDATORY) ─────────────────────────────────────────
describe('TS-WC-1: writer INTENT(cancel-tree, target_sd_key=X) → sweep reader yields COLLISION', () => {
  it('the keys the writer emits are the SAME keys the reader reads (no drift)', () => {
    // Both modules reference the same frozen contract object — proven by deep equality.
    expect(READER_KEYS).toEqual(WRITER_KEYS);
    // And the load-bearing discriminator name is literally 'intent_action'.
    expect(WRITER_KEYS.action).toBe('intent_action');
  });

  it('a cancel-tree INTENT targeting SD X collides with a live session whose sd_key === X', () => {
    const X = 'SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001';

    // WRITER side: build the exact payload the FR-1 CLI would insert.
    const payload = buildIntentPayload({
      action: 'cancel-tree',
      targetSdKey: X,
      targetTree: 'feat/some-branch',
      targetFiles: ['scripts/a.cjs'],
      senderCallsign: 'Alpha',
      repo: '/repo',
      body: 'cancelling stale tree'
    });
    // The row as it would land in session_coordination (message_type INFO, payload above).
    const intentRow = {
      id: 'intent-1',
      sender_session: 'session-sender',
      payload // <-- the writer's payload, unmodified
    };

    // READER side: a live classified session holding SD X (a DIFFERENT session).
    const classified = [
      { session_id: 'session-victim', status: 'ACTIVE', sd_key: X, current_branch: 'feat/other' }
    ];

    const collisions = detectCrossSessionCollisions(classified, [intentRow]);

    expect(collisions.length).toBe(1);
    expect(collisions[0].intent_action).toBe('cancel-tree');
    expect(collisions[0].target_sd_key).toBe(X);
    expect(collisions[0].collided_with_session).toBe('session-victim');
    expect(collisions[0].reasons).toContain('sd_key');
  });

  it('does NOT flag the sender colliding with its own broadcast', () => {
    const X = 'SD-SELF-001';
    const payload = buildIntentPayload({ action: 'cancel-tree', targetSdKey: X, senderCallsign: 'Solo' });
    const intentRow = { id: 'i', sender_session: 'self-session', payload };
    const classified = [{ session_id: 'self-session', status: 'ACTIVE', sd_key: X }];
    expect(detectCrossSessionCollisions(classified, [intentRow]).length).toBe(0);
  });
});

// ── TS-FR1: worker-signal INTENT payload shape ───────────────────────────────
describe('TS-FR1: INTENT payload shape', () => {
  it('INTENT_ACTIONS are the three documented discriminator values', () => {
    expect(INTENT_ACTIONS).toEqual(['cancel-tree', 'retarget-pilot', 'claim-shared-infra']);
  });

  it('payload has intent_action set, signal_type ABSENT, files as array', () => {
    const payload = buildIntentPayload({
      action: 'retarget-pilot',
      targetSdKey: 'SD-1',
      targetTree: 'feat/x',
      targetFiles: ['a.js', 'b.js'],
      senderCallsign: 'Bravo',
      repo: '/r',
      body: 'note'
    });
    expect(payload.intent_action).toBe('retarget-pilot');
    expect(payload.signal_type).toBeUndefined(); // MUST be absent (FR-1 invariant)
    expect(Array.isArray(payload.target_files)).toBe(true);
    expect(payload.target_files).toEqual(['a.js', 'b.js']);
    expect(payload.target_sd_key).toBe('SD-1');
    expect(payload.target_tree).toBe('feat/x');
    expect(payload.sender_callsign).toBe('Bravo');
  });

  it('redact() is applied to body and each target file path', () => {
    // Built via concatenation so the literal AWS-key pattern never appears in source
    // (secret-scan hook would otherwise flag this mock fixture). redact() sees the full
    // 20-char string at runtime.
    const secret = 'AKIA' + '1234567890ABCDEF';
    const payload = buildIntentPayload({
      action: 'claim-shared-infra',
      targetFiles: ['config-' + secret + '.env'],
      body: 'token ' + secret
    });
    // The writer must not leak secrets into the broadcast row.
    expect(payload.body).not.toContain(secret);
    expect(payload.body).toContain('[REDACTED:AWS_KEY]');
    expect(payload.target_files[0]).not.toContain(secret);
    expect(payload.target_files[0]).toContain('[REDACTED:AWS_KEY]');
    // Sanity: redact is the same one used by the legacy signal path.
    expect(redact(secret)).toBe('[REDACTED:AWS_KEY]');
  });

  it('message_type for an INTENT row is INFO (enum-safe) — pinned via writer source', () => {
    const src = require('node:fs').readFileSync(path.resolve(ROOT, 'scripts/worker-signal.cjs'), 'utf8');
    // The intentMain insert must use message_type: 'INFO' (an existing enum value).
    expect(src).toMatch(/message_type:\s*'INFO'/);
    // And must NOT introduce a new message_type for intents.
    expect(src).not.toMatch(/message_type:\s*'INTENT'/);
  });
});

// ── TS-FR2: sweep reader filtering + additivity + window + idempotency ────────
describe('TS-FR2: sweep INTENT collision reader', () => {
  it('loadRecentIntents filters on payload->>intent_action (NOT signal_type)', async () => {
    let capturedNotArgs = null;
    let capturedCutoff = null;
    const sb = {
      from: (table) => {
        expect(table).toBe('session_coordination');
        return {
          select: () => ({
            gte: (_col, cutoff) => {
              capturedCutoff = cutoff;
              return {
                not: (col, op, val) => {
                  capturedNotArgs = { col, op, val };
                  return Promise.resolve({ data: [], error: null });
                }
              };
            }
          })
        };
      }
    };
    await loadRecentIntents(sb, 60);
    expect(capturedNotArgs.col).toBe('payload->>intent_action');
    expect(capturedNotArgs.op).toBe('is');
    expect(capturedNotArgs.val).toBeNull();
    expect(typeof capturedCutoff).toBe('string'); // ISO cutoff applied
  });

  it('claim-TTL window default is 24h (NOT the 60-min signal-router window)', () => {
    expect(sweep.INTENT_WINDOW_MIN).toBe(24 * 60);
  });

  it('matches on branch (current_branch) as well as sd_key', () => {
    const intentRow = {
      id: 'i', sender_session: 'sX',
      payload: buildIntentPayload({ action: 'cancel-tree', targetTree: 'feat/shared' })
    };
    const classified = [
      { session_id: 'sY', status: 'ACTIVE', sd_key: 'SD-Z', current_branch: 'feat/shared' }
    ];
    const c = detectCrossSessionCollisions(classified, [intentRow]);
    expect(c.length).toBe(1);
    expect(c[0].reasons).toContain('branch');
  });

  it('non-INTENT rows (no intent_action) are ignored by the reader', () => {
    const signalRow = { id: 's', sender_session: 'sX', payload: { signal_type: 'stuck', body: 'x' } };
    const classified = [{ session_id: 'sY', status: 'ACTIVE', sd_key: 'SD-Z', current_branch: 'feat/q' }];
    expect(detectCrossSessionCollisions(classified, [signalRow]).length).toBe(0);
  });

  it('only flags LIVE sessions (ACTIVE / ALIVE_*) — dead/stale sessions are not collided', () => {
    const X = 'SD-DEAD-1';
    const intentRow = { id: 'i', sender_session: 'sX', payload: buildIntentPayload({ action: 'cancel-tree', targetSdKey: X }) };
    const dead = [{ session_id: 'sDead', status: 'DEAD', sd_key: X }];
    const stale = [{ session_id: 'sStale', status: 'STALE_UNKNOWN', sd_key: X }];
    expect(detectCrossSessionCollisions(dead, [intentRow]).length).toBe(0);
    expect(detectCrossSessionCollisions(stale, [intentRow]).length).toBe(0);
  });

  it('is idempotent — repeated calls on identical input yield identical records', () => {
    const X = 'SD-IDEM-1';
    const intentRow = { id: 'i', sender_session: 'sX', payload: buildIntentPayload({ action: 'cancel-tree', targetSdKey: X }) };
    const classified = [{ session_id: 'sV', status: 'ACTIVE', sd_key: X, current_branch: 'feat/v' }];
    const a = detectCrossSessionCollisions(classified, [intentRow]);
    const b = detectCrossSessionCollisions(classified, [intentRow]);
    expect(a).toEqual(b);
  });

  it('ADDITIVE: existing dup-claim (bySD) + WORKTREE_CONFLICT (branchSessions) source logic is unchanged', () => {
    const src = require('node:fs').readFileSync(path.resolve(ROOT, 'scripts/stale-session-sweep.cjs'), 'utf8');
    // dup-claim conflict detection still present.
    expect(src).toMatch(/const conflicts = Object\.entries\(bySD\)\.filter/);
    expect(src).toContain('SWEEP_CONFLICT_RESOLUTION');
    // WORKTREE_CONFLICT branch warning still present and unchanged in form.
    expect(src).toMatch(/WORKTREE_CONFLICT: branch /);
    // The new INTENT collision path is clearly separate + flag-gated.
    expect(src).toMatch(/INTENT_COLLISION/);
    expect(src).toMatch(/if \(DECONFLICTION_ENABLED\) \{/);
  });
});
