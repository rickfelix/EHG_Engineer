/**
 * Unit tests — SD-LEO-INFRA-COACHING-BODY-COLUMN-001
 * FIX: coordinator coaching / self-review solicitation rows must populate the TOP-LEVEL
 * `body` column, not only `payload.body` (fb 0a9c63da). Readers keyed on the top-level
 * body column (e.g. scripts/hooks/coordination-inbox.cjs) saw nothing on the buggy rows.
 *
 * Static-source regression (mirrors the established pattern in
 * coordinator-self-review-review-request-kind.test.js): asserts each fixed call site
 * carries BOTH a top-level `body` key AND a `payload.body` key, using the SAME source
 * variable, so a future edit cannot silently reintroduce the divergence.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('coordinator-self-review.mjs: coaching solicitation rows carry top-level body', () => {
  const text = src('scripts/coordinator-self-review.mjs');

  it('worker-directed periodic-review solicitation sets top-level body === payload.body (both from `body`)', () => {
    const m = /insertCoordinationRow\(db, \{ target_session: w,[\s\S]{0,300}\}\);/.exec(text);
    expect(m).toBeTruthy();
    const call = m[0];
    expect(call).toMatch(/\bbody,/);
    expect(call).toMatch(/payload: \{ kind: 'coordinator_reply', body \}/);
  });

  it('Adam-directed bidirectional review solicitation sets top-level body === payload.body (both from `adamBody`)', () => {
    const m = /insertCoordinationRow\(db, \{ target_session: a,[\s\S]{0,300}\}\);/.exec(text);
    expect(m).toBeTruthy();
    const call = m[0];
    expect(call).toMatch(/body: adamBody,/);
    expect(call).toMatch(/payload: \{ kind: 'review_request', body: adamBody \}/);
  });
});

describe('coordinator-comms-check.mjs: COMMS CHECK ping carries top-level body', () => {
  const text = src('scripts/coordinator-comms-check.mjs');

  it('comms-check ping sets top-level body === payload.body (both from `body`)', () => {
    const m = /insertCoordinationRow\(db, \{ sender_session: me, target_session: wid,[\s\S]{0,300}\}\);/.exec(text);
    expect(m).toBeTruthy();
    const call = m[0];
    expect(call).toMatch(/subject: 'COMMS CHECK', body,/);
    expect(call).toMatch(/payload: \{ body, kind: 'comms_check'/);
  });
});

describe('insertCoordinationRow: top-level body reaches the actual insert unfiltered', () => {
  const text = src('lib/coordinator/dispatch.cjs');

  it('the row object (carrying any caller-supplied top-level body) is passed to .insert() as-is', () => {
    expect(text).toMatch(/\.insert\(row\)/);
  });
});
