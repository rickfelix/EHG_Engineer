#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001';
const PRD_ID = 'PRD-SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001';
const SD_ID = 'ca789f6b-2e2f-415a-88c0-d1dab004f0a1';

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Confirm the leaked YouTube OAuth token is dead and purge it from the database',
    user_role: 'Security-conscious operator responding to a live credential exposure',
    user_want: 'To independently confirm, via the OAuth provider\'s own API (not an assumption), that a leaked refresh_token can no longer be used, then remove it from the database entirely -- with a redacted evidence trail proving what was there before deletion, so I never have to trust an unverifiable claim that "it was fixed."',
    user_benefit: 'A leaked long-lived credential stops being a standing risk the moment its provider-side usability is disproven, and the removal is auditable without ever re-exposing the value itself.',
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'A refresh-grant exchange attempt against the leaked token returns invalid_grant',
      'The live database row no longer contains the token in any form',
      'A structure-only (redacted) evidence snapshot exists showing what was removed, without ever storing the raw value',
    ],
    definition_of_done: [],
    depends_on: [],
    blocks: [],
    technical_notes: 'Implemented via oauth2.googleapis.com/revoke + oauth2.googleapis.com/token, and a direct eva_sync_state UPDATE.',
    implementation_context: JSON.stringify({
      technical_approach: 'POST to Google\'s revoke and token endpoints to independently confirm dead; archive redacted evidence to SD metadata; purge the tokens key from the live row.',
      files_to_create: [],
      files_to_modify: ['eva_sync_state row 5ea38ba3 (data, not code)'],
      dependencies: ['GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars'],
      estimated_effort: 'small',
    }),
    test_scenarios: ['TS-1', 'TS-2', 'TS-7'],
    e2e_test_status: 'not_created',
    validation_status: 'validated',
    architecture_references: [],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'completed',
    metadata: {},
  },
  {
    story_key: `${SD_KEY}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Store future YouTube OAuth tokens encrypted at rest, never plaintext',
    user_role: 'Future maintainer of the YouTube connector who re-authenticates the integration',
    user_want: 'The next time I (or the connector\'s re-auth flow) store a fresh OAuth token, I want it automatically encrypted using the app\'s existing, already-proven encryption module, with no extra step for me to remember, and with the old plaintext-storage path unable to accidentally reappear.',
    user_benefit: 'The exposure class that created this incident cannot recur on the next real authentication, without anyone having to remember a manual security step.',
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'storeTokens() never writes a plaintext token-shaped string to the database',
      'Two calls with identical token data produce different ciphertext (proves real per-call randomness, not a fake/reversible encoding)',
      'A row carrying only the legacy plaintext key is never read back as valid credentials',
      'A DB write failure during storeTokens throws rather than silently succeeding',
    ],
    definition_of_done: [],
    depends_on: [],
    blocks: [],
    technical_notes: 'Depends conceptually on US-001 (the leaked token being confirmed dead) being addressed first. lib/integrations/youtube/oauth-manager.js now routes through lib/security/encryption.cjs (AES-256-GCM), the same module lib/operator/cash-sources/token-vault.js already uses.',
    implementation_context: JSON.stringify({
      technical_approach: 'Encrypt tokens via the existing credentialEncryption module before writing to source_metadata.encrypted_tokens; only trust that key on read; throw on DB write failure.',
      files_to_create: ['lib/integrations/youtube/oauth-manager.test.js'],
      files_to_modify: ['lib/integrations/youtube/oauth-manager.js'],
      dependencies: ['lib/security/encryption.cjs'],
      estimated_effort: 'small',
    }),
    test_scenarios: ['TS-1', 'TS-2', 'TS-3', 'TS-4', 'TS-5', 'TS-6'],
    e2e_test_status: 'not_created',
    validation_status: 'validated',
    architecture_references: ['lib/integrations/youtube/oauth-manager.js'],
    example_code_patterns: [],
    testing_scenarios: [],
    given_when_then: [],
    implementation_status: 'completed',
    metadata: {},
  },
];

async function main() {
  const { data, error } = await supabase.from('user_stories').insert(stories).select('id, story_key');
  if (error) throw error;
  console.log('Inserted user stories:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
