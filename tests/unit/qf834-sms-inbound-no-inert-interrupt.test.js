// QF-20260808-834: stop hard-interrupting toward an INERT remediation.
//
// QUIET_TICK_* tokens ARE the interrupt — adam-startup-check allowlists them and reads a tick
// carrying none as a NO-OP. QUIET_TICK_SMS_INBOUND points at scripts/sms-relay-drain.cjs, which is
// a no-op while SMS_RELAY_DRAIN_ENABLED is unset. So every undrained row re-fired the interrupt on
// every tick toward an action nobody could take, and a genuinely-new inbound hid behind the
// permanent stale one.
//
// WHAT THIS SUITE PROVES, and what it does NOT. These are SOURCE pins on the emit site. The emit
// lives inside a long tick function that reaches the network and the DB, so this does not execute
// it. It proves the shipped source withholds the interrupt token when the flag is off and still
// emits it when on — not that a live tick behaves that way. Saying so explicitly, because a suite
// that cannot run the thing it describes must not be read as if it did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raw = fs.readFileSync(path.join(process.cwd(), 'scripts/adam-quiet-tick.mjs'), 'utf8');
// Strip comments: the source's own explanation names the token being pinned, and a scan that
// matches its own commentary is the self-satisfying-test trap.
const src = raw
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

// The block from the flag read to the end of the emit loop.
const block = src.slice(src.indexOf('const smsDrainEnabled'), src.indexOf('QUIET_TICK_OUTBOUND_PROBE'));

describe('QF-834 SMS inbound interrupt is gated on the drain flag', () => {
  it('reads SMS_RELAY_DRAIN_ENABLED at all (the file previously had ZERO references)', () => {
    expect(src).toContain('SMS_RELAY_DRAIN_ENABLED');
  });

  it('withholds the interrupt when the drain is disabled', () => {
    expect(block).toContain('if (!smsDrainEnabled)');
    expect(block).toContain('continue;');
  });

  it('the not-interrupting branch never re-arms the INTERRUPT token', () => {
    // ORIGINALLY this asserted the branch carried NO QUIET_TICK_ token at all. That was WRONG, and
    // it was my error: the summary still prints `sms=${smsInbound.count}` (rows.length, independent
    // of the flag), so a tokenless suppressed branch produced `sms=1` alongside ZERO surfaced
    // lines — the count-vs-surface mismatch QF-20260808-673 names, where a reader trusting
    // "no lines = no SMS" treats the tick as a NO-OP and misses the chairman.
    //
    // The branch now emits QUIET_TICK_SMS_SUPPRESSED, following the established convention of
    // QUIET_TICK_STALL_SUPPRESSED / QUIET_TICK_VENTURE_PARK_SUPPRESSED: informational, deliberately
    // ABSENT from the NO-OP allowlist, so the exclusion is never silent and no interrupt re-arms.
    // What must remain true is narrower and sharper than "no token": not the INTERRUPT token.
    const quiet = block.slice(block.indexOf('if (!smsDrainEnabled)'), block.indexOf('continue;'));
    expect(quiet.length).toBeGreaterThan(0);
    expect(quiet).not.toContain('QUIET_TICK_SMS_INBOUND');
    expect(quiet).toContain('QUIET_TICK_SMS_SUPPRESSED');
  });

  it('reconciles the count: the suppressed line references sms=${smsInbound.count}', () => {
    // Without this the two numbers can drift apart again silently.
    const quiet = block.slice(block.indexOf('if (!smsDrainEnabled)'), block.indexOf('continue;'));
    expect(quiet).toContain('smsInbound.count');
  });

  it('QUIET_TICK_SMS_SUPPRESSED is NOT in the NO-OP allowlist, but SMS_INBOUND still is', () => {
    // Two-sided, and the reason the exclusion is pinned: allowlisting the suppressed token would
    // re-arm an interrupt toward an inert drain — the exact alert-fatigue loop QF-834 removed.
    // Flip the first expectation only if that decision is deliberately reversed.
    const check = fs.readFileSync(path.join(process.cwd(), 'scripts/adam-startup-check.mjs'), 'utf8');
    const m = check.match(/If the output contains NO ([\s\S]*?QUIET_TICK_ERROR)/);
    expect(m).not.toBeNull();
    expect(m[1]).not.toContain('QUIET_TICK_SMS_SUPPRESSED');
    expect(m[1]).toContain('QUIET_TICK_SMS_INBOUND');
  });

  it('STILL emits the interrupt when the drain IS enabled — two-sided', () => {
    // A fix that removed the token unconditionally would pass every test above and silently
    // disable the detector forever.
    expect(block).toContain('QUIET_TICK_SMS_INBOUND=adam');
  });

  it('does NOT go dark: the disabled path still prints the row', () => {
    // The ticket offered "skip entirely". A detector that goes fully dark on a CHAIRMAN SMS
    // channel is a worse failure than the alert fatigue being fixed.
    const quiet = block.slice(block.indexOf('if (!smsDrainEnabled)'), block.indexOf('continue;'));
    expect(quiet).toContain('console.log');
    expect(quiet).toContain('${detail}');
  });

  it('treats explicit falsey flag values as OFF, not just unset', () => {
    expect(src).toContain("['', '0', 'false', 'off', 'no']");
  });
});
