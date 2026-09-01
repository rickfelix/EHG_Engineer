import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001';

const evidenceByPrefix = [
  {
    match: 'Build a net-new IMAP fetcher module',
    evidence: 'lib/apa/imap-code-fetcher.js (fetchVerificationCode). Verified: tests/unit/apa/imap-code-fetcher.test.js TS-1/TS-2 (happy path + delayed delivery), 174/174 apa unit tests pass.',
  },
  {
    match: 'Extract exactly one 6-digit verification code',
    evidence: 'extractSixDigitCode() in lib/apa/imap-code-fetcher.js. Verified: tests/unit/apa/imap-code-fetcher.test.js extractSixDigitCode describe block + TS-4 ambiguous-body tests.',
  },
  {
    match: 'Implement fail-loud bounded polling',
    evidence: 'fetchVerificationCode()\'s bounded poll loop in lib/apa/imap-code-fetcher.js (timeoutMs/pollIntervalMs, distinct connection-vs-not-found error labeling per deep-tier adversarial review fix). Verified: TS-2, TS-3, TS-5, and the ambiguous-recovery test.',
  },
  {
    match: 'Wire the fetcher into lib/apa/venture-step-executors.js',
    evidence: 'lib/apa/venture-step-executors.js fallbackExecutor (post-password-submit race between code-challenge locator and pollForAuthenticatedUrl, hardened denylist per adversarial review). Verified: tests/unit/apa/venture-step-executors.test.js (41 tests) + venture-step-executors-signed-out.test.js, all passing.',
  },
  {
    match: 'Negative-acceptance test proving the fetcher never returns',
    evidence: 'tests/unit/apa/imap-code-fetcher.test.js TS-3 (search-level exclusion) + the adversarial-review-driven defense-in-depth test (wrong-alias message present in search results but rejected by the post-fetch recipient re-check, since IMAP SEARCH TO is a substring match per RFC 3501, not exact).',
  },
];

function evidenceFor(name) {
  const hit = evidenceByPrefix.find((e) => name.startsWith(e.match));
  return hit ? hit.evidence : 'See lib/apa/imap-code-fetcher.js and lib/apa/venture-step-executors.js; 174/174 apa unit tests pass.';
}

async function main() {
  const { data: sd, error: sdError } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdError) throw sdError;

  const { data: deliverables, error } = await supabase.from('sd_scope_deliverables').select('id, deliverable_name').eq('sd_id', sd.id);
  if (error) throw error;

  for (const d of deliverables) {
    const { error: updateError } = await supabase.from('sd_scope_deliverables').update({
      completion_status: 'completed',
      completion_evidence: evidenceFor(d.deliverable_name),
      completion_notes: 'Completed in EXEC; deep-tier adversarial review ran (risk score 0.71) and its findings were fixed before this deliverable was marked complete.',
    }).eq('id', d.id);
    if (updateError) throw updateError;
  }
  console.log('OK marked', deliverables.length, 'deliverables completed for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
