/**
 * Codified Invariant Library — known gap-classes checked deterministically on every
 * consequential plan artifact, alongside (not instead of) the LLM adversarial critique.
 *
 * SD: SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-2)
 *
 * ANTI-GOODHART CONTRACT (load-bearing): an entry may be added ONLY from a REAL caught gap
 * and MUST carry a citation naming where that gap was caught (SD key / retro id / incident)
 * plus the measured consequence. Speculative "wouldn't it be nice" rules are REJECTED — the
 * loader below throws at import time on any entry without a non-empty citation.source and
 * citation.measured. A library of imagined failure modes optimizes for rule count, not
 * catch rate; a library of caught gaps grows exactly as fast as reality teaches us.
 *
 * LEARNING LOOP (FR-4): when a gap escapes this library and the LLM pass and is later
 * caught (retro, incident, chairman review), codify it here with its citation. That is the
 * only admission path.
 *
 * COVERAGE, NEVER COMPLETENESS (FR-3): runInvariantChecks reports which invariant classes
 * it checked. A clean result means "no known-class gap among {checked}", never "complete".
 *
 * Checks are deterministic (regex/structural, no network, no LLM) so this half of the
 * critic can NEVER be could_not_check — it is the part that still runs when the LLM half
 * cannot.
 */

/**
 * @typedef {Object} Invariant
 * @property {string} id - Stable id (INV-###-slug)
 * @property {string} title
 * @property {'block'|'warn'|'note'} severity - Heuristic text checks cap at 'warn':
 *   only a check that PROVES untestability may block, and regexes prove nothing.
 * @property {{source: string, measured: string}} citation - The real caught gap this
 *   entry was codified from. REQUIRED — the loader rejects entries without it.
 * @property {(input: {text: string, prd: Object|null}) => {hit: boolean, message: string}} check
 */

/** @type {Invariant[]} */
export const INVARIANTS = [
  {
    id: 'INV-001-control-without-could-not-check-path',
    title: 'A plan that adds a control must specify its could-not-run behavior',
    severity: 'warn',
    citation: {
      source: 'SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 FR-3',
      measured:
        'critiquePlanProposal had FIVE could-not-run paths (missing OPENAI_API_KEY, adapter ' +
        'init failure, LLM timeout, LLM call failure, malformed JSON) that each returned ' +
        "overall_severity 'pass' — a control asserting checked-clean for runs that never ran.",
    },
    check({ text }) {
      const CONTROL = /\b(gate|guard|monitor|validator|lint(?:er)?|watchdog|sweep(?:er)?|checker)\b/i;
      const CNC = /\b(could[\s_-]?not[\s_-]?(?:check|run|search)|fail[\s_-]?(?:open|closed)|unavailable|cannot\s+run|not\s+configured|COULD_NOT_CHECK)\b/i;
      const hit = CONTROL.test(text) && !CNC.test(text);
      return {
        hit,
        message:
          'Plan introduces or modifies a control (gate/guard/monitor/validator) but never ' +
          'specifies what it reports when it CANNOT run. Every fail-open path that returns ' +
          '"pass" is a control asserting a claim it never earned. State the could-not-check ' +
          'behavior explicitly.',
      };
    },
  },
  {
    id: 'INV-002-repair-gated-on-code-present-not-data-present',
    title: 'A seeder/backfill/indexer plan must gate completion on data landed, not code merged',
    severity: 'warn',
    citation: {
      source: 'SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 FR-5',
      measured:
        'scripts/semantic-indexer.js was unrunnable for 289 days (ESM/CJS mix) while every ' +
        'instrument said the feature existed; 0 of 300 VALIDATION duplicate searches ever hit. ' +
        'Then the first repaired run died partway and left a PARTIAL seed (src=100, ' +
        'scripts=1749, lib/tests/database=0 rows) that a code-present completion check ' +
        'would have called done.',
    },
    check({ text }) {
      const SEEDER = /\b(seed(?:er|ing)?|backfill|indexer|populate|ingest(?:ion)?|migrat(?:e|ion)\s+data)\b/i;
      const DATA_VERIFY = /\b(row\s*count|rows?\s+(?:land(?:ed)?|inserted|written)|count\s+before|before\/after|0\s*->\s*N|by\s+real\s+count|data\s+(?:present|landed|verified))\b/i;
      const hit = SEEDER.test(text) && !DATA_VERIFY.test(text);
      return {
        hit,
        message:
          'Plan ships a seeder/backfill/indexer but no acceptance criterion measures the DATA ' +
          'it produces (row counts before/after, rows landed at the consumer). Repair without ' +
          'data verification completes on code-present while the table stays empty or partial.',
      };
    },
  },
  {
    id: 'INV-003-migration-authored-is-not-applied',
    title: 'A plan referencing a DB migration must include an applied-verification step',
    severity: 'warn',
    citation: {
      source: 'SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 FR-5 layer 3',
      measured:
        'database/migrations/20260809_semantic_index_entity_type_sql_entities.sql was authored ' +
        '2026-08-09; live catalog read over the pooler on 2026-08-10 showed the constraint still ' +
        'at the original 7-value vocabulary — the migration file existed, the database object ' +
        'did not. A migration file is a lead, never proof of a live database object.',
    },
    check({ text }) {
      const MIGRATION = /\b(migration|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+CONSTRAINT|ADD\s+CONSTRAINT|DDL)\b/i;
      const APPLY_VERIFY = /\b(appl(?:y|ied|ies)\b.{0,40}\b(?:verify|verif(?:y|ied|ication)|confirm)|verify\s+(?:live|applied|the\s+constraint)|pg_get_constraintdef|catalog\s+(?:read|check)|information_schema|chairman[\s_-]?gated)\b/is;
      const hit = MIGRATION.test(text) && !APPLY_VERIFY.test(text);
      return {
        hit,
        message:
          'Plan references DDL/migration work but no step verifies the object is LIVE after ' +
          'apply (catalog read, constraint definition check). A migration file on disk is a ' +
          'lead, never proof — unapplied DDL is invisible to every instrument that trusts it.',
      };
    },
  },
];

const VALID_INVARIANT_SEVERITIES = new Set(['block', 'warn', 'note']);

/**
 * Anti-Goodhart loader guard: reject speculative entries at import time.
 * An invariant without a citation naming a real caught gap (source + measured
 * consequence) is speculation wearing a rule's clothes.
 */
export function assertInvariantLibraryIntegrity(invariants = INVARIANTS) {
  for (const inv of invariants) {
    if (!inv.id || !/^INV-\d{3}-[a-z0-9-]+$/.test(inv.id)) {
      throw new Error(`Invariant library integrity: invalid id ${JSON.stringify(inv.id)}`);
    }
    if (!VALID_INVARIANT_SEVERITIES.has(inv.severity)) {
      throw new Error(`Invariant library integrity: ${inv.id} has invalid severity ${JSON.stringify(inv.severity)}`);
    }
    if (!inv.citation || typeof inv.citation.source !== 'string' || inv.citation.source.trim().length < 8) {
      throw new Error(
        `Invariant library integrity: ${inv.id} lacks a citation.source. ` +
        'Entries are admitted ONLY from real caught gaps (anti-Goodhart) — cite the SD/retro/incident.'
      );
    }
    if (typeof inv.citation.measured !== 'string' || inv.citation.measured.trim().length < 20) {
      throw new Error(
        `Invariant library integrity: ${inv.id} lacks citation.measured. ` +
        'State the measured consequence of the caught gap, not a hypothesis.'
      );
    }
    if (typeof inv.check !== 'function') {
      throw new Error(`Invariant library integrity: ${inv.id} has no check() function`);
    }
  }
  return true;
}

// Throw at import time — a malformed library must never load silently.
assertInvariantLibraryIntegrity();

/**
 * Run every invariant against the plan text. Deterministic, no network.
 *
 * @param {Object} input
 * @param {string} input.prdContent - PRD content (JSON string or markdown)
 * @param {string} [input.archContent] - Architecture plan content
 * @param {Object|null} [input.prd] - Parsed PRD row when available
 * @returns {{findings: Array, checked_classes: string[]}} findings in the same shape the
 *   LLM critique emits (severity/category/message/location/suggested_fix) so the gate can
 *   merge both sources; checked_classes is the COVERAGE report — what was looked for.
 */
export function runInvariantChecks({ prdContent = '', archContent = '', prd = null } = {}) {
  const text = `${prdContent}\n${archContent}`;
  const findings = [];
  const checked = [];

  for (const inv of INVARIANTS) {
    checked.push(inv.id);
    const { hit, message } = inv.check({ text, prd });
    if (hit) {
      findings.push({
        severity: inv.severity,
        category: 'invariant',
        invariant_id: inv.id,
        message: `[${inv.id}] ${message}`,
        location: 'invariant-library',
        suggested_fix: `Address the known gap-class ${inv.id} (caught in: ${inv.citation.source})`,
        citation: inv.citation.source,
      });
    }
  }

  return { findings, checked_classes: checked };
}
