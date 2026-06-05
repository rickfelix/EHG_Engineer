#!/usr/bin/env node

/**
 * Create Quick-Fix Entry
 * LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish
 *
 * Usage:
 *   node scripts/create-quick-fix.js --title "Fix broken button" --type bug --severity high
 *   node scripts/create-quick-fix.js --interactive  (prompts for all fields)
 *
 * Tiered routing via Unified Work-Item Router:
 *   Tier 1 (<=30 LOC): Auto-approve QF, skip compliance rubric
 *   Tier 2 (31-75 LOC): Standard QF, requires compliance rubric >=70
 *   Tier 3 (>75 LOC or risk keywords): Escalate to full SD workflow
 *
 * Thresholds are database-driven (work_item_thresholds table).
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { routeWorkItem } from '../lib/utils/work-item-router.js';
import { getRepoPaths, ENGINEER_ROOT } from '../lib/repo-paths.js';
import { preclaimFeedbackRows, resolveFeedbackIds, findFeedbackRefConflicts } from '../lib/feedback/preclaim-feedback-rows.js';
import { releasePreclaim } from '../lib/feedback/release-preclaim.js';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * Detect target application based on current working directory (registry-driven)
 * @returns {string} The detected target application name
 */
function detectTargetApplication() {
  const cwd = process.cwd().replace(/\\/g, '/').toLowerCase();
  const paths = getRepoPaths();
  // Sort by path length descending for longest-match-first
  const entries = Object.entries(paths).sort((a, b) => b[1].length - a[1].length);
  for (const [name, appPath] of entries) {
    const norm = appPath.replace(/\\/g, '/').toLowerCase();
    if (cwd === norm || cwd.startsWith(norm + '/')) return name;
  }
  return 'EHG_Engineer';
}

// Generate quick-fix ID: QF-YYYYMMDD-NNN
function generateQuickFixId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');

  return `QF-${year}${month}${day}-${random}`;
}

// Interactive prompting
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function createQuickFix(options = {}) {
  console.log('\n🎯 LEO Quick-Fix Workflow - Create Issue\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  // Use service role key for insert operations (anon key blocked by RLS)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    console.log('   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Interactive mode if no options provided
  let title, type, severity, description, steps, expected, actual, estimatedLoc, targetApplication;

  // Auto-detect or use provided target application
  targetApplication = options.targetApplication || detectTargetApplication();
  console.log(`🎯 Target Application: ${targetApplication}`);
  console.log(`   (Run from ${targetApplication === 'EHG' ? 'EHG app' : 'EHG_Engineer'} directory or use --target-application)\n`);

  if (options.interactive || !options.title) {
    console.log('📝 Interactive Mode - Please provide details:\n');

    title = await prompt('Issue title: ');

    console.log('\nType options: bug, polish, typo, documentation');
    type = await prompt('Issue type: ');

    console.log('\nSeverity options: critical, high, medium, low');
    severity = await prompt('Issue severity: ');

    description = await prompt('\nBrief description: ');
    steps = await prompt('Steps to reproduce (optional): ');
    expected = await prompt('Expected behavior (optional): ');
    actual = await prompt('Actual behavior (optional): ');

    const estimatedLocStr = await prompt('Estimated lines of code to change (default: 10): ');
    estimatedLoc = parseInt(estimatedLocStr) || 10;
  } else {
    // Use provided options
    title = options.title;
    type = options.type || 'bug';
    severity = options.severity || 'medium';
    description = options.description || title;
    steps = options.steps || '';
    expected = options.expected || '';
    actual = options.actual || '';
    estimatedLoc = options.estimatedLoc || 10;
  }

  // Validate type
  const validTypes = ['bug', 'polish', 'typo', 'documentation'];
  if (!validTypes.includes(type)) {
    console.log(`❌ Invalid type: ${type}`);
    console.log(`   Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  // Validate severity
  const validSeverities = ['critical', 'high', 'medium', 'low'];
  if (!validSeverities.includes(severity)) {
    console.log(`❌ Invalid severity: ${severity}`);
    console.log(`   Valid severities: ${validSeverities.join(', ')}`);
    process.exit(1);
  }

  // EVA Pre-Check: warn if vision/architecture docs exist for this topic
  try {
    const topicWords = (title + ' ' + description).toLowerCase();
    const { data: visionDocs } = await supabase
      .from('eva_vision_documents')
      .select('vision_key, status')
      .eq('status', 'active')
      .limit(50);
    const { data: archPlans } = await supabase
      .from('eva_architecture_plans')
      .select('plan_key, status')
      .eq('status', 'active')
      .limit(50);

    const matchingVision = (visionDocs || []).filter(v =>
      topicWords.includes(v.vision_key.toLowerCase().replace(/-/g, ' ').replace(/vision/i, '').trim())
    );
    const matchingArch = (archPlans || []).filter(a =>
      topicWords.includes(a.plan_key.toLowerCase().replace(/-/g, ' ').replace(/arch/i, '').trim())
    );

    if (matchingVision.length > 0 || matchingArch.length > 0) {
      console.log('⚠️  EVA PRE-CHECK WARNING:');
      console.log('   Matching EVA documents found — scope may exceed Quick Fix limits:');
      for (const v of matchingVision) console.log(`     Vision: ${v.vision_key}`);
      for (const a of matchingArch) console.log(`     Arch:   ${a.plan_key}`);
      console.log('   Consider creating a full SD instead.\n');
    }
  } catch {
    // EVA pre-check is non-blocking — continue even if it fails
  }

  // QF-20260527-250: pre-INSERT dedup gate. QF-20260526-885 + QF-20260526-106
  // were created 89s apart by UAT_AGENT for the same feedback symptom
  // (b06e04f8) because nothing here checks for existing open QFs. HARD gate
  // runs when --feedback-id is supplied; SOFT title-prefix gate when not.
  // The override --allow-duplicate "<reason>" preserves audited escape.
  let resolvedFeedbackIds = null;
  if (options.feedbackId) {
    try {
      resolvedFeedbackIds = await resolveFeedbackIds(supabase, options.feedbackId);
    } catch (e) {
      console.error(`\n❌ [${e.code || 'FEEDBACK_ID_ERROR'}] ${e.message}`);
      process.exit(1);
    }
    const { data: linkedFb } = await supabase
      .from('feedback').select('id, quick_fix_id')
      .in('id', resolvedFeedbackIds).not('quick_fix_id', 'is', null);
    const linkedQfIds = [...new Set((linkedFb || []).map(r => r.quick_fix_id))];
    if (linkedQfIds.length > 0) {
      const { data: openRivals } = await supabase
        .from('quick_fixes').select('id, status, title')
        .in('id', linkedQfIds).in('status', ['open', 'in_progress']);
      if (openRivals && openRivals.length > 0) {
        console.error(`\n❌ [DUPLICATE_QF] feedback already claimed by ${openRivals.length} open QF(s):`);
        for (const qf of openRivals) {
          console.error(`     ${qf.id} (${qf.status}): ${(qf.title || '').slice(0, 80)}`);
        }
        if (!options.allowDuplicate) {
          console.error('   Inspect: node scripts/read-quick-fix.js <id>');
          console.error('   Override (audited): --allow-duplicate "<reason>"');
          process.exit(1);
        }
        console.warn(`\n⚠️  [ALLOW_DUPLICATE] proceeding anyway: ${options.allowDuplicate}`);
      }
    }
  } else {
    // SD-FDBK-INFRA-MAKE-FEEDBACK-BASED-001 FR-1: even without --feedback-id, a QF whose
    // text references a feedback UUID already claimed by an open/in_progress QF is a silent
    // sibling spawn (the QF-723/729/006 class off feedback 1b4cee40). Resolve referenced
    // UUIDs and hard-block (override via --allow-duplicate). Fail-OPEN — a DB error in the
    // scan must NEVER brick QF creation on this shared hot path.
    const refScan = await findFeedbackRefConflicts({ supabase, text: [title, description, steps].filter(Boolean).join('\n') });
    if (refScan.failedOpen) {
      console.warn(`\n⚠️  [DEDUP_SCAN_DEGRADED] feedback-reference dedup scan failed-open (${refScan.error || 'unknown'}); proceeding without it.`);
    } else if (refScan.conflicts.length > 0) {
      console.error(`\n❌ [DUPLICATE_QF] this QF's text references feedback already claimed by ${refScan.conflicts.length} open QF(s):`);
      for (const qf of refScan.conflicts) {
        console.error(`     ${qf.id} (${qf.status}): ${(qf.title || '').slice(0, 80)}`);
      }
      console.error(`   referenced feedback: ${refScan.uuids.map(u => u.slice(0, 8)).join(', ')} (pass --feedback-id for atomic pre-claim)`);
      if (!options.allowDuplicate) {
        console.error('   Inspect: node scripts/read-quick-fix.js <id>');
        console.error('   Override (audited): --allow-duplicate "<reason>"');
        process.exit(1);
      }
      console.warn(`\n⚠️  [ALLOW_DUPLICATE] proceeding anyway: ${options.allowDuplicate}`);
    }
    const prefix = (title || '').toLowerCase().slice(0, 40);
    if (prefix.length >= 10) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: similar } = await supabase
        .from('quick_fixes').select('id, title, created_at')
        .eq('status', 'open').gte('created_at', since)
        .ilike('title', `${prefix}%`);
      if (similar && similar.length > 0) {
        console.error(`\n⚠️  [POSSIBLE_DUPLICATE_QF] ${similar.length} similar open QF(s) created in last 60 min:`);
        for (const qf of similar) {
          console.error(`     ${qf.id} (${qf.created_at}): ${(qf.title || '').slice(0, 80)}`);
        }
        if (!options.allowDuplicate) {
          console.error('   Override (audited): --allow-duplicate "<reason>"');
          process.exit(1);
        }
        console.warn(`\n⚠️  [ALLOW_DUPLICATE] proceeding anyway: ${options.allowDuplicate}`);
      }
    }
  }

  // Generate ID
  const qfId = generateQuickFixId();

  // QF-20260526-106: route + INSERT the quick_fixes row BEFORE the per-feedback-row
  // pre-claim. The pre-claim sets feedback.quick_fix_id = qfId, which the
  // fk_feedback_quick_fix constraint rejects unless the quick_fixes row already
  // exists (backlog b06e04f8). The common no-feedback-id path is behaviorally
  // identical — insert simply moves ahead of the skipped pre-claim.

  // Route once; the same decision drives initial status (escalated vs open) and is reused below.
  const scopeText = [expected, actual].filter(Boolean).join('\n');
  const routingDecision = await routeWorkItem({
    estimatedLoc,
    type,
    scope: scopeText,
    description,
    entryPoint: 'create-quick-fix',
  }, supabase);
  const isTier3 = routingDecision.tier === 3;
  const initialStatus = isTier3 ? 'escalated' : 'open';

  {
    const { error: insertErr } = await supabase
      .from('quick_fixes')
      .insert({
        id: qfId,
        title,
        type,
        severity,
        description,
        steps_to_reproduce: steps,
        expected_behavior: expected,
        actual_behavior: actual,
        estimated_loc: estimatedLoc,
        target_application: targetApplication,
        status: initialStatus,
        escalation_reason: isTier3 ? routingDecision.escalationReason : null,
        routing_tier: routingDecision.tier,
        routing_threshold_id: routingDecision.thresholdId !== 'fallback' && routingDecision.thresholdId !== 'error-multiple-active' ? routingDecision.thresholdId : null,
        created_at: new Date().toISOString()
      });
    if (insertErr) {
      console.log('❌ Failed to create quick-fix record:', insertErr.message);
      process.exit(1);
    }
  }

  // SD-FDBK-INFRA-PER-FEEDBACK-ROW-001 / FR-1+FR-3: atomic per-feedback-row pre-claim.
  // Skipped when --feedback-id omitted (full backward-compatibility).
  if (options.feedbackId) {
    const creatorSessionId = process.env.CLAUDE_SESSION_ID || null;
    // QF-20260527-250: feedback IDs already resolved by the dedup gate above.
    const resolvedIds = resolvedFeedbackIds;
    const { claimed, conflicts } = await preclaimFeedbackRows({
      supabase, feedbackIds: resolvedIds, pendingQfId: qfId, sessionId: creatorSessionId,
    });
    if (conflicts.length > 0) {
      // FR-3: print every conflict; release any partially-claimed siblings before exit.
      for (const c of conflicts) {
        const age = c.heartbeat_at ? `${Math.floor((Date.now() - new Date(c.heartbeat_at).getTime()) / 1000)}s ago` : 'unknown';
        console.error(`\n❌ [SIBLING_CLAIM] feedback ${c.id.slice(0,8)} already claimed by QF-${c.qf_id || '?'} (session ${c.session_id ? c.session_id.slice(0,8) : '?'}, heartbeat ${age})`);
      }
      // FR-3: force-claim override with per-session daily quota
      if (options.forceClaim) {
        if (!options.forceClaimReason || !String(options.forceClaimReason).trim()) {
          console.error('\n❌ [FORCE_CLAIM_REASON_REQUIRED] --force-claim requires --force-claim-reason "<text>"');
          if (claimed.length > 0) await releasePreclaim({ supabase, quickFixId: qfId });
          await supabase.from('quick_fixes').delete().eq('id', qfId);
          process.exit(1);
        }
        // SD-FDBK-INFRA-MAKE-FEEDBACK-BASED-001 FR-2 / security review d618f9be: the daily
        // quota keys on created_by=creatorSessionId. A null session makes the quota query
        // (.eq('created_by', null) -> NULL=NULL) count 0 forever -> unbounded overrides.
        // Fail-CLOSED: the override cannot be rate-limited without an actor id.
        if (!creatorSessionId) {
          console.error('\n❌ [FORCE_CLAIM_REQUIRES_SESSION] --force-claim requires CLAUDE_SESSION_ID so the daily quota can be enforced.');
          if (claimed.length > 0) await releasePreclaim({ supabase, quickFixId: qfId });
          await supabase.from('quick_fixes').delete().eq('id', qfId);
          process.exit(1);
        }
        const QUOTA = parseInt(process.env.LEO_FORCE_CLAIM_DAILY_QUOTA || '3', 10);
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        // SD-FDBK-INFRA-MAKE-FEEDBACK-BASED-001 FR-2: audit_log has no category/session_id
        // columns — query the canonical shape (event_type/created_by). G6: this auth-class
        // quota check FAILS-CLOSED on a query error so it can never silently revert to the
        // unbounded behavior it had while the columns were wrong.
        const { data: bypassRows, error: quotaErr } = await supabase
          .from('audit_log')
          .select('id')
          .eq('event_type', 'force_claim_override')
          .eq('created_by', creatorSessionId)
          .gte('created_at', since);
        if (quotaErr) {
          console.error(`\n❌ [FORCE_CLAIM_QUOTA_CHECK_FAILED] cannot verify daily quota (${quotaErr.message}); blocking override (fail-closed).`);
          if (claimed.length > 0) await releasePreclaim({ supabase, quickFixId: qfId });
          await supabase.from('quick_fixes').delete().eq('id', qfId);
          process.exit(1);
        }
        const used = (bypassRows || []).length;
        if (used >= QUOTA) {
          console.error(`\n❌ [FORCE_CLAIM_QUOTA_EXHAUSTED] ${used}/${QUOTA} used in last 24h for session ${(creatorSessionId||'?').slice(0,8)}`);
          if (claimed.length > 0) await releasePreclaim({ supabase, quickFixId: qfId });
          await supabase.from('quick_fixes').delete().eq('id', qfId);
          process.exit(1);
        }
        // Attempt to force-claim the still-conflicting rows by setting quick_fix_id over their existing claim.
        const conflictIds = conflicts.map(c => c.id);
        const claimedAt = new Date().toISOString();
        for (const id of conflictIds) {
          const { data: cur } = await supabase.from('feedback').select('metadata').eq('id', id).maybeSingle();
          const newMeta = { ...(cur?.metadata || {}), qf_claim_state: 'pending', qf_claim_at: claimedAt, qf_claim_forced: true };
          await supabase.from('feedback').update({ quick_fix_id: qfId, session_id: creatorSessionId, metadata: newMeta }).eq('id', id);
        }
        // FR-2: canonical audit_log shape (mirrors cancel-sd.js / bypass-handler.js); error is CHECKED.
        const { error: forceAuditErr } = await supabase.from('audit_log').insert({
          event_type: 'force_claim_override',
          entity_type: 'quick_fix',
          entity_id: qfId,
          created_by: creatorSessionId,
          severity: 'warning',
          metadata: { qf_id: qfId, session_id: creatorSessionId, feedback_ids: conflictIds, reason: options.forceClaimReason, quota_used: used + 1, quota_max: QUOTA, message: `force-claim override on ${conflictIds.length} feedback row(s) for QF ${qfId}: ${options.forceClaimReason}` },
        });
        if (forceAuditErr) console.warn(`⚠️  [AUDIT_WRITE_FAILED] force_claim_override audit row not persisted (non-fatal): ${forceAuditErr.message}`);
        console.log(`\n⚠️  [FORCE_CLAIM] Override applied to ${conflictIds.length} row(s) (quota ${used + 1}/${QUOTA}). Audit_log row emitted.`);
      } else {
        if (claimed.length > 0) {
          const { released } = await releasePreclaim({ supabase, quickFixId: qfId });
          console.error(`   ↩ Released ${released.length} partially-claimed sibling(s) to keep state clean.`);
        }
        // QF-20260526-106: remove the just-created quick_fixes row so the failed
        // pre-claim leaves no orphan (the FK we just satisfied is now the only
        // referent — deleting it after releasing the feedback claim is safe).
        await supabase.from('quick_fixes').delete().eq('id', qfId);
        process.exit(1);
      }
    }
    console.log(`\n✓ Pre-claimed ${claimed.length + (options.forceClaim ? conflicts.length : 0)} feedback row(s) for ${qfId}`);
    // FR-2: canonical audit_log shape; error is CHECKED (was silently failing on category/session_id/message).
    const { error: preclaimAuditErr } = await supabase.from('audit_log').insert({
      event_type: 'feedback_qf_preclaim',
      entity_type: 'quick_fix',
      entity_id: qfId,
      created_by: creatorSessionId,
      severity: 'info',
      metadata: { qf_id: qfId, session_id: creatorSessionId, feedback_ids: resolvedIds, claimed: claimed.map(c=>c.id), forced: options.forceClaim ? conflicts.map(c=>c.id) : [], message: `Pre-claimed ${claimed.length} feedback row(s) for QF ${qfId}` },
    });
    if (preclaimAuditErr) console.warn(`⚠️  [AUDIT_WRITE_FAILED] feedback_qf_preclaim audit row not persisted (non-fatal): ${preclaimAuditErr.message}`);
  }

  // QF-20260526-106: the quick_fixes row was inserted ABOVE (before pre-claim).
  // The remaining steps just present the routing decision and (for Tier 3) exit.
  console.log(`\n📊 Routing Decision: ${routingDecision.tierLabel} (${estimatedLoc} LOC, threshold: ${routingDecision.thresholdId})`);

  // Re-read the just-inserted row to keep the original return shape for callers.
  const { data } = await supabase.from('quick_fixes').select('*').eq('id', qfId).single();

  // Tier 3: Escalate to full Strategic Directive
  if (isTier3) {
    console.log('\n⚠️  ESCALATION REQUIRED\n');
    console.log(`Reason: ${routingDecision.escalationReason}`);
    console.log('This requires a full Strategic Directive.\n');
    console.log('📋 Next steps:');
    console.log('   1. Create Strategic Directive with LEAD approval');
    console.log('   2. Run: node scripts/add-prd-to-database.js SD-XXX');
    console.log('   3. Follow full LEAD→PLAN→EXEC workflow\n');
    console.log(`✅ Quick-fix record created: ${qfId}`);
    console.log('   Status: ESCALATED (requires full SD)');
    return { escalated: true, qfId, data };
  }

  console.log(`\n✅ Quick-fix created: ${qfId}\n`);
  console.log('📋 Details:');
  console.log(`   Title: ${title}`);
  console.log(`   Type: ${type}`);
  console.log(`   Severity: ${severity}`);
  console.log(`   Target App: ${targetApplication}`);
  console.log(`   Estimated LOC: ${estimatedLoc}`);
  console.log(`   Tier: ${routingDecision.tierLabel}`);
  if (routingDecision.tier === 1) {
    console.log('   Compliance: Skipped (Tier 1 auto-approve)');
  } else {
    console.log(`   Compliance: Required (min score: ${routingDecision.complianceMinScore})`);
  }
  console.log(`   Status: ${data.status}\n`);

  // Worktree Isolation for Quick-Fix work
  // QF-20260424-674: worktree creation is gated on a held DB claim.
  // Unclaimed QFs are queued with NO registered worktree — the session that
  // later runs `/leo QF-<id>` is the one that materializes it.
  if (options.autoBranch !== false) { // Default to true
    const creatorSessionId = process.env.CLAUDE_SESSION_ID;
    if (!creatorSessionId) {
      console.log('🌲 Worktree Isolation skipped — QF queued unclaimed.');
      console.log(`   Run /leo ${qfId} to claim and create a worktree when picking up.\n`);
      return printNextSteps(qfId, false, null);
    }
    // Atomically set claiming_session_id; if another session already holds it, bail.
    const { data: claimed } = await supabase
      .from('quick_fixes')
      .update({ claiming_session_id: creatorSessionId, started_at: new Date().toISOString() })
      .eq('id', qfId).is('claiming_session_id', null)
      .select('id,claiming_session_id').maybeSingle();
    if (!claimed) {
      console.log('   ⚠️  Could not claim QF atomically — skipping worktree creation.\n');
      return printNextSteps(qfId, false, null);
    }
    console.log(`🌲 Worktree Isolation (claimed by ${creatorSessionId})\n`);

    try {
      // Check if git repo
      try {
        execSync('git rev-parse --git-dir', { stdio: 'pipe' });
      } catch (_err) {
        console.log('   ⚠️  Not a git repository - skipping worktree creation\n');
        return printNextSteps(qfId, false, null);
      }

      // Dynamically import worktree-manager (ESM)
      const { createWorkTypeWorktree, symlinkNodeModules: _symlinkNodeModules } = await import('../lib/worktree-manager.js');

      const result = createWorkTypeWorktree({
        workType: 'QF',
        workKey: qfId,
        branch: `qf/${qfId}`
      });

      if (result.mode === 'worktree') {
        // SD-LEO-INFRA-SMART-PER-WORKTREE-001: smart provisioning — isolate
        // node_modules under concurrency (immune to shared-store wipes), else junction.
        try {
          const { provisionWorktreeNodeModulesAuto } = await import('../lib/worktree-provision.js');
          const prov = await provisionWorktreeNodeModulesAuto(result.path, { repoRoot: ENGINEER_ROOT });
          console.log(`   📦 node_modules: ${prov.strategy} (${prov.reason})`);
        } catch (provErr) {
          console.log(`   ⚠️  node_modules provisioning failed: ${provErr.message}`);
          console.log('   Run `npm install --ignore-scripts --no-audit --no-fund` in the worktree if needed (NOT `npm ci` — its rm -rf wipes the shared store; harness 95022758).\n');
        }

        const action = result.created ? 'Created' : 'Reusing existing';
        console.log(`   ✅ ${action} worktree: ${result.path}`);
        console.log(`   Branch: ${result.branch}\n`);

        // Set environment marker
        process.env.EHG_WORKTREE_MODE = 'worktree';

        // Update database with branch name and worktree path
        await supabase
          .from('quick_fixes')
          .update({ branch_name: result.branch })
          .eq('id', qfId);

        return printNextSteps(qfId, true, result.path);
      } else {
        // Fallback to main repo
        console.log('   ⚠️  Worktree creation fell back to main repo');
        console.log(`   Reason: ${result.reason}`);
        console.log('');

        process.env.EHG_WORKTREE_MODE = 'main-fallback';

        // Still create a branch in main repo
        const branchName = `qf/${qfId}`;
        try {
          execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
          console.log(`   ✅ Branch created in main repo: ${branchName}\n`);

          await supabase
            .from('quick_fixes')
            .update({ branch_name: branchName })
            .eq('id', qfId);

          return printNextSteps(qfId, true, null);
        } catch (branchErr) {
          console.log(`   ❌ Branch creation also failed: ${branchErr.message}\n`);
          return printNextSteps(qfId, false, null);
        }
      }
    } catch (err) {
      console.log(`   ❌ Worktree creation failed: ${err.message}`);

      // Feedback fa98a703: when quota is the cause, refuse to fall back into
      // `git checkout -b` in the parent CWD — that switches the in-flight
      // session's branch and forces a manual restore.
      if (err.errorCode === 'WORKTREE_QUOTA_EXCEEDED') {
        console.log('   ❌ Quota exhausted — aborting to preserve parent branch.');
        console.log('   💡 Reap stale worktrees first, then retry:');
        console.log('      node scripts/worktree-reaper.mjs --execute');
        console.log('      node scripts/worktree-reaper.mjs --execute --stage2 --yes');
        process.exit(1);
      }

      console.log('   Falling back to branch-only mode.\n');
      process.env.EHG_WORKTREE_MODE = 'main-fallback';

      // Fallback: try simple branch creation
      try {
        const branchName = `qf/${qfId}`;
        execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
        console.log(`   ✅ Fallback branch created: ${branchName}\n`);

        await supabase
          .from('quick_fixes')
          .update({ branch_name: branchName })
          .eq('id', qfId);

        return printNextSteps(qfId, true, null);
      } catch (_fallbackErr) {
        return printNextSteps(qfId, false, null);
      }
    }
  } else {
    return printNextSteps(qfId, false, null);
  }
}

function printNextSteps(qfId, branchCreated, worktreePath) {
  console.log('📍 Next steps:');
  if (worktreePath) {
    console.log(`   1. cd ${worktreePath}`);
    console.log('   2. Implement fix (≤50 LOC)');
    console.log('   3. Run tests: npm run test:unit && npm run test:e2e');
    console.log(`   4. Complete: node scripts/complete-quick-fix.js ${qfId}\n`);
  } else {
    console.log(`   1. Read details: node scripts/read-quick-fix.js ${qfId}`);
    if (!branchCreated) {
      console.log(`   2. Create branch: git checkout -b qf/${qfId}`);
    }
    console.log(`   ${branchCreated ? '2' : '3'}. Implement fix (≤50 LOC)`);
    console.log(`   ${branchCreated ? '3' : '4'}. Run tests: npm run test:unit && npm run test:e2e`);
    console.log(`   ${branchCreated ? '4' : '5'}. Complete: node scripts/complete-quick-fix.js ${qfId}\n`);
  }

  return { escalated: false, qfId, branchCreated, worktreePath };
}

// CLI argument parsing
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--interactive' || arg === '-i') {
    options.interactive = true;
  } else if (arg === '--title') {
    options.title = args[++i];
  } else if (arg === '--type') {
    options.type = args[++i];
  } else if (arg === '--severity') {
    options.severity = args[++i];
  } else if (arg === '--description') {
    options.description = args[++i];
  } else if (arg === '--steps') {
    options.steps = args[++i];
  } else if (arg === '--expected') {
    options.expected = args[++i];
  } else if (arg === '--actual') {
    options.actual = args[++i];
  } else if (arg === '--estimated-loc') {
    options.estimatedLoc = parseInt(args[++i]);
  } else if (arg === '--target-application' || arg === '--target-app') {
    const val = args[++i];
    if (!['EHG', 'EHG_Engineer'].includes(val)) {
      console.error(`❌ Invalid target application: ${val}. Must be 'EHG' or 'EHG_Engineer'`);
      process.exit(1);
    }
    options.targetApplication = val;
  } else if (arg === '--feedback-id') {
    options.feedbackId = args[++i];
  } else if (arg === '--force-claim') {
    options.forceClaim = true;
  } else if (arg === '--force-claim-reason' || arg === '--reason') {
    options.forceClaimReason = args[++i];
  } else if (arg === '--allow-duplicate') {
    // QF-20260527-250: audited override for dedup gate.
    options.allowDuplicate = args[++i];
    if (!options.allowDuplicate || !String(options.allowDuplicate).trim()) {
      console.error('❌ --allow-duplicate requires a non-empty reason');
      process.exit(1);
    }
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
LEO Quick-Fix Workflow - Create Issue

Usage:
  node scripts/create-quick-fix.js --interactive
  node scripts/create-quick-fix.js --title "Fix button" --type bug --severity high

Options:
  --interactive, -i       Interactive mode (prompts for all fields)
  --title                Issue title
  --type                 Issue type (bug, polish, typo, documentation)
  --severity             Severity (critical, high, medium, low)
  --description          Brief description
  --steps                Steps to reproduce
  --expected             Expected behavior
  --actual               Actual behavior
  --estimated-loc        Estimated lines of code (default: 10)
  --target-application   Target repo: 'EHG' or 'EHG_Engineer' (auto-detected from cwd)
  --allow-duplicate      Audited override for dedup gate; requires non-empty <reason>
  --help, -h             Show this help

Examples:
  node scripts/create-quick-fix.js --interactive
  node scripts/create-quick-fix.js --title "Fix save button" --type bug --severity high
  node scripts/create-quick-fix.js --title "Fix typo in header" --type typo --severity low --estimated-loc 1

Tiered Routing:
  - Tier 1 (<=30 LOC): Auto-approve, skip compliance
  - Tier 2 (31-75 LOC): Standard QF, compliance >=70
  - Tier 3 (>75 LOC): Escalate to full SD
  - Risk keywords (security, auth, schema): Force Tier 3
    `);
    process.exit(0);
  } else {
    console.error(`❌ Unknown argument: ${arg}`);
    console.error('   Run with --help for usage information.');
    process.exit(1);
  }
}

// Run
createQuickFix(options).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
