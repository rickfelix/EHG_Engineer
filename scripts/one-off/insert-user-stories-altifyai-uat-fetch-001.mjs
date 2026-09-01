import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001';
const PRD_ID = `PRD-${SD_KEY}`;

const stories = [
  {
    n: 1,
    title: 'IMAP fetcher connects and extracts the newest matching verification code',
    user_role: 'UAT harness',
    user_want: 'a fetchVerificationCode() function that connects to the fenced Gmail account and returns the newest Clerk verification code addressed to a venture alias',
    user_benefit: 'the journey-walk executor can complete Clerk 2FA login without manual intervention',
    acceptance_criteria: [
      'Connects via TLS on port 993 using VENTURE_UAT_GMAIL_USER/VENTURE_UAT_GMAIL_APP_PASSWORD from process.env only',
      'Filters by exact recipient local-part match against baseLocalPart+aliasLocalPart, not substring',
      'Returns the newest matching message\'s 6-digit code, or null if none found in the search window',
    ],
    implementation_context: {
      affected_files: ['lib/apa/imap-code-fetcher.js', 'tests/unit/apa/imap-code-fetcher.test.js'],
      technical_approach: 'New module using imapflow for connection/search and mailparser for body extraction; exports fetchVerificationCode({aliasLocalPart, sentAfter, timeoutMs, pollIntervalMs})',
      files_to_create: ['lib/apa/imap-code-fetcher.js'],
      files_to_modify: [],
      dependencies: ['imapflow', 'mailparser'],
      estimated_effort: 'medium',
    },
  },
  {
    n: 2,
    title: 'Code extraction is deterministic and rejects ambiguous matches',
    user_role: 'UAT harness',
    user_want: 'the fetcher to extract exactly one 6-digit code per matched message and fail loud on ambiguity',
    user_benefit: 'a wrong code is never silently submitted to Clerk',
    acceptance_criteria: [
      'Regex /\\b\\d{6}\\b/ applied to plain-text body (fallback: stripped HTML) yields exactly one match',
      'Zero or multiple 6-digit matches throws a descriptive error naming the message UID and which condition occurred',
    ],
    implementation_context: {
      affected_files: ['lib/apa/imap-code-fetcher.js', 'tests/unit/apa/imap-code-fetcher.test.js'],
      technical_approach: 'Body extraction helper isolated as a pure function for direct unit testing (ambiguous-match and zero-match cases)',
      files_to_create: [],
      files_to_modify: ['lib/apa/imap-code-fetcher.js'],
      dependencies: [],
      estimated_effort: 'small',
    },
  },
  {
    n: 3,
    title: 'Bounded fail-loud polling for delayed email delivery',
    user_role: 'UAT harness',
    user_want: 'the fetcher to poll for up to a bounded timeout and report mailbox state on failure',
    user_benefit: 'transient email delay does not cause an indefinite hang, and failures are debuggable',
    acceptance_criteria: [
      'On timeout with zero matches, the error includes search criteria (alias, sentAfter) and total INBOX messages seen during the poll window',
      'Polling stops immediately once a match is found, without waiting out the full timeout',
    ],
    implementation_context: {
      affected_files: ['lib/apa/imap-code-fetcher.js', 'tests/unit/apa/imap-code-fetcher.test.js'],
      technical_approach: 'setTimeout-based poll loop with default timeoutMs=45000, pollIntervalMs=3000, both overridable via options for fast unit tests',
      files_to_create: [],
      files_to_modify: ['lib/apa/imap-code-fetcher.js'],
      dependencies: [],
      estimated_effort: 'small',
    },
  },
  {
    n: 4,
    title: 'Wire the fetcher into fallbackExecutor\'s post-submit state check',
    user_role: 'UAT harness',
    user_want: 'fallbackExecutor to wait for a real post-submit signal (2FA challenge or authenticated state) instead of throwing unconditionally',
    user_benefit: 'the Clerk 2FA login leg completes against the real auth path, satisfying the SD acceptance criterion',
    acceptance_criteria: [
      'ctx.authenticated is only set true after a real confirmed signal, never assumed immediately after the password-submit click',
      'When no 2FA challenge appears, behavior is unchanged from today (existing throw for unmapped steps still fires)',
      'The venture alias local-part is read from venture registration config, not hardcoded',
    ],
    implementation_context: {
      affected_files: ['lib/apa/venture-step-executors.js', 'tests/unit/apa/venture-step-executors.test.js'],
      technical_approach: 'Replace the unconditional throw at the former line 165 with a Promise.race between a verification-code-input locator wait and an authenticated-state locator/URL wait, both bounded; invoke imap-code-fetcher.js on the 2FA branch',
      files_to_create: [],
      files_to_modify: ['lib/apa/venture-step-executors.js'],
      dependencies: ['lib/apa/imap-code-fetcher.js'],
      estimated_effort: 'medium',
    },
  },
  {
    n: 5,
    title: 'Negative-acceptance test: fetcher never returns a wrong-alias code (R2-c)',
    user_role: 'Security reviewer',
    user_want: 'an automated fixture proving the fetcher cannot read mail outside its configured alias filter',
    user_benefit: 'R2-c is enforced by a real, re-runnable test rather than a one-time manual check',
    acceptance_criteria: [
      'Fixture message addressed to a different alias (or no alias) is seeded in the mocked mailbox',
      'fetchVerificationCode called with aliasLocalPart=\'altifyai-uat\' returns null/throws not-found, never that fixture message\'s code',
    ],
    implementation_context: {
      affected_files: ['tests/unit/apa/imap-code-fetcher.test.js'],
      technical_approach: 'Mocked imapflow client fixture with a single wrong-alias message; asserts fetchVerificationCode rejects/returns null within a short test timeout',
      files_to_create: ['tests/unit/apa/imap-code-fetcher.test.js'],
      files_to_modify: [],
      dependencies: ['vitest'],
      estimated_effort: 'small',
    },
  },
  {
    n: 6,
    title: 'Credential and code are never logged',
    user_role: 'Security reviewer',
    user_want: 'a grep-based test proving the app password and extracted code never reach any logging call',
    user_benefit: 'the FENCES constraint (never log the credential) is enforced automatically, not by manual review alone',
    acceptance_criteria: [
      'Grepping lib/apa/imap-code-fetcher.js and its call sites in venture-step-executors.js for console.log/logger referencing the password env var or the code variable finds zero matches',
    ],
    implementation_context: {
      affected_files: ['tests/unit/apa/imap-code-fetcher-no-log.test.js'],
      technical_approach: 'A vitest test that reads the source files as text and asserts no logging call references VENTURE_UAT_GMAIL_APP_PASSWORD or the extracted-code variable name',
      files_to_create: ['tests/unit/apa/imap-code-fetcher-no-log.test.js'],
      files_to_modify: [],
      dependencies: [],
      estimated_effort: 'small',
    },
  },
];

async function main() {
  const { data: sd, error: sdError } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdError) throw sdError;

  const rows = stories.map((s) => ({
    story_key: `${SD_KEY}:US-${String(s.n).padStart(3, '0')}`,
    prd_id: PRD_ID,
    sd_id: sd.id,
    title: s.title,
    user_role: s.user_role,
    user_want: s.user_want,
    user_benefit: s.user_benefit,
    priority: s.n <= 4 ? 'high' : 'medium',
    status: 'ready',
    acceptance_criteria: s.acceptance_criteria,
    implementation_context: JSON.stringify(s.implementation_context),
  }));

  const { error } = await supabase.from('user_stories').upsert(rows, { onConflict: 'story_key' });
  if (error) throw error;
  console.log('OK inserted', rows.length, 'user stories for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
