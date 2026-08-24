#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-COMMS-LANE-TTLS-001';

// LEAD-phase enrichment: metadata.needs_enrichment flagged key_changes, strategic_objectives,
// risks as missing on this auto-created (leo-create-sd --from-plan) SD row. Filled from the
// 9-question LEAD gate + due-diligence Explore survey (registry precedent: lib/governance/
// gauge-registry.js; paging surfaces confirmed: scripts/coordinator-quiet-tick.mjs,
// sms_outbound_obligations, lib/periodic-liveness/ladder-escalation.mjs; explicitly NOT
// touching lib/coordination/dead-letter-drain.js, which solves the dead/gone-SESSION class,
// not the unread-past-TTL-to-a-LIVE-recipient class this SD targets).

const key_changes = [
  { change: 'FR-1: single lane-TTL registry keyed by payload.kind (directive/advisory/reply/suggestion), data-as-code mirroring the lib/governance/gauge-registry.js pattern (not a new DB table) -- one representation, no per-caller TTL drift.', type: 'feature' },
  { change: 'FR-1: on TTL expiry, stamp the session_coordination row expired-unread (payload marker, e.g. payload.dead_letter_reason=\'ttl_expired_unread\') -- NEVER delete -- so the dead-letter rate stays measurable after the fix ships.', type: 'feature' },
  { change: 'FR-2: dead-letter alarm that pages the sender\'s successor/owner when a lane\'s unread-past-TTL count breaches a threshold, via a surface OTHER than session_coordination -- the quiet-tick summary line (scripts/coordinator-quiet-tick.mjs), an sms_outbound_obligations row, or the ladder (lib/periodic-liveness/ladder-escalation.mjs) -- never a new session_coordination row into the same undrained path it monitors.', type: 'feature' },
  { change: 'FR-3: per-lane dead-letter gauge/metric, aligned with the existing lib/coordination/lane-pending-gauge.cjs and scripts/dispatch-suggestion-report.mjs readers rather than a duplicate one, publishing the 62% (coordinator directives) / 100% (dispatch_suggestion) pre-fix baseline for 30-day re-measurement.', type: 'feature' },
];

const strategic_objectives = [
  'Close the confirmed silent-bypass/dead-letter gap in cross-session fleet communication (62% coordinator-directive dead-letter, 100% dispatch_suggestion dead-letter) without changing the underlying prompt-boundary drain architecture (a harness property, explicitly out of scope).',
  'Make dead-letter loss loud instead of silent: distinguish delivered-and-ignored from never-read, and page a human/successor through a surface that is independently verifiable to be reachable -- never through the same undrained inbox path the alarm is meant to catch failing.',
  'Reuse existing paging and gauge primitives (gauge-registry.js pattern, quiet-tick, sms_outbound_obligations, the ladder, lane-pending-gauge.cjs) rather than inventing parallel machinery, keeping this fix additive to session_coordination rather than a schema/architecture change.',
];

const risks = [
  { risk: 'A miscalibrated dead-letter threshold could produce alarm noise (false pages) or, if set too high, could fail to page on a genuine dead-letter spike.', mitigation: 'Start with a conservative threshold informed by the measured 62%/100% baselines; land the alarm observe-only (log/gauge only, no paging) for an initial soak before enabling live paging, mirroring this SD\'s own FR-1 pattern of PATH_INTEGRITY_EXIT_GATE_ENFORCE-style default-OFF flags used elsewhere in this codebase.' },
  { risk: 'FR-2\'s hard "different surface" constraint is easy to violate by accident -- e.g. an implementation that pages by writing a NEW session_coordination row would silently fail the constraint while looking correct.', mitigation: 'A negative test asserting the alarm event lands OUTSIDE session_coordination is a first-class acceptance criterion (already specified in the SD\'s own success criteria), not an optional nice-to-have -- PLAN must carry it into the PRD as a blocking test, not an informational one.' },
  { risk: 'Overlap/confusion with the EXISTING, differently-scoped dead-letter machinery (lib/coordination/dead-letter-drain.js, which stamps payload.dead_letter=true for rows targeting DEAD/GONE sessions -- an orphan-detection class, not this SD\'s unread-past-TTL-to-a-LIVE-recipient class) could lead to a naming collision or accidental double-counting in the gauge.', mitigation: 'Use a distinct payload marker key for this SD\'s expired-unread state (not payload.dead_letter, which is already owned by the orphan-detection sweep) and have FR-3\'s gauge explicitly exclude/label rows already marked by the orphan-detection path.' },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr || !sd) { console.error('READ ERR', readErr?.message); process.exit(1); }

const newMeta = { ...(sd.metadata || {}) };
delete newMeta.needs_enrichment;

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes, strategic_objectives, risks, metadata: newMeta })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
console.log('LEAD enrichment written for SD', sd.id);
