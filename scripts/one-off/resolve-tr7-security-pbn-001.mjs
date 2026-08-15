// Resolves TR-7 (RLS posture for pbn_verdict) with the SECURITY sub-agent's definitive
// answer (evidence row 47472599-654a-4b15-89a7-055f02ea3e8e, CONDITIONAL_PASS, confidence 92):
// option (a) -- inherit venture_nursery's existing public/anon SELECT posture, no column-level
// restriction. Two EXEC-blocking conditions (C1: bound verdict content via a comment + test
// assertion; C2: correct the migration's deferred-decision note) are added as explicit
// acceptance criteria so EXEC cannot silently skip them.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-FEAT-PROVEN-BETTER-NEW-001';

const { data: current, error: fetchErr } = await supabase.from('product_requirements_v2')
  .select('technical_requirements, acceptance_criteria, risks').eq('id', PRD_ID).maybeSingle();
if (fetchErr) throw fetchErr;

const technical_requirements = current.technical_requirements.map((tr) => {
  if (tr.id !== 'TR-7') return tr;
  return {
    id: 'TR-7',
    requirement: "RESOLVED by SECURITY sub-agent review (evidence row 47472599-654a-4b15-89a7-055f02ea3e8e, confidence 92): pbn_verdict inherits venture_nursery's existing public/anon SELECT policy -- NO column-level restriction, NO side-table split, NO application-layer redaction. Migration ships as drafted (database/migrations/20260815_venture_nursery_pbn_verdict.sql).",
    rationale: "Consumer-measured (not inferred): a live anon-key REST read of venture_nursery confirmed all 16 rows/17 columns are already anon-readable, and 16/16 of those rows already publish a 'friction point -> differentiated solution' thesis in the (already anon-readable) description column -- the same content class as the BETTER and NEW buckets. pbn_verdict therefore widens no exposure; it structures content already public on that row. The genuinely new content (PROVEN citations) is external market referents, non-sensitive by construction per FR-1. TWO EXEC-BLOCKING CONDITIONS attached: C1 -- bind pbn_verdict content so it never carries chairman identity/attribution, internal SD/PR/session identifiers beyond what source_ref already exposes, or raw unredacted model prompts in rule_trace (one sentence added to the existing COMMENT ON COLUMN pbn_verdict, plus one assertion in the TR-2 shape test) -- the security equivalence this PASS rests on is a property of the WRITER, not the schema, and needs a guard so it doesn't silently stop being true. C2 -- replace migration note (3) in 20260815_venture_nursery_pbn_verdict.sql (which currently defers this as 'a SECURITY decision for PLAN/SECURITY') with the resolved verdict, this evidence row id, harness_backlog id 54b9686a-299e-47ff-ad2a-86031c12cade, and the named rollback (REVOKE SELECT(pbn_verdict) ON public.venture_nursery FROM anon in a follow-up migration if the posture is later judged wrong -- additive, zero data loss). NON-BLOCKING C3: do NOT alter venture_nursery's RLS policies or anon grants in this SD -- the anon-read posture is a platform-wide default (208 anon-readable tables, 931 objects with anon write grants per SECURITY's measurement); fixing it here would address 1 of 208 while implying the other 207 were reviewed. Filed separately: harness_backlog feedback row 54b9686a-299e-47ff-ad2a-86031c12cade.",
  };
});

const acceptance_criteria = [
  ...current.acceptance_criteria,
  "TR-7/C1: pbn_verdict's COMMENT ON COLUMN documents that the column must never carry chairman identity/attribution, internal identifiers beyond source_ref, or raw model-prompt dumps in rule_trace; the TR-2 shape test asserts this bound (not just the verdict-enum CHECK)",
  "TR-7/C2: the shipped migration's note (3) records the RESOLVED security decision (option a, SECURITY evidence row 47472599-654a-4b15-89a7-055f02ea3e8e, harness_backlog 54b9686a-299e-47ff-ad2a-86031c12cade, and the named REVOKE-based rollback) rather than the original deferred 'SECURITY decision pending' language",
];

const risks = current.risks.map((r) => {
  if (!r.risk.includes('anon-readable RLS policy')) return r;
  return {
    ...r,
    mitigation: r.mitigation + " RESOLVED by SECURITY sub-agent review (row 47472599-654a-4b15-89a7-055f02ea3e8e): option (a) confirmed correct via consumer-measured evidence (16/16 anon-visible rows already publish equivalent-sensitivity content in description). Residual LOW risk retained as a tripwire: if the PBN gate's BETTER/NEW output later becomes materially more specific than the description prose it summarizes (e.g. naming a competitor's weakness, pricing, or a launch date), this equivalence breaks and the posture must be revisited -- C1's content-bounding guard is the tripwire, C2's documented rollback is the remedy.",
  };
});

const { data: updated, error: updateErr } = await supabase.from('product_requirements_v2')
  .update({ technical_requirements, acceptance_criteria, risks })
  .eq('id', PRD_ID)
  .select('id, technical_requirements, acceptance_criteria').maybeSingle();
if (updateErr) throw updateErr;
console.log('TR-7 resolved, AC count:', updated.acceptance_criteria.length);
const tr7 = updated.technical_requirements.find((t) => t.id === 'TR-7');
console.log('TR-7 rationale intact (contains C1/C2):', tr7.rationale.includes('C1') && tr7.rationale.includes('C2'));
