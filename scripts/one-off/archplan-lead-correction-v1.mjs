#!/usr/bin/env node
/**
 * LEAD-phase correction for SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001.
 *
 * Independent Explore + VALIDATION sub-agent review confirmed the core premise
 * (lib/eva/archplan-upsert.js:121-122 unconditionally hardcodes status='active',
 * chairman_approved=true, with no override parameter) but VALIDATION materially
 * corrected Explore's report on several points -- captured here before PLAN begins.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('description')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const addendum = `

## LEAD-Phase Correction (2026-09-14, Explore + VALIDATION sub-agent review)

Independent LEAD-phase Explore + VALIDATION review confirmed the core premise (lib/eva/archplan-upsert.js:121-122 unconditionally hardcodes \`status: 'active'\`, \`chairman_approved: true\` in every write, no parameter exists to override it) but corrected several claims before PLAN begins:

**1. Reader census corrected (Explore over-counted 7, real count is 1+2).** The ONLY reader of \`chairman_approved\` on \`eva_architecture_plans\` is \`lib/eva/bridge/trust-elevation.js:60\` (all other \`chairman_approved\`-filtering call sites Explore found are on the SEPARATE \`eva_vision_documents\` table). Two readers filter \`status='active'\`: \`lib/eva/artifact-persistence-service.js:390\` (ADR-attachment) and \`scripts/modules/handoff/executors/plan-to-exec/gates/planning-completeness.js:381-384\` (a non-blocking, venture-scoped WARNING only, -15 score, cannot block a LEO-INFRA SD). \`scripts/cron/cascade-watcher.mjs\` does NOT filter on either field (it gates on \`metadata.auto_generated\`, and its \`metadata\` column on this table doesn't even exist -- a separate, out-of-scope phantom-column defect).

**2. Trust-elevation security question answered: the fix is SAFE, no operational-risk blocker.** Measured directly: only 7 arch plans are both \`chairman_approved\` and venture-linked; every REAL venture (not throwaway fixtures) also carries a \`chairman_approved\` vision, so the vision limb of \`trust-elevation.js\`'s OR-guard covers every real case regardless. Only 2 trust elevations have ever occurred, both attributable to the vision limb, zero to the arch limb. The check is mint-time-only and idempotent (already-\`trusted\` rows untouchable), so no ventures can become "stuck" by this fix -- only FUTURE fleet mints are in scope, and only if a call site opts into \`approved:false\`.

**3. Fix shape corrected -- Explore's recommendation undershot the SD's own stated requirement.** 200 of 235 live \`eva_architecture_plans\` rows come from \`created_by='eva-archplan-command'\` (the CLI at \`scripts/eva/archplan-command.mjs\`), which currently has NO approval flags at all -- an additive \`approved\` param on \`upsertArchPlan()\` alone (mirroring only \`vision-upsert.js\`'s helper-level default-true leg) would leave this dominant path silently stamping approval, unmet against the SD's own title ("no plan is recorded as chairman-approved unless he approved it"). The FULL vision pattern has two legs and only the first was initially found: (a) \`vision-upsert.js\`'s \`approved=true\` default for backward compat, AND (b) \`scripts/eva/vision-command.mjs:139-141\`'s MANDATORY \`--approved | --draft\` CLI choice (hard-errors if omitted, plus \`rejectStringFlagValue\` guarding against \`--approved false\` coercing to true). Mirroring vision properly means adding the equivalent mandatory choice to \`archplan-command.mjs\`.

**4. Precedent for the call-site fix confirmed**: \`QF-20260702-262\` already fixed this exact bug pattern on the VISION side in \`lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js\` (its vision call site passes \`approved: false\` explicitly, with a QF-262 regression-guard test). The file's TWO architecture-plan call sites (lines ~373, ~395) were never given the analogous treatment and currently pass nothing approval-related -- confirmed asymmetry, and a genuinely incoherent compounding defect independent of trust elevation: stage-17 today writes a DRAFT, UNAPPROVED vision and then immediately writes an ACTIVE, CHAIRMAN-APPROVED architecture plan claiming alignment to it (including on \`ARCH-ALTIFYAI-001\`, the live AltifyAI test-cargo venture under ratification 4730357d -- currently chairman_approved=true, never seen by a human).

**5. Ratification a588adba is a crisp, directly-applicable written policy, not a soft remark (correcting Explore's initial characterization).** Verified live in \`chairman_ratifications\`: full ratification row, quote "You know the vision. I might be able to, with some reasonable skill, review and approve, but the design, no," with an explicit EFFECT clause amending d8b4d5f9 and directly citing 6c263823: "A design is signed off by a seat other than its author against the chairman-approved vision (6c263823), with the chairman keeping override." This directly mandates the SD's approved_by (reviewer != author) requirement -- not an analogical stretch.

**6. \`approved_by\` requires DDL; the rest does not.** \`eva_architecture_plans\` and \`eva_vision_documents\` both already have \`status\` (DB default 'draft'), \`chairman_approved\` (DB default false), and \`chairman_approved_at\` (nullable timestamptz, currently unwritten by EITHER helper -- only 4/211 approved arch plans and 12/213 approved visions carry a timestamp, a real provenance gap under 6c263823). Neither table has \`approved_by\`. Per this SD's own scope text ("New columns or tables are a chairman ceremony: PLAN names the files and stops there"), \`approved_by\` is named as a needed future migration and NOT implemented in this SD; the status/chairman_approved/chairman_approved_at legs ship with zero DDL.

**7. A promotion path is needed, but as a separate gated updater, not inside the upsert.** Measured: there is currently NO code path anywhere that promotes an arch plan draft->active or flips chairman_approved=true via UPDATE (the table's only writes are 3 INSERT/upsert paths). The vision side DOES have this: \`lib/eva/stage-execution-worker.js\`'s \`_autoApproveCloneVision\` (~line 3935/4017) UPDATEs \`chairman_approved: true, chairman_approved_at: <now>\` outside \`upsertVision\`, eligibility-gated. Writing arch plans as draft-only with NO promotion function would itself cause a regression (the ADR-attachment consumer and the planning-completeness gate would silently degrade forever) -- PLAN must design the analogous promotion updater for architecture plans, using only existing columns (no DDL). Note: \`eva_architecture_plans\` has an UPDATE-only quality trigger (\`trg_enforce_archplan_quality_advancement\`, requiring \`quality_checked=true\`) that any promotion path will need to satisfy -- unlike \`eva_vision_documents\`, which additionally has an INSERT-leg trigger this table lacks (38 live arch plans are chairman_approved=true with quality_checked=false, an independent gap this SD does not need to close but PLAN should be aware exists).

**Out of scope, flagged for separate tickets (not absorbed into this SD)**: \`cascade-watcher.mjs:146\`'s phantom \`metadata\` column reference (dead-by-construction manual-override guard); \`lib/eva/feedback-dimension-classifier.js:72\`'s phantom \`key\` column reference; the missing INSERT-leg quality trigger on \`eva_architecture_plans\`.

Full evidence in \`sub_agent_execution_results\` for this SD, phase LEAD.`;

const newDescription = sd.description + addendum;

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ description: newDescription })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key')
  .single();

if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }
console.log('LEAD-phase correction applied:', JSON.stringify(data, null, 2));
