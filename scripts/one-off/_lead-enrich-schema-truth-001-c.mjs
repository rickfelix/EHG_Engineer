// LEAD enrichment for SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C: record named verifiers for the spine's
// mechanism claims (GATE_MECHANISM_CLAIM_VERIFIER wants a name + file:line, never a boolean) and
// correct two measured factual errors in the spine.
//
// APPLIES THE THREE ANTI-CLOBBER RULES from the 2026-09-03 collision broadcast:
//   (1) re-read immediately before writing — never build the payload from an earlier census;
//   (2) preserve the prior value into metadata before overwriting;
//   (3) compare what you are about to overwrite against what your census measured — any mismatch
//       means somebody wrote in between, so abort rather than clobber.
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// Rule 3: the census fingerprint taken when this worker read the spine at LEAD.
const EXPECTED_DESC_LEN = Number(process.env.EXPECTED_DESC_LEN || 0);

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, description, metadata')
  .eq('sd_key', 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C')
  .maybeSingle();
if (error || !sd) { console.error('resolve failed:', error?.message || 'not found'); process.exit(1); }

const prior = sd.description || '';
const priorHash = crypto.createHash('sha256').update(prior).digest('hex').slice(0, 16);
console.log('re-read now: description length =', prior.length, 'sha256/16 =', priorHash);

if (EXPECTED_DESC_LEN && prior.length !== EXPECTED_DESC_LEN) {
  console.error(`ABORT (rule 3): description length ${prior.length} != census ${EXPECTED_DESC_LEN} — somebody wrote in between.`);
  process.exit(2);
}
if (prior.includes('LEAD VERIFICATION (Alpha-4')) {
  console.log('already enriched — idempotent no-op, nothing written.');
  process.exit(0);
}

const ADDENDUM = `

LEAD VERIFICATION AND SPINE CORRECTIONS (Alpha-4, session 9cc20227, 2026-09-03). The mechanism claims above are now cited at source rather than endorsed. Default scan mode is diff, not all, verified at scripts/lint/schema-reference-lint.mjs:96 by Alpha-4. Snapshot staleness is a console.warn that is never wired into the exit code, verified at scripts/lint/schema-reference-lint.mjs:132 by Alpha-4. The extractor runs its regexes against raw file text and strips neither comments nor string literals, verified at scripts/lint/schema-reference-extract.mjs:108 by Alpha-4. The allowlist path constant is verified at scripts/lint/schema-reference-lint.mjs:51 by Alpha-4. CI invokes the lint with --diff only at .github/workflows/schema-reference-lint.yml:69 (continue-on-error false at line 48).

CORRECTION 1, ESCAPE PATH: this description twice names database/schema-reference-allowlist.json. THAT FILE DOES NOT EXIST and nothing in the repo references it. The real, code-enforced allowlist is scripts/lint/schema-reference-allowlist.json, currently 12 files entries and 27 tables entries. database/ holds only the snapshot. Criterion 3's before/after count must be taken against the real path, or the does-not-grow assertion is vacuous by construction.

CORRECTION 2, BASELINE FILE COUNT: the count is 4316 files, not 4334. Re-measured 2026-09-03 via schema-reference-lint.mjs --all --json. The violation count 358 and pre_existing 0 are both CONFIRMED correct. The inline pragma baseline is 233 occurrences across 129 files, about 4 of which are the lint's own definition rather than suppressions.

TRAP (a) IS EMPIRICALLY DISPROVEN — do not spend the PR on it. Regenerating the snapshot (872 tables, 192 views, 1551 check constraints) leaves the result identical: 358 violations before and after, and the violation SETS match exactly, with comm empty in both directions. Snapshot staleness contributes ZERO of the 358. Criterion 2 remains worth building as prevention, but it will not move the number.

SCOPE FINDING FOR PLAN: 254 distinct missing objects across 146 files. 205 are column references and every one is on a table that EXISTS (real column drift); 49 are table references. By tree: lib 191, scripts 140, src 10, server 10, api 7. Only 10 of 358 sit in a comment or template literal; those want an extractor precision fix, NOT an allowlist or pragma entry, or they wrongly consume criterion 3's frozen escape budget. The criterion-1-versus-criterion-3 tension was tested and DOES NOT MATERIALIZE: 0 of 358 are genuinely dynamic or cross-schema, because the extractor's FROM_RE matches only quoted string literals (so a runtime-variable table name is structurally invisible) and raw-SQL refs are non-blocking by construction.`;

const next = prior + ADDENDUM;
const meta = { ...(sd.metadata || {}) };
// Rule 2: preserve the prior value before overwriting.
meta.lead_enrichment = {
  ...(meta.lead_enrichment || {}),
  by: 'Alpha-4 (session 9cc20227-3f92-4009-8d90-75bbde54c5b0)',
  at: new Date().toISOString(),
  prior_description: prior,
  prior_description_sha256_16: priorHash,
  prior_description_length: prior.length,
  reason: 'GATE_MECHANISM_CLAIM_VERIFIER named-verifier citations + two measured spine corrections (allowlist path, file count)',
};

const { error: upErr } = await supabase
  .from('strategic_directives_v2')
  .update({ description: next, metadata: meta })
  .eq('id', sd.id)
  .eq('description', prior); // optimistic concurrency: refuses if it changed under us
if (upErr) { console.error('UPDATE FAILED:', upErr.code || '', upErr.message); process.exit(1); }

const { data: after } = await supabase
  .from('strategic_directives_v2').select('description, metadata').eq('id', sd.id).maybeSingle();
const ok = after.description.length === next.length
  && !!after.metadata?.lead_enrichment?.prior_description;
console.log('after: length =', after.description.length, '(was', prior.length + ')');
console.log('prior preserved in metadata.lead_enrichment.prior_description:', !!after.metadata?.lead_enrichment?.prior_description);
console.log(ok ? 'ENRICHMENT OK' : 'VERIFY FAILED — inspect before proceeding');
process.exit(ok ? 0 : 1);
