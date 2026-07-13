/**
 * Operator Contract gate — the D8 build-vs-run merge-time invariant.
 * (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001, design:
 *  docs/design/ehg-build-vs-run-deepdive-decisions.md @ aee41d6c §4)
 *
 * PURE MODULE — no DB access, no fs. Every input (changed files, migration SQL,
 * periodic_process_registry rows, retention policy list, SD metadata) is injected
 * so the same logic binds BOTH the harness handoff gate and the venture-factory
 * seam (FR-7) with zero duplicated detection/validation logic. The DB-reading
 * adapters live alongside this module and call these functions.
 *
 * The invariant: an SD that ships a CREATOR (new table / writer / feature flag /
 * detector) may not pass its final gate unless the SAME SD (or a dated,
 * audit-logged waiver) also ships its OPERATOR TRIPLE —
 *   (1) CONSUMER      — code that acts on the created output,
 *   (2) ARMED CADENCE — a periodic_process_registry-stamped, on-by-default cron,
 *   (3) REAPER        — a retention/TTL/retire path (lib/retention/policies.js).
 */

export const CREATOR_KINDS = Object.freeze({
  TABLE: 'table',
  WRITER: 'writer',
  FLAG: 'flag',
  DETECTOR: 'detector',
});

export const TRIPLE_MEMBERS = Object.freeze(['consumer', 'armed_cadence', 'reaper']);

/**
 * FR-1 — CREATOR detection heuristic.
 *
 * Conservative-inclusive: ambiguous cases classify AS a CREATOR so the operator
 * triple is demanded rather than silently skipped (TR-2 fail-toward-safe).
 *
 * @param {Object} input
 * @param {Array<{path: string, added?: string}>} input.changedFiles - changed files with (optional) added-line text
 * @param {Array<{path: string, sql: string}>} [input.migrations] - migration files with SQL body
 * @returns {{is_creator: boolean, creator_kinds: string[], evidence: string[]}}
 */
export function detectCreator({ changedFiles = [], migrations = [] } = {}) {
  const kinds = new Set();
  const evidence = [];

  for (const mig of migrations) {
    const sql = String(mig?.sql || '');
    // CREATE TABLE (not CREATE TABLE ... only-if-temp, not CREATE INDEX/POLICY/VIEW)
    const m = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_.]+)/gi);
    if (m) {
      kinds.add(CREATOR_KINDS.TABLE);
      evidence.push(`migration ${mig.path}: ${m.length} CREATE TABLE statement(s)`);
    }
  }

  for (const f of changedFiles) {
    const path = String(f?.path || '');
    const added = String(f?.added || '');

    // WRITER: a module that inserts/updates a table.
    if (/\.(?:js|cjs|mjs|ts)$/.test(path) && /\.(?:insert|upsert|update)\s*\(/.test(added)) {
      kinds.add(CREATOR_KINDS.WRITER);
      evidence.push(`writer: ${path} contains an insert/upsert/update call`);
    }

    // FLAG: a new leo_feature_flags insert.
    if (/leo_feature_flags/.test(added) && /\.(?:insert|upsert)\s*\(/.test(added)) {
      kinds.add(CREATOR_KINDS.FLAG);
      evidence.push(`flag: ${path} inserts into leo_feature_flags`);
    }

    // DETECTOR: a new detector/heuristic module (naming heuristic — conservative).
    if (/(?:detector|heuristic)s?\/.*\.(?:js|cjs|mjs|ts)$/.test(path) || /\bdetect[A-Z]\w*\s*\(/.test(added)) {
      kinds.add(CREATOR_KINDS.DETECTOR);
      evidence.push(`detector: ${path} defines a detector/heuristic`);
    }
  }

  return {
    is_creator: kinds.size > 0,
    creator_kinds: [...kinds],
    evidence,
  };
}

/**
 * FR-2 — CONSUMER validator. A consumer READS the created output and acts on it.
 * We look for a read-path (select/read/get against the created table/flag) in a
 * non-test changed file. A test file alone does not count as a consumer.
 *
 * @param {Object} input
 * @param {Array<{path: string, added?: string}>} input.changedFiles
 * @param {string[]} [input.createdTables] - table names the SD creates (from migrations)
 * @returns {{consumer_present: boolean, evidence: string[]}}
 */
export function validateConsumer({ changedFiles = [], createdTables = [] } = {}) {
  const evidence = [];
  for (const f of changedFiles) {
    const path = String(f?.path || '');
    const added = String(f?.added || '');
    if (/(?:\.test\.|\.spec\.|__tests__\/|\/tests\/)/.test(path)) continue; // tests are not consumers
    const readsSomething = /\.(?:select|maybeSingle|single)\s*\(/.test(added) || /\bread[A-Z]\w*\s*\(/.test(added);
    if (!readsSomething) continue;
    if (createdTables.length === 0) {
      evidence.push(`consumer: ${path} contains a read-path acting on created output`);
    } else if (createdTables.some((t) => added.includes(t))) {
      evidence.push(`consumer: ${path} reads created table(s): ${createdTables.filter((t) => added.includes(t)).join(', ')}`);
    }
  }
  return { consumer_present: evidence.length > 0, evidence };
}

/**
 * FR-3 — ARMED CADENCE validator. The capability must be driven by a
 * periodic_process_registry row that is ENABLED with a non-null schedule. A bare
 * CLI (no registry row) or an off-by-default flag does NOT satisfy this.
 *
 * @param {Object} input
 * @param {Array<{process_key: string, enabled?: boolean, schedule?: string|null}>} input.registryRows
 * @param {string[]} input.capabilityKeys - candidate process_keys tied to the SD capability
 * @returns {{cadence_armed: boolean, process_key: string|null, evidence: string[]}}
 */
export function validateCadence({ registryRows = [], capabilityKeys = [] } = {}) {
  for (const key of capabilityKeys) {
    const row = registryRows.find((r) => r?.process_key === key);
    if (!row) continue;
    if (row.enabled === true && row.schedule != null && String(row.schedule).trim() !== '') {
      return {
        cadence_armed: true,
        process_key: key,
        evidence: [`armed cadence: periodic_process_registry '${key}' enabled with schedule '${row.schedule}'`],
      };
    }
  }
  return {
    cadence_armed: false,
    process_key: null,
    evidence: [
      capabilityKeys.length === 0
        ? 'no capability key supplied for cadence lookup'
        : `no armed registry row for: ${capabilityKeys.join(', ')} (bare CLI / off-by-default does not satisfy)`,
    ],
  };
}

/**
 * FR-4 — REAPER validator. The created data must have a retention/TTL/retire path:
 * an entry in lib/retention/policies.js RETENTION_POLICIES (or SOAK_ENTRIES) keyed
 * to the created table.
 *
 * @param {Object} input
 * @param {Array<{table: string}>} input.retentionPolicies - RETENTION_POLICIES (+ SOAK_ENTRIES)
 * @param {string[]} input.createdTables
 * @returns {{reaper_present: boolean, policy_key: string|null, evidence: string[]}}
 */
export function validateReaper({ retentionPolicies = [], createdTables = [] } = {}) {
  // No created tables → nothing to reap (table CREATOR check is table-scoped).
  if (createdTables.length === 0) {
    return { reaper_present: true, policy_key: null, evidence: ['no created table requires a reaper'] };
  }
  const covered = createdTables.filter((t) => retentionPolicies.some((p) => p?.table === t));
  const missing = createdTables.filter((t) => !covered.includes(t));
  if (missing.length === 0) {
    return {
      reaper_present: true,
      policy_key: covered.join(', '),
      evidence: [`reaper: retention policy covers ${covered.join(', ')}`],
    };
  }
  return {
    reaper_present: false,
    policy_key: null,
    evidence: [`reaper MISSING for created table(s): ${missing.join(', ')} (add to lib/retention/policies.js)`],
  };
}

/**
 * FR-6 — Waiver evaluator. A dated waiver with a FUTURE expiry lets a CREATOR SD
 * pass; an expired or malformed waiver does NOT. Shape:
 *   { owner: string, reason: string, expiry: ISO-8601, granted_at?: ISO-8601 }
 *
 * @param {Object|null|undefined} waiver
 * @param {Date} [now]
 * @returns {{valid: boolean, reason: string, audit: Object|null}}
 */
export function evaluateWaiver(waiver, now = new Date()) {
  if (waiver == null) return { valid: false, reason: 'no waiver', audit: null };
  if (typeof waiver !== 'object' || Array.isArray(waiver)) {
    return { valid: false, reason: 'waiver malformed (not an object)', audit: null };
  }
  const { owner, expiry } = waiver;
  if (!owner || typeof owner !== 'string') {
    return { valid: false, reason: 'waiver malformed (missing owner)', audit: null };
  }
  if (!expiry) {
    return { valid: false, reason: 'waiver malformed (missing expiry)', audit: null };
  }
  const expiryMs = Date.parse(expiry);
  if (Number.isNaN(expiryMs)) {
    return { valid: false, reason: `waiver malformed (unparseable expiry: ${expiry})`, audit: null };
  }
  if (expiryMs <= now.getTime()) {
    return { valid: false, reason: `waiver expired at ${expiry}`, audit: null };
  }
  return {
    valid: true,
    reason: `waiver valid until ${expiry}`,
    audit: { event: 'OPERATOR_CONTRACT_WAIVER_APPLIED', owner, expiry, reason: waiver.reason || null },
  };
}

/**
 * FR-5 — Composite operator-contract evaluation (the gate verdict).
 *
 * @param {Object} input
 * @param {ReturnType<typeof detectCreator>} input.creator
 * @param {{consumer_present: boolean, cadence_armed: boolean, reaper_present: boolean}} input.triple
 * @param {Object|null} [input.waiver] - raw SD metadata.operator_contract_waiver
 * @param {Date} [input.now]
 * @returns {{verdict: 'pass'|'fail', reason: string, missing: string[], waiver_audit: Object|null}}
 */
export function evaluateOperatorContract({ creator, triple, waiver = null, now = new Date() } = {}) {
  // Non-CREATOR SD → the gate is a no-op pass (FR-5 AC3, zero false-positives).
  if (!creator || !creator.is_creator) {
    return { verdict: 'pass', reason: 'OPERATOR_CONTRACT_NOT_APPLICABLE (non-CREATOR)', missing: [], waiver_audit: null };
  }

  const missing = [];
  if (!triple?.consumer_present) missing.push('consumer');
  if (!triple?.cadence_armed) missing.push('armed_cadence');
  if (!triple?.reaper_present) missing.push('reaper');

  if (missing.length === 0) {
    return { verdict: 'pass', reason: 'OPERATOR_CONTRACT_COMPLETE', missing: [], waiver_audit: null };
  }

  // Triple incomplete — a valid waiver rescues it (and must be audit-logged).
  const w = evaluateWaiver(waiver, now);
  if (w.valid) {
    return {
      verdict: 'pass',
      reason: `OPERATOR_CONTRACT_WAIVED (${w.reason}); missing: ${missing.join(', ')}`,
      missing,
      waiver_audit: w.audit,
    };
  }

  return {
    verdict: 'fail',
    reason: `OPERATOR_CONTRACT_INCOMPLETE — missing: ${missing.join(', ')} (${w.reason})`,
    missing,
    waiver_audit: null,
  };
}
