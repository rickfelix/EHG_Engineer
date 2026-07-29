/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-0 / TS-0 — the audit_log column the negative path reads.
 *
 * THE DEFECT THIS PINS. `collectNegativeRefs` selected and filtered on `audit_log.event`, and
 * `red-merge-detector.mjs` inserted `event:`. That column does not exist — the real one is
 * `event_type` — so PostgREST answered 42703 on both sides. Both sides sit inside fail-open catches,
 * so the write silently no-opped and the read silently returned empty, which is indistinguishable
 * from "no red merges happened". Measured before the fix: ZERO RED_MERGE_DETECTED rows had ever
 * existed, and the Solomon ledger had never recorded a negative outcome in 1100 rows.
 *
 * WHY NO EXISTING TEST CAUGHT IT, and what that dictates about this one. Producer and consumer
 * agreed with EACH OTHER. Any test that wrote through the producer and read through the consumer
 * would have exercised two halves of the same mistake and passed. So this asserts against the
 * DATABASE'S OWN column vocabulary, not against the other half of the pair — the only reference
 * that was ever independent.
 *
 * Unit tier on purpose: no describeDb, no HAS_REAL_DB, no live client. The db project is DISABLED
 * in this repo ("0 of db tests will run"), so anything gated on real credentials would skip
 * SILENTLY AND GREEN — the same shape of invisible pass that let the original defect survive.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const CONSUMER = resolve(root, 'scripts/solomon-ledger-reconcile.cjs');
const PRODUCER = resolve(root, 'scripts/ci/red-merge-detector.mjs');

/** The real audit_log columns, as returned by the live table. The independent reference. */
const AUDIT_LOG_COLUMNS = Object.freeze([
  'id', 'event_type', 'entity_type', 'entity_id',
  'old_value', 'new_value', 'metadata', 'severity', 'created_by', 'created_at',
]);

/** Strip comments so prose naming the old column never satisfies or trips an assertion. */
function code(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('FR-0 — the negative path reads a column that actually exists', () => {
  it('`event` is NOT a real audit_log column, and `event_type` is', () => {
    // The premise, asserted rather than assumed. If the schema ever gains `event`, this test says so
    // before the rest of the file starts lying about why it exists.
    expect(AUDIT_LOG_COLUMNS).not.toContain('event');
    expect(AUDIT_LOG_COLUMNS).toContain('event_type');
  });

  it('the CONSUMER selects and filters on event_type', () => {
    const src = code(CONSUMER);
    expect(src).toMatch(/from\('audit_log'\)\s*\.\s*select\('event_type/);
    expect(src).toMatch(/\.in\('event_type',/);
  });

  it('the PRODUCER writes event_type on both audit events', () => {
    const src = code(PRODUCER);
    expect(src).toContain("event_type: 'RED_MERGE_DETECTED'");
    expect(src).toContain("event_type: 'BASELINE_ROT_DETECTED'");
  });

  it('NEITHER side references a bare `event` key against audit_log', () => {
    // The regression guard. `event:` as an object key or `'event'` as a column argument is the exact
    // shape of the original bug, and it is cheap to reintroduce by copy-paste.
    for (const [name, path] of [['consumer', CONSUMER], ['producer', PRODUCER]]) {
      const src = code(path);
      expect(src, `${name} uses a bare event: key`).not.toMatch(/\bevent:\s*'/);
      expect(src, `${name} passes 'event' as a column`).not.toMatch(/\.(select|in|eq)\('event'/);
    }
  });

  it('every audit_log column either side names is a REAL column', () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT, and the reason this file is worth
    // keeping after the immediate fix: it validates against the schema rather than against the other
    // half of the pair, so a future column rename cannot be agreed-upon-and-wrong by both sides.
    // TOP-LEVEL keys only. `metadata` is a jsonb column whose CONTENTS are free-form, so its inner
    // keys are not column names — an earlier version of this assertion flagged `rule` inside
    // metadata and was wrong about the code rather than right about a bug. Strip nested objects
    // before reading keys.
    const stripNested = (body) => {
      let out = body;
      for (let i = 0; i < 5 && /\{[^{}]*\}/.test(out); i++) out = out.replace(/\{[^{}]*\}/g, '""');
      return out;
    };
    const producerKeys = [...code(PRODUCER).matchAll(/from\('audit_log'\)\s*\.\s*insert\(\{([\s\S]*?)\n\s*\}\)/g)]
      .flatMap((m) => [...stripNested(m[1]).matchAll(/(?:^|,)\s*(\w+)\s*:/g)].map((k) => k[1]));
    expect(producerKeys.length, 'no audit_log insert found — the regex drifted, not the code').toBeGreaterThan(0);
    for (const key of producerKeys) {
      expect(AUDIT_LOG_COLUMNS, `producer writes unknown audit_log column "${key}"`).toContain(key);
    }

    const consumerCols = [...code(CONSUMER).matchAll(/from\('audit_log'\)\s*\.\s*select\('([^']+)'/g)]
      .flatMap((m) => m[1].split(',').map((c) => c.trim()));
    expect(consumerCols.length, 'no audit_log select found').toBeGreaterThan(0);
    for (const col of consumerCols) {
      expect(AUDIT_LOG_COLUMNS, `consumer reads unknown audit_log column "${col}"`).toContain(col);
    }
  });

  it('the producer writes a row the consumer can actually FILTER — not metadata-only', () => {
    // A row carrying only metadata would satisfy every assertion above while being unfindable by the
    // consumer's .in() filter. The event_type value must match a token the consumer filters on.
    const producer = code(PRODUCER);
    const consumer = code(CONSUMER);
    const emitted = [...producer.matchAll(/event_type:\s*'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(emitted).toContain('RED_MERGE_DETECTED');
    // NEGATIVE_AUDIT_EVENTS is what the consumer's .in() is fed.
    const negList = consumer.match(/NEGATIVE_AUDIT_EVENTS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]/);
    expect(negList, 'NEGATIVE_AUDIT_EVENTS not found in the consumer').toBeTruthy();
    expect(negList[1]).toContain('RED_MERGE_DETECTED');
  });
});
