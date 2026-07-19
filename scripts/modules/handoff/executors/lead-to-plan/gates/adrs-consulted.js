/**
 * GATE_ADRS_CONSULTED — LEAD-TO-PLAN handoff gate (Child B of Pocock orchestrator)
 *
 * Scans refactor-type SDs for ADR-NNNN references in description / scope /
 * key_changes / strategic_objectives. Cross-checks against accepted
 * pocock_adrs titles (stop-keyword scan) to detect missing citations.
 *
 * Phase-1 (14-day rollout post-launch): WARN — emit feedback row but PASS gate.
 * Phase-2 (deferred to follow-up SD): hard-fail if matching ADR-NNNN absent
 *           from strategic_directives_v2.adrs_consulted.
 *
 * Mode controlled by env var LEO_ADRS_CONSULTED_HARD_FAIL (default false).
 *
 * Only applies to sd_type='refactor'. Grandfathers SDs created before
 * SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-B LEAD-FINAL-APPROVAL ship date.
 *
 * SD: SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-B (Child B)
 */

const GRANDFATHER_BEFORE_ISO = '2026-05-14T16:00:00.000Z'; // Set at Child B ship time
const HARD_FAIL_MODE = process.env.LEO_ADRS_CONSULTED_HARD_FAIL === 'true';
const STOP_KEYWORDS_DEFAULT = [
  'AUTO-PROCEED', 'canonical pause', 'database-first', 'handoff.js',
  'mode declaration', 'PreToolUse', 'PostToolUse', 'advisory verdict',
  'scope completion', 'lineage', 'sibling orchestrator',
  'adversarial sub-agent', 'progressive disclosure', 'skill body',
];

import { shouldSkipForType } from '../../../../../../lib/handoff/gate-skip-detection.js';
import { fetchAllPaginated } from '../../../../../../lib/db/fetch-all-paginated.mjs';

export function createAdrsConsultedGate(supabase) {
  return {
    name: 'GATE_ADRS_CONSULTED',
    description: 'Refactor SDs must cite contradicting ADRs in adrs_consulted (phase-1 warn, phase-2 hard-fail)',
    threshold: 70,
    async execute(sd) {
      // Scope: refactor SDs only
      // SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-4: use canonical helper.
      const skip = shouldSkipForType(sd, ['refactor'], { gateName: 'GATE_ADRS_CONSULTED' });
      if (skip.skip) {
        return {
          name: 'GATE_ADRS_CONSULTED',
          score: 100,
          passed: true,
          message: skip.reason,
          warnings: [],
          details: { sd_type: sd.sd_type, skipped: true, skip_reason: skip.reason },
        };
      }

      // Grandfather pre-launch SDs (created before Child B ship date)
      if (sd.created_at && new Date(sd.created_at) < new Date(GRANDFATHER_BEFORE_ISO)) {
        return {
          name: 'GATE_ADRS_CONSULTED',
          score: 100,
          passed: true,
          message: 'SD created before adrs_consulted feature launch — grandfathered',
          warnings: [],
          details: { created_at: sd.created_at, grandfathered: true },
        };
      }

      // Collect accepted ADR titles + numbers as stop-keyword corpus
      // Count/truncation discipline (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001
      // FR-6): full accepted-ADR corpus read — a capped read would silently shrink the
      // stop-keyword corpus. Error policy preserved: read failure degrades to an empty
      // corpus (fail-open), exactly as the prior ignored-error destructure did.
      let adrs = [];
      try {
        adrs = await fetchAllPaginated(() => supabase
          .from('pocock_adrs')
          .select('adr_number, title')
          .eq('status', 'accepted')
          .order('adr_number')); // unique-key tiebreaker for stable pagination
      } catch (adrErr) {
        console.log(`   ⚠️  GATE_ADRS_CONSULTED: ADR corpus read failed (${adrErr.message}) — proceeding with empty corpus`);
      }

      const adrCorpus = (adrs || []).map(a => ({
        number: a.adr_number,
        title: (a.title || '').toLowerCase(),
        canonical: `ADR-${String(a.adr_number).padStart(4, '0')}`,
      }));

      // Concatenate SD-author text fields
      const textBlob = [
        sd.description || '',
        sd.scope || '',
        JSON.stringify(sd.key_changes || ''),
        JSON.stringify(sd.strategic_objectives || ''),
      ].join(' ').toLowerCase();

      // Match: keyword presence in SD text
      const matched = [];
      for (const adr of adrCorpus) {
        const titleTokens = adr.title.split(/\s+/).filter(t => t.length >= 4);
        let hits = 0;
        for (const tok of titleTokens) {
          if (textBlob.includes(tok)) hits += 1;
        }
        // Also match against default stop-keywords (canonical decision phrases)
        for (const kw of STOP_KEYWORDS_DEFAULT) {
          if (textBlob.includes(kw.toLowerCase())) {
            // weak match — only register if at least 2 keyword hits OR title-token-hits >=2
            hits += 0.5;
          }
        }
        if (hits >= 2) matched.push({ adr_number: adr.number, canonical: adr.canonical, hits });
      }

      // Check whether SD's adrs_consulted cites the matched ADRs
      const consulted = new Set((sd.adrs_consulted || []).map(s => String(s).toUpperCase()));
      const missing = matched.filter(m => !consulted.has(m.canonical));

      if (missing.length === 0) {
        return {
          name: 'GATE_ADRS_CONSULTED',
          score: 100,
          passed: true,
          message: `${matched.length} ADR match(es) all cited in adrs_consulted`,
          warnings: [],
          details: { matched_count: matched.length, consulted: [...consulted] },
        };
      }

      // Emit feedback row (phase-1 warn behavior)
      try {
        await supabase.from('feedback').insert({
          title: `Refactor SD ${sd.sd_key || sd.id} missing ADR citations`,
          description: [
            'Refactor SD touches canonical decisions but does not cite them in adrs_consulted.',
            `Missing: ${missing.map(m => m.canonical).join(', ')}`,
            'Required action: review the listed ADRs and either (a) populate strategic_directives_v2.adrs_consulted with the relevant ADR-NNNN strings or (b) refine the SD scope so it does not contradict those decisions.',
          ].join('\n'),
          severity: 'medium',
          category: 'adrs_consulted_missing',
          component: 'leo-create-sd',
          status: 'new',
        });
      } catch (e) {
        // non-fatal — gate is still evaluated based on HARD_FAIL_MODE
      }

      if (HARD_FAIL_MODE) {
        return {
          name: 'GATE_ADRS_CONSULTED',
          score: 0,
          passed: false,
          message: `Phase-2: hard-fail — refactor SD must cite contradicting ADRs (${missing.map(m => m.canonical).join(', ')})`,
          warnings: [],
          details: { missing, matched, phase: 'hard_fail' },
        };
      }

      // Phase-1: PASS with warning
      return {
        name: 'GATE_ADRS_CONSULTED',
        score: 70,
        passed: true,
        message: `Phase-1 warn: refactor SD missing ADR citations (${missing.map(m => m.canonical).join(', ')})`,
        warnings: missing.map(m => `Cite ${m.canonical} in adrs_consulted`),
        details: { missing, matched, phase: 'warn_only' },
      };
    },
  };
}

export default createAdrsConsultedGate;
