#!/usr/bin/env node
/**
 * Auto-Validate User Stories on EXEC Completion
 *
 * **ROOT CAUSE FIX**: SD-TEST-MOCK-001 revealed that user stories were never
 * validated after EXEC completion, blocking PLAN_verification at 0% progress
 * despite all deliverables being complete.
 *
 * **PREVENTION**: This script performs TWO promotions at EXEC-TO-PLAN, in order:
 * 1. status='ready' → status='completed' when all sd_scope_deliverables are completed
 * 2. validation_status='pending' → 'validated' for stories that are status='completed'
 *
 * Both transitions are universally required at EXEC-TO-PLAN. Sampled feature SDs at
 * handoff (POST-LAUNCH-001, VISUAL-ASSETS-001, ARTIFACT-INTEGRATION-001, VISION-V2-006,
 * E2E-VENTURE-LIFECYCLE-003) all show stories ending in status=completed+validated.
 * See CLAUDE_EXEC.md "User stories at EXEC-TO-PLAN" for the protocol description.
 *
 * **Integration Point**: Called by EXEC-TO-PLAN gate pipeline (SD-LEO-FIX-STORIES-SUB-AGENT-001)
 *
 * **Usage**: node scripts/auto-validate-user-stories-on-exec-complete.js <SD-ID>
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';
dotenv.config();

// ── SD-LEO-INFRA-VALIDATE-DESIGN-ONLY-STORIES-001 ──────────────────────────────────────────────
// Design-only SDs (docs/spec deliverables, no UI/code) should have their user stories validated
// AGAINST the spec deliverable, not content-blind rubber-stamped. Detection is NARROW and FAIL-OPEN:
// any uncertainty resolves to designOnly=false (the existing universal behavior is unchanged).
const CODE_PATH = /\.(c|m)?[jt]sx?$|\.(sql|py|go|rb|java|css|scss|html|vue|svelte)$|^(src|lib|scripts|app|components|api|server|client)\//i;
const DOC_PATH = /\.(md|mdx|txt|rst|adoc)$|^docs\//i;
// Deliberately SPECIFIC markers only — a loose "no build"/"no code" alternative would false-positive
// on code SDs ("no build changes needed"), mis-routing them to the design-only path. Fail-safe toward
// the default (code) path: if in doubt, NOT design-only.
const DESIGN_MARKER = /design[- ]only|reviewable (design[- ])?spec|phase-?0 design (pass|spec)|\bno-build\b/i;

/**
 * Classify an SD as design-only. Priority: explicit metadata flag → deliverable-path shape →
 * SD-text marker. Fail-open (returns designOnly:false) on any uncertainty.
 * @param {Object|null} sd - { metadata, title, description, scope }
 * @param {Array|null} deliverables - [{ deliverable_name }]
 * @returns {{ designOnly: boolean, reason: string }}
 */
export function classifyDesignOnly(sd, deliverables) {
  if (sd?.metadata?.design_only === true) return { designOnly: true, reason: 'metadata.design_only flag' };
  const names = (deliverables || []).map(d => (d?.deliverable_name || '').trim()).filter(Boolean);
  const pathLike = names.filter(n => /\.[a-z0-9]+$/i.test(n) || n.includes('/'));
  if (pathLike.length > 0) {
    if (pathLike.some(n => CODE_PATH.test(n))) return { designOnly: false, reason: 'has code/UI deliverable paths' };
    if (pathLike.every(n => DOC_PATH.test(n))) return { designOnly: true, reason: 'all deliverable paths are docs/spec' };
  }
  // Text-marker fallback: the cockpit Phase-0 spec SDs declare "DESIGN-ONLY — NO build" in their scope.
  const blob = [sd?.title, sd?.description, sd?.scope].filter(Boolean).join(' ');
  if (blob && DESIGN_MARKER.test(blob)) return { designOnly: true, reason: 'design-only marker in SD text' };
  return { designOnly: false, reason: 'no design-only signal (fail-open)' };
}

const BOILERPLATE_AC = /\bis built( successfully)?\b|\bworks as expected\b|\bimplemented successfully\b|\buied successfully\b|\bdone successfully\b/i;

/**
 * Normalize an acceptance-criterion to text. The corpus stores ACs BOTH as plain strings AND as
 * objects ({ given, when, then, scenario, criterion, ... }) — ~50/50 live — so a string-only filter
 * would silently drop every object-shaped AC and false-fail well-formed design stories.
 */
function acToText(x) {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    return [x.given, x.when, x.then, x.scenario, x.criterion, x.text, x.description, x.title]
      .filter(v => typeof v === 'string' && v.trim()).join(' ');
  }
  return '';
}

/**
 * Minimal quality bar for a design-only SD's story: ≥2 substantive, non-boilerplate acceptance
 * criteria. (The SD-level classifyDesignOnly already established this is a spec deliverable, so a
 * per-story "must name the spec" keyword check was dropped — it false-failed good design ACs that
 * describe the artifact's content without the literal word "spec".) Returns { ok, reason }.
 */
export function storyMeetsDesignBar(story) {
  const ac = Array.isArray(story?.acceptance_criteria) ? story.acceptance_criteria : [];
  const substantive = ac.map(acToText).filter(s => s.trim().length >= 15);
  if (substantive.length < 2) return { ok: false, reason: 'fewer than 2 substantive acceptance criteria' };
  const title = (story?.title || '').toLowerCase().trim();
  const allBoilerplate = substantive.every(s => BOILERPLATE_AC.test(s) || s.toLowerCase().trim() === title);
  if (allBoilerplate) return { ok: false, reason: 'acceptance criteria are boilerplate / title-echo' };
  return { ok: true };
}

/**
 * Tailored design-only validation: promote/validate ONLY stories that meet the bar; surface the rest.
 * @returns {Promise<Object>} { validated, designOnly:true, count, passing, failing, warnings, message }
 */
async function validateDesignOnlyStories(supabase, resolvedSdId, stories) {
  const evaluated = stories.map(s => ({ s, bar: storyMeetsDesignBar(s) }));
  const passing = evaluated.filter(e => e.bar.ok).map(e => e.s);
  const failing = evaluated.filter(e => !e.bar.ok);
  const warnings = failing.map(e => `Story "${e.s.title}" below the design-only quality bar: ${e.bar.reason}`);

  // Promote status -> 'completed' for ALL design stories (the spec deliverable landed), so the SEPARATE
  // required USER_STORY_COVERAGE gate (counts status='completed') is NOT hard-blocked — honoring the
  // "advisory, don't hard-block the wave" intent. Withhold only validation_status for thin stories.
  const toPromote = stories.filter(s => s.status === 'ready' || s.status === 'draft').map(s => s.id);
  if (toPromote.length > 0) {
    const { error } = await supabase.from('user_stories').update({ status: 'completed' }).in('id', toPromote);
    if (error) return { validated: false, designOnly: true, error: error.message, warnings };
    stories.forEach(s => { if (toPromote.includes(s.id)) s.status = 'completed'; });
  }
  // Validate ONLY stories meeting the bar; thin/boilerplate stories stay validation_status='pending'
  // and are surfaced as advisory warnings (the un-masking) rather than rubber-stamped.
  const toValidate = passing.filter(s => s.status === 'completed' && s.validation_status === 'pending').map(s => s.id);
  if (toValidate.length > 0) {
    const { error } = await supabase.from('user_stories').update({ validation_status: 'validated' }).in('id', toValidate);
    if (error) return { validated: false, designOnly: true, error: error.message, warnings };
  }
  const validated = failing.length === 0;
  console.log(validated
    ? `✅ design-only: all ${passing.length} stories met the bar and were validated`
    : `⚠️  design-only: ${passing.length} validated, ${failing.length} below the quality bar (surfaced, advisory)`);
  return {
    validated, designOnly: true, count: toValidate.length, passing: passing.length, failing: failing.length, warnings,
    message: validated
      ? `Design-only: validated ${passing.length} stories against the spec`
      : `Design-only: ${failing.length} story(ies) below the quality bar (not validated)`,
  };
}

/**
 * Auto-validate user stories for a given SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} [sbClient] - Optional Supabase client (creates one if not provided)
 * @returns {Promise<Object>} Validation result
 */
async function autoValidateUserStories(sdId, sbClient) {
  const supabase = sbClient || createSupabaseServiceClient();

  console.log(`🔍 Checking user stories for ${sdId}...`);

  // SD-FDBK-INFRA-COMPLETION-FLAG-HARNESS-001: the EXEC-TO-PLAN gate passes ctx.sd.id (the UUID),
  // but the CLI path (process.argv[2]) may pass an sd_key. user_stories.sd_id stores the UUID, so
  // resolve an sd_key form to the UUID first — otherwise the queries below match nothing and no
  // stories are ever auto-validated.
  const isUuid = typeof sdId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
  // SD-LEO-INFRA-VALIDATE-DESIGN-ONLY-STORIES-001: also capture the SD row (metadata/text) here so
  // design-only classification needs no extra query. One strategic_directives_v2 read per path.
  let resolvedSdId = sdId;
  let sdRow = null;
  if (sdId && !isUuid) {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('id, metadata, title, description, scope')
      .eq('sd_key', sdId)
      .maybeSingle();
    if (data?.id) {
      resolvedSdId = data.id;
      sdRow = data;
      console.log(`   ↳ resolved sd_key ${sdId} → ${resolvedSdId}`);
    }
  } else if (isUuid) {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('metadata, title, description, scope')
      .eq('id', sdId)
      .maybeSingle();
    sdRow = data || null;
  }

  // 1. Get all user stories for this SD (acceptance_criteria + implementation_context drive the
  // design-only quality bar — SD-LEO-INFRA-VALIDATE-DESIGN-ONLY-STORIES-001).
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .select('id, title, status, validation_status, acceptance_criteria, implementation_context')
    .eq('sd_id', resolvedSdId);

  if (storiesError) {
    console.error('❌ Error fetching user stories:', storiesError.message);
    return { validated: false, error: storiesError.message };
  }

  // 2. Deliverables (used for the completion gate AND for design-only path classification).
  const { data: deliverables, error: delError } = await supabase
    .from('sd_scope_deliverables')
    .select('deliverable_name, completion_status')
    .eq('sd_id', resolvedSdId);

  if (delError) {
    console.error('❌ Error fetching deliverables:', delError.message);
    return { validated: false, error: delError.message };
  }

  const { designOnly, reason: designReason } = classifyDesignOnly(sdRow, deliverables);
  if (designOnly) console.log(`   🎨 design-only SD (${designReason}) — validating stories against the spec deliverable`);

  // FR-3: a design-only SD that produced a spec deliverable but ZERO stories is SURFACED (advisory
  // warning), not silently auto-passed. Non-design-only infra/docs SDs keep the {validated:true} contract.
  if (!stories || stories.length === 0) {
    if (designOnly) {
      console.log('⚠️  design-only SD has a spec deliverable but ZERO user stories — surfacing (not auto-passing)');
      return { validated: false, count: 0, designOnly: true,
        warnings: ['design-only SD produced a spec deliverable but has ZERO user stories to validate against it'],
        message: 'Design-only SD has no stories to validate' };
    }
    console.log('✅ No user stories to validate (acceptable for infra/docs SDs)');
    return { validated: true, count: 0, message: 'No user stories' };
  }

  // SD-REFILL-0093WRCJ: design-only SDs are validated against the SPEC quality bar
  // (validateDesignOnlyStories: >=2 substantive ACs), NOT deliverable completion_status. Doc/spec
  // deliverables have no code-artifact completer to flip them to 'completed', so gating the
  // design-only branch behind allDeliverablesComplete left these SDs stuck at the
  // 'Deliverables not all complete' skip below — the residual of #4838, which placed the design-only
  // branch AFTER that skip. Route design-only SDs to their spec-quality validation FIRST so they no
  // longer require a manual user_stories status/validation_status edit to pass USER_STORY_COVERAGE.
  // FR-2: only stories meeting the bar are promoted/validated; thin/boilerplate stories are surfaced.
  if (designOnly) {
    return await validateDesignOnlyStories(supabase, resolvedSdId, stories);
  }

  const allDeliverablesComplete = deliverables && deliverables.length > 0 &&
    deliverables.every(d => d.completion_status === 'completed');

  if (!allDeliverablesComplete) {
    console.log('⏸️  Deliverables not all complete, skipping auto-validation');
    return { validated: false, message: 'Deliverables incomplete' };
  }

  // ── default path (code-bearing SDs): the existing universal promotion + validation ──
  // 2b. Promote status IN ('ready','draft') -> 'completed' (deliverables prove the work landed).
  // SD-FDBK-INFRA-COMPLETION-FLAG-HARNESS-001: PLAN / add-prd-to-database create user stories as
  // status='draft'. Promoting only 'ready' left those draft stories untouched, so they failed
  // USER_STORY_COVERAGE at EXEC-TO-PLAN and had to be hand-completed every SD. Include 'draft'.
  const promotableStories = stories.filter(s => s.status === 'ready' || s.status === 'draft');
  if (promotableStories.length > 0) {
    console.log(`📈 Promoting ${promotableStories.length} ready/draft stories to completed (deliverables done)...`);
    const { error: promoteError } = await supabase
      .from('user_stories')
      .update({ status: 'completed' })
      .eq('sd_id', resolvedSdId)
      .in('status', ['ready', 'draft']);
    if (promoteError) {
      console.error('❌ Error promoting ready/draft->completed:', promoteError.message);
      return { validated: false, error: promoteError.message };
    }
    promotableStories.forEach(s => { s.status = 'completed'; });
  }

  // 3. Auto-validate completed user stories (must be both completed AND pending validation)
  const completedPendingStories = stories.filter(
    s => s.validation_status === 'pending' && s.status === 'completed'
  );

  if (completedPendingStories.length === 0) {
    const allValidated = stories.every(s => s.validation_status === 'validated');
    if (allValidated) {
      console.log('✅ All user stories already validated');
      return { validated: true, count: stories.length, message: 'Already validated' };
    } else {
      console.log('⏸️  User stories exist but not completed yet, skipping auto-validation');
      return { validated: false, message: 'Stories not completed' };
    }
  }

  console.log(`📝 Auto-validating ${completedPendingStories.length} completed user stories...`);

  const { data: updated, error: updateError } = await supabase
    .from('user_stories')
    .update({ validation_status: 'validated' })
    .eq('sd_id', resolvedSdId)
    .eq('status', 'completed')
    .eq('validation_status', 'pending')
    .select('id, title, status');

  if (updateError) {
    console.error('❌ Error updating user stories:', updateError.message);
    return { validated: false, error: updateError.message };
  }

  console.log('✅ Auto-validated user stories:');
  updated.forEach(s => console.log(`   ✓ ${s.title}`));

  return {
    validated: true,
    count: updated.length,
    message: `Auto-validated ${updated.length} user stories`
  };
}

// Run if called directly
const sdIdArg = process.argv[2];
const argv1 = process.argv[1] || '';
if (import.meta.url === `file://${argv1}` || import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`) {
  if (!sdIdArg) {
    console.error('❌ Usage: node auto-validate-user-stories-on-exec-complete.js <SD-ID>');
    process.exit(1);
  }
  autoValidateUserStories(sdIdArg)
    .then(result => {
      console.log('\n📊 Result:', JSON.stringify(result, null, 2));
      process.exit(result.validated ? 0 : 1);
    })
    .catch(err => {
      console.error('❌ Fatal error:', err.message);
      process.exit(1);
    });
}

export { autoValidateUserStories };
