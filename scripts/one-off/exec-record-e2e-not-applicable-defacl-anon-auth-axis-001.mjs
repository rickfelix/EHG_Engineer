#!/usr/bin/env node
// EXEC-phase E2E-not-applicable justification for SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001.
//
// TESTING sub-agent (EXEC phase, evidence e618d73c-691a-4533-b0e3-8f2011ff6fc8) found that
// CLAUDE_PLAN.md's dual-test requirement ("BOTH unit tests AND E2E tests must pass... REQUIRED
// for PLAN->LEAD approval") carries NO documented infra/security/no-UI carve-out -- the "Testing
// Tier Strategy (Updated)" heading that should have named one is empty (logged as a harness bug,
// feedback row f61c145e-78b9-41ee-9a5e-b61c58c1d519, deferred per product-mode discipline, not
// fixed inline here). This SD is pure database/security (two staged SQL migrations, an extended
// JSON manifest, a catalog-read-only acceptance script) with zero UI/frontend surface -- no route,
// no component, no page. `npm run test:e2e` (Playwright) has nothing to click through. Recording
// this justification explicitly, in the PRD, rather than silently skipping E2E.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('metadata')
  .eq('id', PRD_ID)
  .single();
if (readErr) { console.error('READ ERR:', readErr.message); process.exit(1); }

const justification = {
  applies: false,
  reason:
    'This SD ships zero UI/frontend surface: two staged (chairman-gated, never-inline-applied) SQL migrations, one JSON manifest extension, and a catalog-read-only acceptance script. No route, page, or component is added or changed anywhere in this PR. Playwright E2E (npm run test:e2e) exercises browser/API user flows -- there is no user flow here to exercise. Unit coverage (17/17, tests/unit/audit-rpc-execute-grants-buckets.test.js) plus the acceptance script\'s own --self-test/--baseline/--verify modes are the applicable test tiers for a pure-DB security SD.',
  documented_policy_gap:
    'CLAUDE_PLAN.md\'s "Testing Tier Strategy (Updated)" heading is empty (no infra/security/no-UI exemption text exists anywhere in CLAUDE_PLAN/EXEC/CORE/CLAUDE.md as of this SD) -- this justification is EXEC/TESTING judgment, not a citation of documented policy. Logged as harness bug feedback row f61c145e-78b9-41ee-9a5e-b61c58c1d519 (deferred, product-mode discipline).',
  recorded_by: 'TESTING sub-agent (evidence e618d73c-691a-4533-b0e3-8f2011ff6fc8) + Bravo (worker session 698520e6-7b16-46b5-a207-42548fe6a180)',
  recorded_at_phase: 'EXEC',
};

const { error: updErr } = await supabase
  .from('product_requirements_v2')
  .update({ metadata: { ...(prd.metadata || {}), e2e_not_applicable_justification: justification } })
  .eq('id', PRD_ID);
if (updErr) { console.error('UPDATE ERR:', updErr.message); process.exit(1); }
console.log('E2E-not-applicable justification recorded in PRD metadata.');
