/**
 * Unit tests — SD-LEO-INFRA-DISTINCT-REVIEW-REQUEST-001
 * FR-1: review_request is a distinct, registered kind (not coordinator_request/coordinator_reply).
 * FR-2: the Adam leg of coordinator-self-review.mjs's bidirectional review emits it, and the
 *       shared classifier (imported DIRECTIVE_KINDS, never duplicated) treats it as action-required.
 * FR-3: the worker leg (out of scope for this SD) is untouched — proves backward compatibility.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);

const ROOT = path.resolve(__dirname, '../..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ws = require('../../lib/fleet/worker-status.cjs');
const { isDirectiveRow } = require('../../scripts/adam-advisory.cjs');

describe('FR-1: review_request kind registered', () => {
  it('PAYLOAD_KINDS.REVIEW_REQUEST === review_request', () => {
    expect(ws.PAYLOAD_KINDS.REVIEW_REQUEST).toBe('review_request');
  });

  it('is a DIRECTIVE_KIND — deliver-not-consume, never auto-acked', () => {
    expect(ws.DIRECTIVE_KINDS).toContain('review_request');
    expect(isDirectiveRow({ payload: { kind: 'review_request' } })).toBe(true);
  });

  it('is distinct from coordinator_request and coordinator_reply', () => {
    expect('review_request').not.toBe('coordinator_request');
    expect(isDirectiveRow({ payload: { kind: 'coordinator_reply' } })).toBe(false);
  });
});

describe('FR-2/FR-3: coordinator-self-review.mjs Adam leg emits review_request; worker leg unchanged', () => {
  const text = src('scripts/coordinator-self-review.mjs');

  it('Adam-directed bidirectional review send uses kind: review_request', () => {
    expect(text).toMatch(/target_session: a,[\s\S]{0,300}kind: 'review_request'/);
  });

  it('worker-directed review solicitation still uses kind: coordinator_reply (out of this SD scope)', () => {
    expect(text).toMatch(/target_session: w,[\s\S]{0,300}kind: 'coordinator_reply'/);
  });
});
