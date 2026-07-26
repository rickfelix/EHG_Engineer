/**
 * Post-Completion Validation
 *
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-F
 *
 * Validates that post-completion commands were executed:
 * - /ship (BLOCK if missing) - Required for all completed SDs
 * - /learn (WARN if missing) - Recommended for code SDs
 * - /document (WARN if missing) - Recommended for all SD types except orchestrator
 *
 * @module stop-subagent-enforcement/post-completion-validator
 */

import { execSync } from 'child_process';
import { COMPLETION_FLAG, WITNESS_INDETERMINATE, isWitnessIndeterminate } from '../../../lib/governance/completion-flag-keys.js';

/**
 * SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001 / FR-4 + TR-6.
 *
 * Reminder-first witness check: every completed SD should have a durable
 * "completion flags" record (written by scripts/capture-completion-flags.js) proving the
 * end-of-SD incidental-findings reflection ran. This runs for ALL completed SD types
 * (NOT gated by isCodeProducing) and only ever appends to `missingRecommended` — it must
 * NEVER cause process.exit(2). The query uses the SAME frozen metadata-key contract the
 * writer uses, so writer/consumer keys cannot drift.
 *
 * Returns a WARN string to push into missingRecommended, or null when a valid record exists.
 * MUST NOT throw — any error resolves to null (no warning, no block).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdKey - The SD key
 * @returns {Promise<string|null>}
 * @private
 */
async function _checkCompletionFlagsWitness(supabase, sdKey) {
  try {
    const { data: flagRecords, error } = await supabase
      .from('feedback')
      .select('id, metadata')
      .eq('metadata->>' + COMPLETION_FLAG.ORIGIN_KEY, COMPLETION_FLAG.ORIGIN_VALUE)
      .eq('metadata->>' + COMPLETION_FLAG.SOURCE_SD_KEY, sdKey);

    if (error) return null; // fail-soft: never block on a query error

    const records = flagRecords || [];
    if (records.length === 0) {
      return `completion-flags record missing for ${sdKey}; run scripts/capture-completion-flags.js`;
    }

    // A record is "complete" when its reflection carries a numeric checklist_items count.
    const hasComplete = records.some(r => typeof r?.metadata?.reflection?.checklist_items === 'number');
    if (!hasComplete) {
      return `completion-flags record incomplete for ${sdKey}; run scripts/capture-completion-flags.js`;
    }

    return null;
  } catch (e) {
    // QF-20260725-868: this catch used to `return null` — BYTE-IDENTICAL to the success path above,
    // so a CRASHED witness reported VERIFIED-CLEAN and no caller could tell the difference. The
    // mechanism built to prove the post-completion tail ran could not detect its own failure to run.
    //
    // It stays FAIL-SOFT (coordinator decision a59441f4): this is a witness inside a Stop hook
    // standing between every worker and "done". Blocking on a crash would turn an observability gap
    // into an availability outage — one transient Supabase error would wedge the fleet. The fix is
    // to make the state DISTINGUISHABLE, not to make it blocking.
    await _recordIndeterminate(supabase, sdKey, e);
    return WITNESS_INDETERMINATE.STATE;
  }
}

/**
 * QF-20260725-868: make could-not-determine COUNTABLE, not merely logged.
 *
 * "A non-blocking marker nobody can count is the same defect wearing a different value" — all four
 * AEGIS adapters already logged, and logging is exactly what let that class persist unnoticed. This
 * writes one queryable row per occurrence so the rate can be checked later.
 *
 * Best-effort by construction: it is wrapped so it can NEVER throw. A telemetry failure must not
 * escalate into the blocking path we just decided against — that would reintroduce the availability
 * risk through the back door.
 */
async function _recordIndeterminate(supabase, sdKey, err) {
  try {
    console.error(`   ⚠️  COMPLETION_FLAGS witness could NOT be determined for ${sdKey} (${err && err.message}) — surfaced, not blocking`);
    if (!supabase) return;
    await supabase.from('feedback').insert({
      type: 'harness',
      category: WITNESS_INDETERMINATE.FEEDBACK_CATEGORY,
      severity: 'medium',
      title: `completion-flags witness indeterminate for ${sdKey}`,
      description: `The completion-flags witness threw and could not determine whether the post-completion tail ran. Surfaced non-blocking per QF-20260725-868. Error: ${err && err.message}`,
      error_message: String((err && err.message) || err || 'unknown'),
      metadata: { sd_key: sdKey, state: WITNESS_INDETERMINATE.STATE, qf: 'QF-20260725-868' },
    });
  } catch {
    // Deliberately swallowed — telemetry must never affect the hook's decision.
  }
}

/**
 * Validate that post-completion commands were executed for a completed SD.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - The Strategic Directive
 * @param {string} sdKey - The SD key
 */
export async function validatePostCompletion(supabase, sd, sdKey) {
  // Get post-completion records (stored in command_invocations or similar)
  // For now, we check for ship by looking for a PR linked to the SD
  const { data: prRecords } = await supabase
    .from('sd_scope_deliverables')
    .select('deliverable_name, completion_status, metadata')
    .eq('sd_id', sd.id)
    .ilike('deliverable_name', '%PR%');

  // Also check for retrospectives (indicates /learn was run)
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('id, status')
    .eq('sd_id', sd.id);

  // Check for documentation updates (indicates /document was run)
  const { data: docmonResults } = await supabase
    .from('sub_agent_execution_results')
    .select('verdict')
    .eq('sd_id', sd.id)
    .eq('sub_agent_code', 'DOCMON')
    .order('created_at', { ascending: false })
    .limit(1);

  const missingRequired = [];
  const missingRecommended = [];

  // Check /ship - Required for all completed SDs
  // Ship is considered done if there's a PR or the SD has a completion_date
  const hasShip = (prRecords && prRecords.length > 0) || sd.completion_date;
  if (!hasShip) {
    // Check if there were any commits on the branch
    // Only block if there's actual code to ship
    try {
      // QF-POST-COMPLETION-VALIDATOR-001: Check if we're on main branch
      // If on main, the branch was already merged - don't run git diff that would false-positive
      const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      if (currentBranch === 'main' || currentBranch === 'master') {
        // Branch already merged and cleaned up - ship was successful
        console.error(`   ✅ On ${currentBranch} branch - ship already completed (branch merged)`);
      } else {
        const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
        if (diffOutput) {
          missingRequired.push('SHIP');
        }
      }
    } catch (e) {
      // QF-20260725-868, SECOND SITE, same shape as the witness catch. This silently SKIPS
      // missingRequired.push('SHIP'), so a git error RETIRES A SHIP REQUIREMENT inside the
      // enforcement path — and the original comment rationalised the skip, which is exactly why it
      // read as intentional rather than as a swallowed unknown.
      //
      // The skip itself is KEPT deliberately: pushing SHIP here would put an indeterminate state on
      // the BLOCKING path (missingRequired triggers exit 2), which is the failure mode the
      // coordinator decision forbids — a git hiccup would wedge completion. What changes is that the
      // unknown is now NAMED and surfaced under its own non-blocking label instead of vanishing into
      // an informational log that nobody counts.
      console.error(`   ⚠️  Git diff could NOT be determined for ${sdKey} (${e && e.message}) — SHIP requirement not evaluated; surfaced, not blocking`);
      missingRecommended.push('SHIP_CHECK_INDETERMINATE');
    }
  }

  // Check /learn, /heal, /document - Recommended for code-producing SDs
  const codeProducingTypes = ['feature', 'bugfix', 'security', 'enhancement', 'performance'];
  const isCodeProducing = codeProducingTypes.includes(sd.sd_type);

  if (isCodeProducing) {
    const hasLearn = retros && retros.length > 0;
    if (!hasLearn) {
      missingRecommended.push('LEARN');
    }

    // Check /heal - Recommended for code-producing SDs (skip for heal/corrective sources)
    const healSkipSources = ['heal', 'corrective'];
    const sdSource = (sd.source || '').toLowerCase();
    if (!healSkipSources.includes(sdSource)) {
      const { data: healScores } = await supabase
        .from('eva_heal_scores')
        .select('id')
        .eq('sd_key', sdKey)
        .limit(1);

      const hasHeal = healScores && healScores.length > 0;
      if (!hasHeal) {
        missingRecommended.push('HEAL');
      }
    }

    // Check /document - Recommended for all SD types except orchestrator
    if (sd.sd_type !== 'orchestrator') {
      const hasDocument = docmonResults && docmonResults.length > 0 &&
        ['PASS', 'CONDITIONAL_PASS'].includes(docmonResults[0].verdict);
      if (!hasDocument) {
        missingRecommended.push('DOCUMENT');
      }
    }
  }

  // SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001 / FR-4 + TR-6: completion-flags witness check.
  // Deliberately OUTSIDE the isCodeProducing branch — every completed SD (regardless of type,
  // including orchestrators and non-code SDs) should carry the durable completion-flags record.
  // Reminder-first: this only ever appends to missingRecommended (never missingRequired), so it
  // can never trigger the process.exit(2) BLOCK path below.
  // QF-20260725-868: THREE states, tested by identity — never by truthiness.
  //   null                        -> verified clean
  //   WITNESS_INDETERMINATE.STATE -> the witness crashed; we do NOT know either way
  //   any other string            -> a genuine reason the record is missing/incomplete
  // Collapsing indeterminate into "missing" would be the same defect inverted: asserting a finding
  // from a check that never produced one. It is surfaced under its own label instead, and remains
  // non-blocking (missingRecommended never reaches the exit-2 path below).
  const completionFlagsWarn = await _checkCompletionFlagsWitness(supabase, sdKey);
  if (isWitnessIndeterminate(completionFlagsWarn)) {
    missingRecommended.push('COMPLETION_FLAGS_WITNESS_INDETERMINATE');
  } else if (completionFlagsWarn) {
    missingRecommended.push('COMPLETION_FLAGS');
  }

  // Output results
  if (missingRequired.length > 0) {
    console.error(`\n⚠️  Post-Completion Validation for ${sdKey}`);
    console.error(`   ❌ BLOCKING: Missing required post-completion commands: ${missingRequired.join(', ')}`);
    console.error('\n   LEO Protocol requires /ship before completing an SD with code changes.');
    console.error('   Action: Run /ship to commit, create PR, and merge the changes.');

    const output = {
      decision: 'block',
      reason: `SD ${sdKey} completed without running required post-completion commands`,
      details: {
        sd_key: sdKey,
        sd_type: sd.sd_type,
        status: 'completed',
        missing_required: missingRequired,
        missing_recommended: missingRecommended
      },
      remediation: {
        action: 'Run /ship command to commit and merge changes',
        command: 'Use /ship in Claude Code'
      }
    };

    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // Warn about missing recommended
  if (missingRecommended.length > 0) {
    console.error(`\n💡 Post-Completion Advisory for ${sdKey}`);
    console.error(`   Missing recommended: ${missingRecommended.join(', ')}`);
    if (missingRecommended.includes('LEARN')) {
      console.error('   Consider running /learn to capture insights from this SD');
    }
    if (missingRecommended.includes('HEAL')) {
      console.error('   Consider running /heal sd to verify SD promises');
    }
    if (missingRecommended.includes('DOCUMENT')) {
      console.error('   Consider running /document to update documentation');
    }
    if (missingRecommended.includes('COMPLETION_FLAGS')) {
      console.error(`   ${completionFlagsWarn}`);
    }
    console.error('   (Not blocking - these improve continuous improvement)');
  } else {
    console.error(`✅ Post-Completion Validation: ${sdKey} passed`);
  }
}
