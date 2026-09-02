/**
 * QF-20260902-879 — a hand-sent morning brief carried a hand-typed dedupe key
 * ("morning-brief-2026-09-02", hyphens) that didn't match the durable sweep's own key shape
 * ("morning_brief:2026-09-02", underscore+colon — chairman-morning-brief-sweep.mjs:105), so a
 * late scheduled run enqueued a second brief. The hand body also carried a number recalled from
 * seat memory ("Six fixes merged") instead of one read from an instrument (instruments read 37
 * PRs merged / 28 fix-titled).
 *
 * Fix: --morning-brief composes kind+dedupe-key through computeMorningBriefEnvelope (the SAME
 * etDateStr the sweep imports) and the body through buildMorningReviewBody (the SAME function
 * the sweep calls) — never a hand-typed --body/--kind/--dedupe-key for this send.
 *
 * computeMorningBriefEnvelope is pinned equal to the sweep's own in-module dedupeKey formula
 * without a live DB (mirrors chairman-morning-brief-sweep.test.js TS-1's assertion). The CLI
 * refusal test spawns the real script (matching adam-chairman-sms-cli-reply-flag.test.js's
 * convention) and exits before any DB/network call, so no live Supabase creds are needed.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMorningBriefEnvelope } from '../../../scripts/adam-chairman-sms.mjs';
import { etDateStr } from '../../../scripts/cron/chairman-morning-brief-sweep.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'adam-chairman-sms.mjs');

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO });
}

describe('computeMorningBriefEnvelope — hand path matches the sweep envelope exactly', () => {
  it('kind is morning_brief and dedupeKey is morning_brief:<ET date> — the SAME shape the sweep computes at chairman-morning-brief-sweep.mjs:105', () => {
    const now = new Date('2026-09-02T14:30:00Z');
    const envelope = computeMorningBriefEnvelope(now);
    expect(envelope.kind).toBe('morning_brief');
    expect(envelope.dedupeKey).toBe(`morning_brief:${etDateStr(now)}`);
    expect(envelope.dedupeKey).toBe('morning_brief:2026-09-02');
  });

  it('never the hand-typed hyphenated shape witnessed in production (morning-brief-<date>)', () => {
    const envelope = computeMorningBriefEnvelope(new Date('2026-09-02T14:30:00Z'));
    expect(envelope.dedupeKey).not.toBe('morning-brief-2026-09-02');
  });
});

describe('adam-chairman-sms CLI --morning-brief', () => {
  it('is accepted by the flag-strict guard, not rejected as unknown', () => {
    // Combined with a refusal-triggering flag so this exits before any DB call while still
    // proving the guard itself recognizes --morning-brief.
    const res = run(['--morning-brief', '--body', 'hand text']);
    expect(res.stderr).not.toMatch(/Unknown flag/);
  });

  it('is documented in --help usage', () => {
    const res = run(['--help']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('--morning-brief');
  });

  it('REFUSES a hand-typed --body alongside --morning-brief (the body composer refuses a number without an instrument read)', () => {
    const res = run(['--morning-brief', '--body', 'Six fixes merged since midnight']);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/composes kind\/dedupe-key\/body from instruments/);
  });

  it('REFUSES a hand-typed --kind alongside --morning-brief', () => {
    const res = run(['--morning-brief', '--kind', 'status_update']);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/composes kind\/dedupe-key\/body from instruments/);
  });

  it('REFUSES a hand-typed --dedupe-key alongside --morning-brief', () => {
    const res = run(['--morning-brief', '--dedupe-key', 'morning-brief-2026-09-02']);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/composes kind\/dedupe-key\/body from instruments/);
  });
});
