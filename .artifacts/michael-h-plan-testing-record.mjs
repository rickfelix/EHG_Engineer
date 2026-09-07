#!/usr/bin/env node
// Records the PLAN-TO-EXEC TESTING strategy-review evidence for child -H and folds the
// review's corrections into metadata.lead_design_notes for EXEC to follow.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-H';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'TESTING', supabase: db });
  const results = {
    verdict: 'WARNING',
    confidence: 82,
    summary: "Test-strategy review of the 8 PRD test_scenarios before EXEC starts, run against the EHG frontend worktree. Coverage is broadly sound (TS-4..TS-7 map cleanly to FR-5's four failure states) but three defects verified and must be fixed before EXEC writes tests: (1) VERIFIED via a live 'npx playwright test --list' run that playwright.config.ts's testIgnore excludes '**/.worktrees/**' (QF-20260818-126) -- a new E2E spec written inside this worktree collects ZERO tests silently; EXEC must run E2E from the main _EHG/ehg checkout post-merge (or override config) and confirm a non-zero collected count as evidence, never a bare exit-0. (2) TS-8's 'separate non-admin session' has no real fixture -- tests/fixtures/auth.ts has only one credential pair; the actual precedent tests admin-vs-anonymous (clearCookies), not admin-vs-non-admin. Rewrite TS-8 to mirror that exactly; leave the 403/non-admin case at unit level (TS-5). (3) FR-5's bearer-header criterion has no dedicated scenario if EXEC mocks the API service module directly -- added TS-9 mocking @/lib/authedFetch specifically (not apiFetch/raw fetch) to assert it is called with a non-html URL. Also corrected FR-4's 'byte-for-byte' claim (untestable via getByText's whitespace normalization) to a getByTestId('ehg-pointer').textContent exact-match with handedCount in a separate element.",
    findings: [
      "VERIFIED (not theoretical): a new E2E spec written inside .worktrees/SD-...-H collects 0 tests due to playwright.config.ts's testIgnore excluding worktree paths (QF-20260818-126) -- confirmed via a live playwright test --list run",
      "TS-8 must be rewritten to admin-vs-anonymous (mirroring the real precedent's clearCookies() pattern), not admin-vs-non-admin -- no second-user fixture exists",
      "Added TS-9: mock @/lib/authedFetch specifically, assert it (not apiFetch or raw fetch) is called with a non-html URL, covering FR-5's bearer-header criterion and FR-2's JSON-only criterion together",
      "The correct mocking seam is tests/unit/hooks/useChairmanDashboardData.authGap.test.ts's pattern: mock the authedFetch MODULE (vi.mock('@/lib/authedFetch', ...)), never supabase directly, since authedFetch calls supabase.auth.getSession() internally; authedFetch returns a raw Response ({ok,status,json}), not adminApi's {data,status} shape -- TS-4..TS-7 must mock accordingly",
      "protocol-lint-dashboard.test.tsx's vi.hoisted mock block and inline Radix/scrollIntoView jsdom polyfills must be copied verbatim if any Radix component is used -- tests/setup.ts does not provide them globally",
      "FR-4's 'byte-for-byte verbatim' claim corrected to a getByTestId exact-match assertion (getByText whitespace-normalizes, which could mask a real bug)",
      "Minor gaps folded into TS-1/TS-2: the /admin/michael/:date param route and EnrichmentZone tolerating unrendered oracle/watchLater/body/yesterday fields"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-h-plan-testing-record.mjs), family pattern established at children E/F/G',
      producer_note: 'Transcribes the independent findings of Task-tool testing-agent a28e5b26fb61dcae2; strategy review only, nothing built yet. Verdict WARNING (not CONDITIONAL_PASS) since this is a strategy-only review with no measured test execution.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'PLAN' });
  console.log('TESTING evidence stored:', stored.id);

  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: existing, error: readErr } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (readErr) { console.error('READ_FAILED', readErr); process.exit(1); }
  const metadata = {
    ...existing.metadata,
    lead_design_notes: {
      ...(existing.metadata.lead_design_notes || {}),
      exec_time_conditions_from_testing_review: {
        recorded_at: new Date().toISOString(),
        recorded_via: 'testing-agent:a28e5b26fb61dcae2 PLAN-TO-EXEC strategy review',
        conditions: [
          "CRITICAL: a new E2E spec written inside .worktrees/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-H collects ZERO tests (playwright.config.ts testIgnore excludes '**/.worktrees/**', QF-20260818-126) -- run E2E from the main _EHG/ehg checkout post-merge (or an explicit config override) and confirm a non-zero collected test count as evidence, never trust a bare exit-0 from inside this worktree",
          "TS-8 rewritten: admin-vs-anonymous (clearCookies), matching the real precedent -- no second-user/non-admin fixture exists in tests/fixtures/auth.ts; the 403 non-admin case stays at unit level (TS-5)",
          "New TS-9: mock @/lib/authedFetch specifically (not apiFetch or raw fetch), assert it is called with a URL that never includes format=html -- covers FR-5's bearer-header criterion and FR-2's JSON-only criterion together",
          "Mock the authedFetch MODULE (vi.mock('@/lib/authedFetch', ...)), never supabase.auth.getSession() directly, for TS-4 through TS-7; authedFetch returns a raw Response ({ok,status,json}), not adminApi's {data,status} shape",
          "Copy protocol-lint-dashboard.test.tsx's vi.hoisted mock block and inline Radix/scrollIntoView polyfills verbatim if any Radix component is used -- tests/setup.ts provides none of this globally",
          "FR-4's EHG-pointer assertion: use getByTestId('ehg-pointer').textContent exact-match, not getByText (which whitespace-normalizes and could mask a real formatting bug); keep handedCount in a separate DOM element so concatenation cannot corrupt the match",
          "Fold the /admin/michael/:date param route and EnrichmentZone's tolerance of unrendered oracle/watchLater/body/yesterday fields into TS-1/TS-2's assertions"
        ]
      }
    }
  };
  const { error: updateErr } = await supabase.from('strategic_directives_v2').update({ metadata }).eq('sd_key', SD_KEY);
  if (updateErr) { console.error('METADATA_UPDATE_FAILED', updateErr); process.exit(1); }
  console.log('metadata.lead_design_notes.exec_time_conditions_from_testing_review recorded.');
}

main();
