// QF-20260711-095 — generalizes a round-1 CRITICAL finding: adam-quiet-tick.mjs emitted
// QUIET_TICK_VENTURE_STALL_ALERT/QUIET_TICK_INBOX_CAP that adam-startup-check.mjs's prompt
// allowlist never mentioned, so those lines would silently fall through the tick's "NO-OP if
// output contains none of X/Y/Z" gate and never get actioned.
import { describe, it, expect } from 'vitest';
import { extractTokens, extractEmittedTokens, extractAllowlistedTokens, checkPairs, loadAllowlist, PAIRS } from '../../../scripts/lint/quiet-tick-token-parity-lint.mjs';

describe('extractTokens', () => {
  it('finds a token used as a direct string literal in a console.log call', () => {
    const src = 'console.log(\'QUIET_TICK_PING=adam reason=x\');';
    expect(extractTokens(src)).toEqual(new Set(['QUIET_TICK_PING']));
  });

  it('finds tokens assigned to a variable via a ternary before being interpolated (the real adam-quiet-tick.mjs shape)', () => {
    const src = `
      for (const i of items) {
        const token = i.isDirective ? 'QUIET_TICK_INBOX_DIRECTIVE' : 'QUIET_TICK_INBOX_ITEM';
        console.log(\`\${token}=adam id=\${i.id}\`);
      }
    `;
    const found = extractTokens(src);
    expect(found.has('QUIET_TICK_INBOX_DIRECTIVE')).toBe(true);
    expect(found.has('QUIET_TICK_INBOX_ITEM')).toBe(true);
  });

  it('finds a token even when its own string literal contains a semicolon (the real QUIET_TICK_INBOX_CAP shape)', () => {
    const src = 'console.log(\'QUIET_TICK_INBOX_CAP=adam fetched=50 oldest-first — within-window overflow; ack surfaced rows to reach newer ones\');';
    expect(extractTokens(src).has('QUIET_TICK_INBOX_CAP')).toBe(true);
  });

  it('does NOT find a token that only appears in a comment', () => {
    const src = '// consider adding QUIET_TICK_FUTURE_TOKEN someday\nconsole.log(\'nothing here\');';
    expect(extractTokens(src).has('QUIET_TICK_FUTURE_TOKEN')).toBe(false);
  });

  it('does NOT find a token inside a block comment', () => {
    const src = '/* QUIET_TICK_BLOCK_COMMENTED */\nconsole.log(\'QUIET_TICK_REAL=x\');';
    const found = extractTokens(src);
    expect(found.has('QUIET_TICK_BLOCK_COMMENTED')).toBe(false);
    expect(found.has('QUIET_TICK_REAL')).toBe(true);
  });

  it('extractEmittedTokens and extractAllowlistedTokens are the same extractor (aliases)', () => {
    expect(extractEmittedTokens).toBe(extractTokens);
    expect(extractAllowlistedTokens).toBe(extractTokens);
  });
});

describe('checkPairs', () => {
  it('flags a token the emitter prints but the consumer never mentions (missingFromConsumer)', () => {
    const results = checkPairs(
      [{ emitter: '__fixtures__/emitter.mjs', consumer: '__fixtures__/consumer.mjs' }],
      makeFixtureRoot({
        '__fixtures__/emitter.mjs': 'console.log(\'QUIET_TICK_PING=x\'); console.log(\'QUIET_TICK_NEW_ALERT=y\');',
        '__fixtures__/consumer.mjs': 'prompt: \'If output has no QUIET_TICK_PING lines, NO-OP.\'',
      })
    );
    expect(results).toHaveLength(1);
    expect(results[0].missingFromConsumer).toEqual(['QUIET_TICK_NEW_ALERT']);
  });

  it('flags a token the consumer mentions but the emitter never prints (deadInConsumer)', () => {
    const results = checkPairs(
      [{ emitter: '__fixtures__/emitter.mjs', consumer: '__fixtures__/consumer.mjs' }],
      makeFixtureRoot({
        '__fixtures__/emitter.mjs': 'console.log(\'QUIET_TICK_PING=x\');',
        '__fixtures__/consumer.mjs': 'prompt: \'If output has no QUIET_TICK_PING / QUIET_TICK_GHOST lines, NO-OP.\'',
      })
    );
    expect(results[0].missingFromConsumer).toEqual([]);
    expect(results[0].deadInConsumer).toEqual(['QUIET_TICK_GHOST']);
  });

  it('QUIET_TICK_ERROR is exempt from the missing-from-consumer check (structural, not a domain event)', () => {
    const results = checkPairs(
      [{ emitter: '__fixtures__/emitter.mjs', consumer: '__fixtures__/consumer.mjs' }],
      makeFixtureRoot({
        '__fixtures__/emitter.mjs': 'console.error(\'QUIET_TICK_ERROR=x\', e.message);',
        '__fixtures__/consumer.mjs': 'prompt: \'no quiet-tick tokens mentioned at all\'',
      })
    );
    expect(results[0].missingFromConsumer).toEqual([]);
  });

  it('reports 0 drift when emitted and allowlisted sets match exactly', () => {
    const results = checkPairs(
      [{ emitter: '__fixtures__/emitter.mjs', consumer: '__fixtures__/consumer.mjs' }],
      makeFixtureRoot({
        '__fixtures__/emitter.mjs': 'console.log(\'QUIET_TICK_PING=x\');',
        '__fixtures__/consumer.mjs': 'prompt: \'QUIET_TICK_PING\'',
      })
    );
    expect(results[0].missingFromConsumer).toEqual([]);
    expect(results[0].deadInConsumer).toEqual([]);
  });
});

describe('the real PAIRS (regression guard against reintroducing the round-1 finding)', () => {
  it('adam-quiet-tick.mjs -> adam-startup-check.mjs has 0 missing-from-consumer tokens', () => {
    const results = checkPairs();
    const adamPair = results.find((r) => r.pair.includes('adam-quiet-tick'));
    expect(adamPair.missingFromConsumer, `drift reintroduced: ${adamPair.missingFromConsumer.join(', ')}`).toEqual([]);
  });

  it('PAIRS covers both known emitter/consumer pairs', () => {
    expect(PAIRS).toHaveLength(2);
    expect(PAIRS.some((p) => p.emitter.includes('adam-quiet-tick'))).toBe(true);
    expect(PAIRS.some((p) => p.emitter.includes('coordinator-quiet-tick'))).toBe(true);
  });
});

describe('loadAllowlist', () => {
  it('a missing allowlist file loads as empty (no throw)', () => {
    expect(() => loadAllowlist('/nonexistent/path/allowlist.json')).not.toThrow();
    expect(loadAllowlist('/nonexistent/path/allowlist.json')).toEqual({});
  });
});

// ---- fixture helper: writes in-memory-only via a temp dir so checkPairs' readFileSync works ----
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

function makeFixtureRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'quiet-tick-lint-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}
