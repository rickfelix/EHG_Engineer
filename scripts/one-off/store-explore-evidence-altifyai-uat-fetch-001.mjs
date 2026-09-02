import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  const results = {
    verdict: 'PASS',
    confidence_score: 90,
    summary: 'Explore pass confirmed: no existing IMAP/email-fetch utility, no VENTURE_UAT_GMAIL_* refs, no Clerk test-mode client-side bypass anywhere in EHG_Engineer or sibling ../altifyai. The exact wiring site (lib/apa/venture-step-executors.js fallbackExecutor, lines 109-166) was located precisely: the password-submit click at line 163 is immediately followed by an unconditional throw at line 165 with no post-submit state check and no ctx.authenticated assignment anywhere in the codebase.',
    detailed_analysis: {
      files_read: [
        'lib/apa/venture-step-executors.js',
        'lib/apa/browser-executor.js',
        'lib/apa/journey-walk-orchestrator.js',
        'applications/registry.json',
        '.artifacts/chairman-keystrokes-altifyai-test-account.md',
        'lib/eva/synthetic-actor-constants.js',
        'lib/eva/synthetic-actor-guard.js'
      ],
      key_findings: [
        'No IMAP/email-fetching utility (imap, imapflow, node-imap, mailparser) exists in EHG_Engineer or ../altifyai',
        'No VENTURE_UAT_GMAIL_USER / VENTURE_UAT_GMAIL_APP_PASSWORD references exist anywhere in either repo prior to this SD',
        'Sibling repo confirmed at C:/Users/rickf/Projects/_EHG/altifyai (applications/registry.json:134-142, local_path=../altifyai)',
        'The only existing 2FA-adjacent mechanism is altifyai deploy.yml post-deploy-signed-in-uat -- a pre-minted Clerk session token as a curl Bearer header, never touching the sign-in form, password field, or any 2FA/email-code challenge',
        'Wiring site: lib/apa/venture-step-executors.js fallbackExecutor, lines 109-166. Line 163 clicks Continue after filling credentials; line 165 throws unconditionally on the very next statement with no wait for post-submit navigation/state and no ctx.authenticated=true assignment anywhere in the repo (confirmed by repo-wide grep)',
        'ALTIFYAI registers stepOverrides:{} (venture-step-executors.js:265) so fallbackExecutor genuinely runs for every altifyai step -- correct wiring target confirmed'
      ]
    },
    metadata: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      executed_from_cwd: process.cwd()
    }
  };

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, results, { source: 'manual', phase: 'LEAD' });
  console.log('OK stored Explore evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
