/**
 * DEFERRED_FOLLOWUPS_HOME — LEAD-FINAL-APPROVAL completion-integrity gate
 * SD-LEO-INFRA-COMPLETION-GATE-DEFERRED-HOME-001
 *
 * Problem: an SD can be marked COMPLETE while declaring deferred follow-up work that has
 * no actual home — the deferred scope then evaporates (nobody sources the child).
 *
 * This gate runs at LEAD-FINAL-APPROVAL and enforces:
 *   FR-1 (contract): deferred scope is declared structurally in
 *     metadata.deferred_followups[] = { description, follow_up_sd_key }.
 *   FR-2 (block): for each declared follow-up, the referenced SD must EXIST
 *     (sd_key present, status != 'cancelled'). A declared deferral with no live home
 *     BLOCKS completion with a loud, actionable message.
 *   FR-3 (heuristic warn): if completion text (notes/description) contains a deferral
 *     phrase ("deferred to follow-up", "follow-up child", "out of scope, later SD", …)
 *     but metadata.deferred_followups has no matching entry, WARN the operator
 *     (non-blocking — avoids false positives on incidental prose).
 *
 * Rollout: blocking by default (FR-2). Set DEFERRED_HOME_GATE_DISABLED=true to make the
 * gate a no-op pass-through (ranking/completion byte-identical to pre-change behavior).
 *
 * Phase: LEAD-FINAL-APPROVAL
 */

const GATE_NAME = 'DEFERRED_FOLLOWUPS_HOME';

// FR-3 deferral phrases — lowercase substrings. Intentionally narrow to limit false positives.
const DEFERRAL_PHRASES = [
  'deferred to follow-up',
  'deferred to a follow-up',
  'follow-up child',
  'followup child',
  'out of scope, later sd',
  'out of scope; later sd',
  'deferred to a later sd',
  'deferred to follow up',
];

/** Parse a value that may be a JSONB array or a JSON string into an array. */
export function parseDeferredFollowups(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  return [];
}

/** Collect free-text fields where an unstructured deferral phrase might appear. */
export function gatherCompletionText(sd) {
  const m = sd?.metadata || {};
  return [
    sd?.description,
    sd?.scope,
    m.completion_notes,
    m.completion_summary,
    typeof m.completion_flags === 'string' ? m.completion_flags : JSON.stringify(m.completion_flags || ''),
  ].filter(t => typeof t === 'string' && t.length).join('\n').toLowerCase();
}

/**
 * Create the deferred-followups-home gate.
 * @param {object} supabase - Supabase client (queries strategic_directives_v2 for follow-up existence)
 * @returns {Object} Gate definition
 */
export function createDeferredFollowupsGate(supabase) {
  return {
    name: GATE_NAME,
    required: true,
    validator: async (ctx) => {
      console.log('\n🔗 GATE: Deferred-Followups Home (completion integrity)');
      console.log('-'.repeat(50));

      // Rollout escape hatch: disabled => byte-identical pass-through.
      if (process.env.DEFERRED_HOME_GATE_DISABLED === 'true') {
        console.log('   DEFERRED_HOME_GATE_DISABLED=true — gate skipped (pass-through)');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['Deferred-home gate disabled via env'] };
      }

      const sd = ctx?.sd;
      const sdId = sd?.id || ctx?.sdId;
      if (!sd || !sdId) {
        return { passed: true, score: 80, max_score: 100, issues: [], warnings: ['No sd in context — gate skipped'] };
      }

      const deferred = parseDeferredFollowups(sd?.metadata?.deferred_followups);
      const warnings = [];

      // FR-3 heuristic: deferral phrase present but no structured declaration.
      if (deferred.length === 0) {
        const text = gatherCompletionText(sd);
        const hit = DEFERRAL_PHRASES.find(p => text.includes(p));
        if (hit) {
          warnings.push(
            `Completion text mentions deferred work ("${hit}") but metadata.deferred_followups is empty — ` +
            `declare it as {description, follow_up_sd_key} (and create the home SD) or fold the work in before completing.`
          );
          console.log(`   ⚠️  Unstructured deferral phrase detected ("${hit}") — heuristic warn (non-blocking).`);
        } else {
          console.log('   No deferred followups declared and no deferral phrases — gate passes.');
        }
        return { passed: true, score: warnings.length ? 85 : 100, max_score: 100, issues: [], warnings };
      }

      // FR-2: each declared follow-up SD must exist and not be cancelled.
      const issues = [];
      const missing = [];
      for (const f of deferred) {
        const key = f && (f.follow_up_sd_key || f.sd_key);
        if (!key || typeof key !== 'string') {
          issues.push(`A deferred_followups entry is missing follow_up_sd_key (description: ${(f && f.description) || '?'}) — declare the home SD key.`);
          continue;
        }
        const { data: row, error } = await supabase
          .from('strategic_directives_v2')
          .select('sd_key, status')
          .eq('sd_key', key)
          .maybeSingle();
        if (error || !row) {
          issues.push(`Deferred follow-up SD '${key}' does NOT exist — create it (or fold the work in) before completing.`);
          missing.push(key);
        } else if (String(row.status).toLowerCase() === 'cancelled') {
          issues.push(`Deferred follow-up SD '${key}' is CANCELLED — its deferred work has no live home; re-source it or fold it in before completing.`);
          missing.push(key);
        } else {
          console.log(`   ✓ Follow-up '${key}' exists (status: ${row.status}).`);
        }
      }

      if (issues.length) {
        console.log(`   ❌ ${issues.length} unresolved deferred follow-up(s) — BLOCKING completion.`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues,
          warnings,
          remediation:
            'Deferred work was declared with no live home SD. Create the follow-up SD(s) — ' +
            `${missing.join(', ') || '(see issues)'} — or fold the work into this SD, then re-run completion.`,
        };
      }

      console.log(`   ✅ All ${deferred.length} deferred follow-up(s) have a live home SD.`);
      return { passed: true, score: 100, max_score: 100, issues: [], warnings };
    },
  };
}

export default createDeferredFollowupsGate;
