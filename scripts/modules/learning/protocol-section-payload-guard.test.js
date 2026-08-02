/**
 * SD-LEO-INFRA-IMPROVEMENT-APPLIER-UPSERTS-001 — tests for the leo_protocol_sections write boundary.
 *
 * THE VULNERABILITY THIS CLOSES: applyProtocolSectionChange passed a model-authored payload into an
 * unfiltered .upsert(), so a payload carrying an 'id' REPLACED a governing protocol section — the
 * Adam role contract and the phase files are reachable that way — while the learning loop
 * auto-approves at threshold 50 with no human review on every SD completion.
 *
 * FIXTURES REFLECT THE LIVE CORPUS, NOT CONVENIENT SHAPES. The string-payload case is here because
 * the full-population key scan over all 69 queue rows returned indices 0..607 — the Object.keys()
 * signature of a string. A naive pick(payload, ALLOWED) returns {} for those, which is how this fix
 * would ship looking correct and silently break the learning loop.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  sanitizeProtocolSectionPayload, ALLOWED_SECTION_COLUMNS, OVERWRITE_KEYS, PayloadRefused,
} from './protocol-section-payload-guard.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const APPLIERS = resolve(REPO_ROOT, 'scripts/modules/learning/improvement-appliers.js');
/** Comments quote the old code verbatim while explaining it — assert on CODE, not text. */
const applierCode = () => readFileSync(APPLIERS, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('FR-1 the overwrite vector is closed', () => {
  it('refuses a payload carrying an id', () => {
    expect(() => sanitizeProtocolSectionPayload({ id: 'abc-123', title: 'x', content: 'y' }))
      .toThrow(PayloadRefused);
    expect(() => sanitizeProtocolSectionPayload({ id: 'abc-123', title: 'x', content: 'y' }))
      .toThrow(/overwrite key/);
  });

  it('id is not silently strippable — it must REFUSE, not sanitize away', () => {
    // Dropping id and inserting anyway would turn an attempted overwrite into a silent append,
    // hiding the attempt. A refusal is attributable; a strip is not.
    try {
      sanitizeProtocolSectionPayload({ id: 'x', title: 't', content: 'c' }, { queueRowId: 'q-1' });
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(PayloadRefused);
      expect(e.detail).toContain('q-1');   // attributable to the originating queue row
    }
  });

  it('the applier is INSERT-ONLY — no upsert remains', () => {
    const code = applierCode();
    expect(code).not.toMatch(/\.upsert\(/);
    expect(code).toMatch(/\.from\('leo_protocol_sections'\)\s*\n?\s*\.insert\(clean\)/);
  });
});

describe('FR-3 THE CASE FIXTURES MISS: non-object payloads', () => {
  it('refuses a STRING payload loudly (measured in the live queue)', () => {
    expect(() => sanitizeProtocolSectionPayload('a raw string payload'))
      .toThrow(/not an object/);
  });

  it('refuses an array payload', () => {
    expect(() => sanitizeProtocolSectionPayload(['a', 'b'])).toThrow(/not an object/);
  });

  it('refuses null and undefined', () => {
    expect(() => sanitizeProtocolSectionPayload(null)).toThrow(/not an object/);
    expect(() => sanitizeProtocolSectionPayload(undefined)).toThrow(/not an object/);
  });

  it('never returns an empty clean object instead of throwing', () => {
    // The silent-{} path is the specific failure mode this FR exists to prevent.
    for (const bad of ['str', 42, null, undefined, ['a'], {}, { nope: 1 }]) {
      expect(() => sanitizeProtocolSectionPayload(bad)).toThrow(PayloadRefused);
    }
  });
});

describe('FR-2 allowlist — BOTH polarities', () => {
  it('drops an unexpected key', () => {
    const { clean, dropped } = sanitizeProtocolSectionPayload({ title: 'T', content: 'C', evil_column: 'x' });
    expect(clean.evil_column).toBeUndefined();
    expect(dropped).toContain('evil_column');
  });

  it('STILL WRITES the allowed columns — filtering everything is as much a failure as filtering nothing', () => {
    const { clean } = sanitizeProtocolSectionPayload({
      section_type: 'guidance', title: 'T', content: 'C', order_index: 3, metadata: { a: 1 }, evil: 'x',
    });
    expect(Object.keys(clean).sort()).toEqual(['content', 'metadata', 'order_index', 'section_type', 'title']);
  });

  it('excludes the authority/ownership columns deliberately', () => {
    // protocol_id re-parents a section; context_tier/target_file/priority decide WHERE it governs;
    // scoring_* is computed. None may be model-authored.
    for (const forbidden of ['protocol_id', 'context_tier', 'target_file', 'priority', 'scoring_total']) {
      expect(ALLOWED_SECTION_COLUMNS).not.toContain(forbidden);
    }
    expect(OVERWRITE_KEYS).toContain('id');
  });

  it('the allowlist is a frozen literal, not derived from a payload sample', () => {
    // Deriving it from observed payloads would encode today's shapes as the contract and narrow
    // silently as payloads change.
    expect(Object.isFrozen(ALLOWED_SECTION_COLUMNS)).toBe(true);
  });
});

describe('FR-4 AS CORRECTED — the append sites stay SHAPED, and are NOT sanitized', () => {
  // FR-4 as originally written said to apply the same allowlist at :253/:367. Reading those sites
  // refuted it: both build sectionData with protocol_id, which the allowlist deliberately excludes,
  // so sanitizing would strip a required field and break or orphan the inserts. And every column
  // name there is a code-authored literal, so column-name injection is structurally impossible.
  // The real requirement is that they keep building shaped objects.
  it('neither append site spreads a raw payload into columns', () => {
    const code = applierCode();
    expect(code).not.toMatch(/\.insert\(\s*\{\s*\.\.\.payload/);
    expect(code).not.toMatch(/\.insert\(payload\)/);
  });

  it('the append sites still set protocol_id (which sanitizing would have stripped)', () => {
    const code = applierCode();
    expect(code).toMatch(/protocol_id:/);
  });

  it('model content reaches VALUES only, never column names', () => {
    const code = applierCode();
    // sectionData keys are literals; payload appears on the right-hand side.
    expect(code).toMatch(/content:\s*payload\?\.improvement/);
    // A COMPUTED KEY INSIDE AN OBJECT LITERAL is the injection shape — `{ [payload.x]: v }`.
    // The first version of this asserted /\[\s*payload\./ over the whole file, which also flagged
    // gateMap[payload.affected_phase] — a safe read from a hardcoded local map, in a different
    // function, that produces no column name. Assert the actual shape, not any bracket near payload.
    expect(code).not.toMatch(/[{,]\s*\[\s*payload/);
  });
});

describe('FR-6 scope boundary held', () => {
  it('protocol_constitution is not touched', () => {
    expect(applierCode()).not.toMatch(/protocol_constitution/);
  });

  it('the literal target_table check survives', () => {
    expect(applierCode()).toMatch(/target_table !== 'leo_protocol_sections'/);
  });

  it('the auto-approve threshold is not changed by this SD', () => {
    const idx = readFileSync(resolve(REPO_ROOT, 'scripts/modules/learning/index.js'), 'utf8');
    expect(idx).toMatch(/autoApproveCommand\(threshold = 50/);
  });
});
