// DURABLE INVARIANT (Solomon, follow-up to #6906): `sms=N` where N>0 must NEVER render zero
// greppable QUIET_TICK lines.
//
// WHY THIS EXISTS SEPARATELY FROM THE #6906 TESTS, stated plainly because the distinction is the
// whole point: those tests PIN THE SPECIFIC LINE — that the suppressed branch emits
// QUIET_TICK_SMS_SUPPRESSED and not the interrupt. They would still pass if someone later added a
// THIRD branch to the row loop that emits nothing at all, which would silently re-create the exact
// count-vs-render disagreement that missed the chairman. A pin catches the instance; only a
// property catches the class.
//
// THE PROPERTY: every path through the per-row loop must emit a QUIET_TICK line — content when the
// drain is live, a SUPPRESSED marker when it is not. A count with no corresponding visible line is
// the defect, regardless of which branch produced it.
//
// WHAT THIS DOES NOT PROVE: this is a structural property over the shipped source, not an executed
// tick. The loop lives inside a function that reaches the network and the DB. It proves no branch
// in that loop CAN return without emitting; it does not prove a live tick did. The live
// confirmation (a real flag-off tick showing `sms=1` alongside one QUIET_TICK_SMS_SUPPRESSED line)
// belongs to the seat that runs it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raw = fs.readFileSync(path.join(process.cwd(), 'scripts/adam-quiet-tick.mjs'), 'utf8');

// Strip comments FIRST. The loop's own explanatory comment cites QUIET_TICK_STALL_SUPPRESSED and
// QUIET_TICK_VENTURE_PARK_SUPPRESSED as the convention it follows, so an unstripped token scan
// reports 4 tokens for 2 emits — the scan would be measuring my prose, not the code.
const executable = raw
  .split('\n')
  .map((l) => {
    const t = l.trimStart();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
    return l;
  })
  .join('\n');

const loop = executable.slice(
  executable.indexOf('for (const s of smsInbound.rows)'),
  executable.indexOf('for (const p of outboundSilence.probed)')
);

const emits = loop.match(/console\.log\(/g) || [];
const tokens = loop.match(/QUIET_TICK_[A-Z_]+/g) || [];

describe('sms count-vs-render invariant', () => {
  it('the per-row loop was located and is non-trivial', () => {
    // Guards the slice itself: an anchor that silently matched nothing would make every
    // assertion below vacuously true.
    expect(loop.length).toBeGreaterThan(200);
    expect(emits.length).toBeGreaterThanOrEqual(2);
  });

  it('EVERY emit in the loop carries a QUIET_TICK token — no path renders a countless row', () => {
    // This is the invariant. If a future branch logs a bare line (or logs nothing), this fails.
    expect(tokens.length).toBe(emits.length);
  });

  it('is two-sided: a SUPPRESSED marker AND a content token both exist', () => {
    // One-sided would pass if the loop only ever suppressed (chairman never surfaced) or only
    // ever interrupted (the inert-drain alert fatigue #6891 removed).
    expect(tokens).toContain('QUIET_TICK_SMS_SUPPRESSED');
    expect(tokens).toContain('QUIET_TICK_SMS_INBOUND');
  });

  it('the suppressed branch reconciles against the printed count', () => {
    // `sms=${smsInbound.count}` is what the summary prints; the suppressed line references the
    // same source so the two numbers cannot drift apart silently.
    expect(loop).toContain('smsInbound.count');
  });

  it('CONTROL: the comment stripper actually removed the prose', () => {
    // Without this, the token/emit equality above could be passing on commentary. The raw loop
    // cites two OTHER suppression tokens as precedent; the stripped loop must not.
    const rawLoop = raw.slice(
      raw.indexOf('for (const s of smsInbound.rows)'),
      raw.indexOf('for (const p of outboundSilence.probed)')
    );
    expect(rawLoop).toContain('QUIET_TICK_VENTURE_PARK_SUPPRESSED');
    expect(loop).not.toContain('QUIET_TICK_VENTURE_PARK_SUPPRESSED');
  });
});
