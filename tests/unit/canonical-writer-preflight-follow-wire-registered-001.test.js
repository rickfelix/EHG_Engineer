// SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-4 (FR-3a), TS-5.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  checkScriptLibWriters,
  checkDbFunctionWriters,
  parseChokeRegistryIdentities,
  assertRegistryMatchesHardcodedList,
  SCRIPT_LIB_WRITERS,
  DB_FUNCTION_WRITERS,
} from '../../scripts/one-off/canonical-writer-preflight-follow-wire-registered-001.mjs';

const CHOKE_FILE = 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql';

describe('SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 FR-4: canonical-writer static preflight', () => {
  it('reports all 13 FR-1 script/lib writers as wired (regression guard: catches an accidental revert of any FR-1 stamp)', () => {
    const results = checkScriptLibWriters();
    expect(results).toHaveLength(SCRIPT_LIB_WRITERS.length);
    const unwired = results.filter((r) => !r.wired);
    expect(unwired, `unexpectedly unwired: ${JSON.stringify(unwired)}`).toEqual([]);
  });

  it('reports zero read errors for the 13 script/lib writer files (every path in SCRIPT_LIB_WRITERS resolves to a real, readable file)', () => {
    const results = checkScriptLibWriters();
    const withErrors = results.filter((r) => r.error);
    expect(withErrors, `file read errors: ${JSON.stringify(withErrors)}`).toEqual([]);
  });

  it('the 5 FR-2 db_function writers are, at minimum, PREPARED (the amendment artifacts exist and carry the stamp) even while the choke-file edit itself is pending sign-off', () => {
    const results = checkDbFunctionWriters();
    expect(results).toHaveLength(DB_FUNCTION_WRITERS.length);
    for (const r of results) {
      expect(r.wired || r.preparedOnly, `${r.identity} is neither wired nor prepared`).toBe(true);
    }
  });

  it('MUTATION: reverting one writer file to lack its stamp is detected as unwired', () => {
    const target = SCRIPT_LIB_WRITERS.find((w) => w.identity === 'sd:cancel');
    const original = fs.readFileSync(target.file, 'utf8');
    try {
      const mutated = original.replace(`lifecycle_write_token: '${target.identity}',\n`, '');
      expect(mutated, 'mutation anchor not found -- test is stale against the real file').not.toBe(original);
      fs.writeFileSync(target.file, mutated);

      const results = checkScriptLibWriters();
      const cancelResult = results.find((r) => r.identity === 'sd:cancel');
      expect(cancelResult.wired).toBe(false);
    } finally {
      fs.writeFileSync(target.file, original);
    }

    // Restoration verified: re-running now reports wired again.
    const restored = checkScriptLibWriters().find((r) => r.identity === 'sd:cancel');
    expect(restored.wired).toBe(true);
  });

  it('parses exactly 27 writer_identity entries from the live choke file registry (regression guard for the parser itself)', () => {
    const choke = fs.readFileSync(CHOKE_FILE, 'utf8').replace(/\r\n/g, '\n');
    const ids = parseChokeRegistryIdentities(choke);
    expect(ids).toHaveLength(27);
    expect(new Set(ids).size).toBe(27); // no duplicates
    expect(ids).toContain('handoff.js');
    expect(ids).toContain('delete_venture');
  });

  it('does not throw for the current, real choke file (no undetected drift today)', () => {
    const choke = fs.readFileSync(CHOKE_FILE, 'utf8').replace(/\r\n/g, '\n');
    expect(() => assertRegistryMatchesHardcodedList(choke)).not.toThrow();
  });

  it('MUTATION (single-representation guard, TESTING finding F2): a registry entry naming an unwired writer this preflight does not know about is detected as drift, not silently ignored', () => {
    const choke = fs.readFileSync(CHOKE_FILE, 'utf8').replace(/\r\n/g, '\n');
    const injected = choke.replace(
      '      -- ── OTHER protected-column DB FUNCTIONS (writer-inventory 1a, disposition=allowlist) ─────\n',
      '      -- ── OTHER protected-column DB FUNCTIONS (writer-inventory 1a, disposition=allowlist) ─────\n' +
        "      ('a_future_unwired_writer',\n" +
        "       '{\"surface\":\"db_function\",\"protected_columns\":[\"status\"],\"stamp_wired\":false}'::jsonb,\n" +
        "       'Injected by a test to prove the drift guard fires.'),\n",
    );
    expect(injected, 'injection anchor not found -- test is stale against the real file').not.toBe(choke);
    expect(() => assertRegistryMatchesHardcodedList(injected)).toThrow(/REGISTRY DRIFT/);
  });

  it('MUTATION: a parser that finds zero identities refuses to trust the hardcoded list rather than silently reporting everything wired', () => {
    expect(() => assertRegistryMatchesHardcodedList('not a real choke file at all')).toThrow(/REGISTRY PARSE FAILURE/);
  });
});
