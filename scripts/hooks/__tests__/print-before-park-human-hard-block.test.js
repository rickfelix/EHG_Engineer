// QF-20260831-834: the v4 bounded 3-strike re-block release (`blocksSoFar >= MAX_BLOCKS_PER_TURN`)
// must never apply to a genuinely human-prompted turn -- that soft-allow was the exact
// silent-park failure mode witnessed repeatedly by the chairman (2026-08-30/31), on turns
// ending on a non-ScheduleWakeup tool call (already-hard-blocked shape, see
// isFinalBlockScheduleWakeup). The soft 3-strike release stays available for a loop/cron
// turn wedged on some other non-text ending.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const PBP_PATH = path.resolve(__dirname, '../print-before-park.cjs');
const pbp = require(PBP_PATH);

const humanPrompt = () => ({ type: 'user', origin: { kind: 'human' }, timestamp: new Date().toISOString() });
const otherTool = (name = 'Bash') => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: {} }] } });
const textEntry = (t = 'done') => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });

describe('decide() exposes humanPrompted', () => {
  it('is true when P is a genuine human prompt ending on a non-text block', () => {
    const v = pbp.decide([humanPrompt(), otherTool()]);
    expect(v.block).toBe(true);
    expect(v.humanPrompted).toBe(true);
  });

  it('is false when P is a loop prompt outside the engaged window', () => {
    const stalePrompt = { type: 'user', isMeta: true, promptSource: 'system', timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
    const v = pbp.decide([stalePrompt, otherTool()]);
    expect(v.block).toBe(false);
    expect(v.humanPrompted).toBe(false);
  });

  it('is false for a no-prompt-in-window verdict', () => {
    const v = pbp.decide([otherTool()]);
    expect(v.block).toBe(false);
    expect(v.humanPrompted).toBe(false);
  });

  it('is true even on a passing (ends-on-text) human turn', () => {
    const v = pbp.decide([humanPrompt(), otherTool(), textEntry()]);
    expect(v.block).toBe(false);
    expect(v.humanPrompted).toBe(true);
  });
});

// Source-shape assertion (matches this repo's own convention for hook internals that read
// stdin directly and have no exported test seam for main() -- see wakeup-arm-evidence.test.js's
// hookSrc-based assertions on stop-loop-wakeup-reminder.cjs).
describe('main(): the bounded 3-strike release is gated on !verdict.humanPrompted', () => {
  const src = fs.readFileSync(PBP_PATH, 'utf8');

  it('the release condition requires humanPrompted to be falsy', () => {
    expect(src).toMatch(/blocksSoFar >= MAX_BLOCKS_PER_TURN\s*&&\s*!verdict\.humanPrompted/);
  });

  it('the ScheduleWakeup unconditional hard-block still has no such gate (stays absolute)', () => {
    const block = src.match(/if \(isFinalBlockScheduleWakeup\(entries\)\)[\s\S]{0,200}/);
    expect(block).not.toBeNull();
    expect(block[0]).not.toMatch(/humanPrompted/);
  });
});
