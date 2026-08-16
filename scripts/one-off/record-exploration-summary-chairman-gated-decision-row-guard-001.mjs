#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001';

const filesExplored = [
  {
    file: 'lib/chairman/record-pending-decision.mjs',
    findings: 'recordPendingDecision(supabase,{title,decisionType,context,recommendation,blocking,ventureId,lifecycleStage,raisedBy,allowFixture}) at line 256; shouldAutoEscalate() at 101-104 only fires on blocking===true OR (raisedBy==="adam" AND decisionType==="session_question") -- the original draft picked a decisionType that never satisfies this. QF-20260703-905 rate cap (119-131) already caps standout emails at 3/rolling-hour with digest fold.',
  },
  {
    file: 'lib/governance/human-action-decider.mjs',
    findings: 'Exports DECIDER_KEYS, isHumanActionRequested(), namedDecider() -- canonical existing logic for "does metadata name chairman as decider". Measured under-inclusive alone vs the SD\'s original OR (regex arm catches 1/8 live rows namedDecider misses).',
  },
  {
    file: 'lib/coordinator/safe-metadata-merge.mjs',
    findings: 'Exports mergeMetadataKeys(sdKey, patch, opts) -- the correct stamp-back path for metadata.chairman_decision_id, avoiding stale-snapshot clobber of requires_human_action.',
  },
  {
    file: 'lib/comms/adam-outbound/decision-scheduler/index.js',
    findings: 'The "decision-driving sweep" the original draft assumed would serialize pending rows one-at-a-time. Paired with scripts/cron/adam-decision-scheduler-tick.mjs.',
  },
  {
    file: 'scripts/cron/adam-decision-scheduler-tick.mjs',
    findings: 'Header docstring states isAway() is near-ALWAYS false so the tick will near-NEVER fire, and durabilityUnavailable:true makes away-bridge refuse to re-surface -- the sweep the original draft depended on is non-functional today.',
  },
  {
    file: 'lib/chairman/chairman-actionable.mjs',
    findings: 'isConsoleActionable/isEscalationActionable allowlist is [chairman_approval, gate_decision] + blocking-only [escalation, okr_acceptance] -- confirms a session_question-typed pending row does not surface via this path either; delivery for this SD\'s purposes runs through the escalation-email/SMS funnel inside recordPendingDecision, not this console-actionable path.',
  },
  {
    file: 'scripts/adam-quiet-tick.mjs',
    findings: 'Confirmed exists (the SD\'s claimed integration point for the new probe); currently has zero references to requires_human_action/fenced/chairman_decisions.',
  },
  {
    file: 'chairman_decisions table (live query)',
    findings: 'Row id=1270f408-3136-4ab0-8d6b-567a0c22d171 (2026-08-15, same batch as the chairman\'s SMS escalation) is the proven-working precedent envelope: decisionType=session_question, blocking=false, raised_by=adam, summary "[FENCED-SD GO/DEFER <sd_key>]", brief_data.context={sd_key,options,fenced_age,default_if_no_reply,batch} -- produced a delivered SMS obligation.',
  },
  {
    file: 'strategic_directives_v2 (live query)',
    findings: 'Re-measured the probe\'s own target population live: 7 non-terminal, unclaimed, chairman-gated SDs with no chairman_decisions row and no chairman_decision_id stamp (excluding status=deferred, which is already-decided) -- matches the chairman\'s own cited figure exactly; premise is current, not stale.',
  },
];

const { data: current, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('exploration_summary')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('FETCH ERROR:', fetchErr.message); process.exit(1); }

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    exploration_summary: {
      ...(current.exploration_summary || {}),
      files_explored: filesExplored,
      explored_by: 'Golf-5',
      explored_at: new Date().toISOString(),
    },
  })
  .eq('sd_key', SD_KEY);

if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); process.exit(1); }
console.log(`exploration_summary recorded: ${filesExplored.length} files`);
