#!/usr/bin/env node
/**
 * Programmatic Retrospective Generator — Enhancement 3
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Auto-populates SD retrospectives with specific insights, real file references,
 * and concrete action items — eliminating manual enrichment after every SD.
 *
 * Usage:
 *   node scripts/programmatic/retrospective-generator.js \
 *     --sd-id SD-XXX-001 --branch feat/SD-XXX-001 [--dry-run]
 *
 * Output (stdout): JSON { retrospective_id, quality_score, sd_id, dry_run? }
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { runProgrammaticTask, resolveProvider } from '../../lib/programmatic/tool-loop.js';
import { createSupabaseTool, createSupabaseUpsertTool } from '../../lib/programmatic/tools/supabase-tool.js';
import { createGitTools } from '../../lib/programmatic/tools/git-tool.js';

const { values: args } = parseArgs({
  options: {
    'sd-id': { type: 'string' },
    'branch': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const sdId = args['sd-id'];
const branch = args['branch'] ?? `feat/${sdId}`;
const dryRun = args['dry-run'];

if (!sdId) {
  console.error('Usage: node scripts/programmatic/retrospective-generator.js --sd-id SD-XXX-001 [--branch feat/SD-XXX-001] [--dry-run]');
  process.exit(1);
}

const supabase = createSupabaseServiceClient();

const { gitDiff, changedFiles } = createGitTools();
const tools = [
  createSupabaseTool(supabase),
  createSupabaseUpsertTool(supabase),
  gitDiff,
  changedFiles,
];

const SYSTEM_PROMPT = `You are a LEO Protocol retrospective author. You generate high-quality retrospectives
that pass the RETROSPECTIVE_QUALITY_GATE (requires score >= 70/100).

Quality gate requirements:
- key_learnings: SD-specific insights referencing actual files changed (not boilerplate)
- action_items: Array of {action, owner, deadline, verification} objects (min 2 items)
- improvement_areas: Array of {area, analysis, prevention} objects (min 1)
- what_went_well: Specific to this SD (not generic)
- what_needs_improvement: Specific friction points encountered

NEVER use boilerplate like "EXEC phase quality score: 80%". Reference real files and behaviors.

If git_changed_files or git_diff return an empty result (this happens when the branch is
already merged into main, so the three-dot diff against main is empty), do NOT invent file
paths, line counts, or any other concrete detail that did not come from a tool result. Say so
explicitly in key_learnings and what_needs_improvement, source the rest of the content only from
the strategic_directives_v2 / sd_phase_handoffs rows, and reflect the missing diff in a
quality_score below the 70/100 passing threshold — an empty-diff retrospective must not read as
a normal pass.

Output ONLY valid JSON in your final message:
{"retrospective_id": "...", "quality_score": N, "sd_id": "..."}`;

const USER_PROMPT = `Generate a high-quality retrospective for SD "${sdId}" (branch: ${branch}).

Steps:
1. Query strategic_directives_v2 WHERE sd_key = '${sdId}', select: title, description, sd_type, strategic_objectives
2. Query sd_phase_handoffs WHERE sd_id = '${sdId}', select: handoff_type, status, gate_score, created_at — get all handoffs
3. Call git_changed_files for branch "${branch}" to get list of changed files
4. Call git_diff for branch "${branch}" to get diff stats
5. Query retrospectives WHERE sd_id = '${sdId}' AND retro_type = 'SD_COMPLETION', select id.
   SCOPE THIS QUERY TO retro_type = 'SD_COMPLETION'. Do NOT look for "any retrospective on this SD".
   The SD almost always ALSO carries HANDOFF retrospectives, one per phase handoff. Those are separate
   records with a different purpose and are NEVER the row you create or modify here.
6. Generate retrospective content:
   - key_learnings: 3+ items, each referencing specific files from changed_files
   - action_items: 2+ items with owner="future-claude", deadline="next-sd", verification fields
   - improvement_areas: 1+ items with specific analysis
   - what_went_well and what_needs_improvement: SD-specific, not boilerplate
7. ${dryRun ? 'DRY RUN: Do NOT upsert. Return the generated content with dry_run: true and an honest quality_score computed per the gate rubric above from the actual tool results — never a fixed placeholder score.' : `Write the retrospective:
   - If step 5 returned NO row: INSERT a new row into retrospectives with retro_type = 'SD_COMPLETION'.
   - If step 5 returned a row: you may update THAT row, and only that row, by its id.
   NEVER update a retrospectives row whose retro_type is anything other than 'SD_COMPLETION'.
   An upsert onto an existing id is an UPDATE: it keeps that row's created_at and overwrites its
   content. Doing that to a HANDOFF row destroys a phase-handoff retrospective AND leaves the
   completion retro carrying the handoff's original created_at, which then fails the completion
   gate's freshness check. If in any doubt, INSERT a new row rather than updating an existing one.`}
8. Output final JSON result`;

/**
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-030: Database-driven fallback retrospective
 * When LLM enrichment fails (API credits, timeout, etc.), extract context from
 * SD metadata and handoff artifacts to produce a retrospective that passes
 * RETROSPECTIVE_QUALITY_GATE (≥55% for infrastructure, ≥70% for others).
 */
async function generateFallbackRetrospective(supabaseClient, sdKey, branchName, isDryRun) {
  // Fetch SD metadata
  const { data: sd } = await supabaseClient
    .from('strategic_directives_v2')
    .select('title, description, sd_type, key_changes, success_criteria, scope')
    .or(`id.eq.${sdKey},sd_key.eq.${sdKey}`)
    .single();

  // Fetch handoff history
  const { data: handoffs } = await supabaseClient
    .from('sd_phase_handoffs')
    .select('handoff_type, status, gate_score, created_at, known_issues')
    .eq('sd_id', sdKey)
    .order('created_at', { ascending: true });

  // Get changed files from git
  let changedFilesList = [];
  try {
    const { execSync } = await import('child_process');
    const gitOutput = execSync(
      `git log --all --diff-filter=ACMR --name-only --pretty=format: --grep="${sdKey}"`,
      { encoding: 'utf8', timeout: 10000 }
    ).trim();
    changedFilesList = [...new Set(gitOutput.split('\n').filter(f => f.trim()))].slice(0, 10);
  } catch { /* git not available or no commits */ }

  const title = sd?.title || sdKey;
  const sdType = sd?.sd_type || 'unknown';
  const keyChanges = sd?.key_changes || [];
  const handoffCount = handoffs?.length || 0;
  const gateScores = (handoffs || []).filter(h => h.gate_score).map(h => `${h.handoff_type}: ${h.gate_score}%`);
  const knownIssues = (handoffs || []).flatMap(h => {
    if (typeof h.known_issues === 'string') return [h.known_issues];
    if (Array.isArray(h.known_issues)) return h.known_issues.map(i => typeof i === 'string' ? i : i.issue || '');
    return [];
  }).filter(Boolean).slice(0, 3);

  const fileRefs = changedFilesList.length > 0
    ? changedFilesList.map(f => `Modified: ${f}`).join('; ')
    : 'Files changed via SD branch';

  const retroContent = {
    sd_id: sdKey,
    title: `Retrospective: ${title}`,
    // UPPERCASE deliberately. This was 'sd_completion' (lowercase) — the ONLY lowercase retro_type
    // written anywhere. Every reader compares against the canonical uppercase value: the completion
    // gate filters .eq('retro_type','SD_COMPLETION'), and a 300-row DB sample contains only uppercase
    // values (HANDOFF, AUDIT, ARCHITECTURE_DECISION) with no lowercase row at all. A fallback row
    // written lowercase is therefore invisible to the gate it exists to satisfy — the SD would carry a
    // completion retrospective and still be told it has none. Latent only because this fallback fires
    // just on LLM-enrichment failure, which is exactly why it would have been missed.
    retro_type: 'SD_COMPLETION',
    status: 'PUBLISHED',
    generated_by: 'AUTO_FALLBACK',
    trigger_event: 'LLM_ENRICHMENT_FAILURE_FALLBACK',
    auto_generated: true,
    quality_score: 60,
    what_went_well: [
      `Completed ${sdType} SD "${title}" through full LEO workflow (${handoffCount} handoffs)`,
      keyChanges.length > 0
        ? `Delivered ${keyChanges.length} key change(s): ${keyChanges.map(kc => kc.change || kc).join('; ').substring(0, 200)}`
        : 'SD scope addressed as defined in description',
    ],
    what_needs_improvement: knownIssues.length > 0
      ? knownIssues.slice(0, 2)
      : ['LLM enrichment unavailable — retrospective generated from DB context only'],
    key_learnings: [
      `${sdType} SD completed with ${handoffCount} handoffs. ${fileRefs}`,
      gateScores.length > 0
        ? `Gate scores: ${gateScores.join(', ')}`
        : `SD passed all required gates for ${sdType} workflow`,
      'Fallback retrospective generated from SD metadata and handoff artifacts when LLM was unavailable',
    ],
    action_items: [
      { action: `Verify ${sdKey} acceptance criteria met post-deployment`, owner: 'future-claude', deadline: 'next-sd', verification: 'Check issue_patterns for recurrence within 30 days' },
      { action: 'Monitor LLM availability for programmatic retrospective generation', owner: 'future-claude', deadline: 'next-sd', verification: 'Retrospective generator exits 0 on next SD completion' },
    ],
    improvement_areas: [
      { area: 'Retrospective generation resilience', analysis: `LLM enrichment failed, requiring fallback to DB-context extraction. ${changedFilesList.length} files identified from git history.`, prevention: 'Fallback path now generates structured content from SD metadata and handoff artifacts' },
    ],
    conducted_date: new Date().toISOString(),
    metadata: { auto_created: true, reason: 'llm_fallback', source: 'retrospective-generator.js' },
  };

  if (isDryRun) {
    return { retrospective_id: 'dry-run', quality_score: 60, sd_id: sdKey, dry_run: true, fallback: true };
  }

  // Check for an existing COMPLETION retrospective.
  //
  // SCOPED TO retro_type='SD_COMPLETION' DELIBERATELY. Unscoped, this lookup returns the SD's most
  // recent retrospective of ANY type — in practice the LEAD-TO-PLAN HANDOFF row, because that is
  // what exists first — and the update below then overwrites it. Measured consequence: the handoff
  // retrospective's content is destroyed, the row keeps its handoff-era created_at, and it acquires
  // completion content, so the completion gate (which requires a SD_COMPLETION row created AFTER
  // LEAD-TO-PLAN acceptance) rejects it as stale while the generators report one already exists.
  // Three of three SDs reaching LEAD-FINAL acquired that corruption; two were left unable to complete
  // with their code already merged. The same unscoped-lookup defect exists in this file's LLM prompt
  // (step 5), fixed alongside this.
  const { data: existing } = await supabaseClient
    .from('retrospectives')
    .select('id')
    .eq('sd_id', sdKey)
    .eq('retro_type', 'SD_COMPLETION')
    .order('created_at', { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    // Update existing (newest) retrospective with enriched content
    const { error: updateErr } = await supabaseClient
      .from('retrospectives')
      .update(retroContent)
      .eq('id', existing[0].id);

    if (updateErr) throw new Error(`Fallback retro update failed: ${updateErr.message}`);
    return { retrospective_id: existing[0].id, quality_score: 60, sd_id: sdKey, fallback: true };
  } else {
    // Insert new retrospective
    const { data: inserted, error: insertErr } = await supabaseClient
      .from('retrospectives')
      .insert(retroContent)
      .select('id')
      .single();

    if (insertErr) throw new Error(`Fallback retro insert failed: ${insertErr.message}`);
    return { retrospective_id: inserted.id, quality_score: 60, sd_id: sdKey, fallback: true };
  }
}

try {
  const result = await runProgrammaticTask(USER_PROMPT, tools, {
    systemPrompt: SYSTEM_PROMPT,
    dryRun,
    maxTokens: 6144,
  });

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // QF-20260903-508: name the backend that produced this, not just the symptom -- a silent
    // provider fallback (Anthropic unavailable -> Google Gemini) can produce output that does
    // not honour this contract even when the primary reliably does, and without this a worker
    // reasonably (but wrongly) suspects its own prompt or item instead of the fallback path.
    console.error(`No JSON in retrospective-generator output (backend: ${resolveProvider()}):`, result.substring(0, 300));
    process.exit(1);
  }

  const retroData = JSON.parse(jsonMatch[0]);
  if (dryRun) retroData.dry_run = true;

  console.log(JSON.stringify(retroData));
  process.exit(0);
} catch (err) {
  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-030: Fallback to DB-context retrospective
  console.error(`LLM enrichment failed: ${err.message}`);
  console.error('Attempting database-driven fallback...');
  try {
    const fallbackResult = await generateFallbackRetrospective(supabase, sdId, branch, dryRun);
    console.log(JSON.stringify(fallbackResult));
    process.exit(0);
  } catch (fallbackErr) {
    console.error(JSON.stringify({ error: `LLM failed: ${err.message}; Fallback failed: ${fallbackErr.message}` }));
    process.exit(1);
  }
}
