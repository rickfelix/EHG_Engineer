#!/usr/bin/env node
// LEAD-phase enrichment for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-H.
// Corrects the auto-generated boilerplate key_changes/success_criteria against the
// VALIDATION sub-agent's independent investigation (agent aaa524dd06463332e) of the EHG repo.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-H';
const now = new Date().toISOString();

const key_changes = [
  {
    change: "Create src/pages/admin/MichaelBrief.tsx in the EHG repo (Vite+React18+react-router-dom, NOT Next.js), modeled on the near-exact precedent src/pages/admin/ProtocolLint.tsx:19 -- the closest existing analogue (a read-only admin dashboard over an EHG_Engineer-served dataset). Register the route in src/routes/adminRoutes.tsx (lazy import + AdminRoute -> ProtectedRouteWrapper -> Suspense -> AdminLayout wrapper chain, mirroring adminRoutes.tsx:190-203's param-route pattern for both /admin/michael and /admin/michael/:date), and add a nav entry to ADMIN_NAV_ITEMS in src/components/admin/AdminLayout.tsx:70-75.",
    impact: "The chairman gets a real dashboard page rather than the interim Google Doc copy (child E), reachable through the existing admin shell's auth/layout/nav machinery rather than a bespoke standalone page."
  },
  {
    change: "Fetch JSON, not the pre-rendered HTML document. GET /api/michael/brief/latest and /:date (server/routes/michael.js:81,90 in EHG_Engineer) return exactly {data_json, verified, enriched_at, assembled_at} (briefJsonPayload, michael.js:53-55) by default; ?format=html returns rendered_html as a COMPLETE HTML document (<!DOCTYPE html>...</html>, render-brief.js:49-62) which cannot be safely embedded via dangerouslySetInnerHTML (EHG has zero iframe precedent and only one sanitized-innerHTML precedent, TextRenderer.tsx:34, which assumes a fragment not a full document). Add getMichaelBriefLatest()/getMichaelBrief(date) methods + MichaelBriefData types to src/services/adminApi.ts (:352-388, :438-470 pattern), and build React components (FrontPageZone.tsx, EnrichmentZone.tsx, EhgPointerCard.tsx under src/components/admin/michael/) rendering data_json.frontPage {today,gmail,todoist,ehg,claudeCode} as the must-act zone and data_json.enrichment {oracle,watchLater,body,yesterday,signals} as the skippable zone (v1 renders signals only per spec §6) -- schema keys frozen at lib/michael/brief-model.mjs:21-22, schema:2 at :18.",
    impact: "The two-zone layout the spec requires is built from real, typed, already-frozen data rather than parsing/embedding a full HTML document never designed for that use, and gets shadcn/Tailwind theming, accessibility roles, and per-date navigation for free."
  },
  {
    change: "Render data_json.frontPage.ehg.pointer VERBATIM (never client-side re-derived) with handedCount, hiding the card when shown===false -- confirmed by buildEhgBlock returning exactly {shown, pointer:'EHG chairman project (Todoist)', handedCount} at lib/michael/brief-model.mjs:72-77. This is the mechanism satisfying the SD's own 'must not re-summarize the fleet' requirement.",
    impact: "The page structurally cannot drift into re-summarizing what Adam's 6am brief already covers, since the EHG block has no path to compute its own text -- it only displays what the backend already decided to hand off."
  },
  {
    change: "Fix a real, VALIDATION-found auth gap before the page can work at all: EHG_Engineer mounts /api/michael behind requireAuth + requireAdminRole (server/index.js:274) requiring an `Authorization: Bearer <supabase JWT>` header (server/middleware/auth.js:53-67) -- but EHG's existing adminApi.ts apiFetch sends only Content-Type + credentials:'include' (adminApi.ts:69-76), NO bearer header, which would 401 on every call. Route the new Michael API methods through the existing (but currently under-used) src/lib/authedFetch.ts:23-31 helper, which already attaches `Bearer session.access_token` correctly, rather than adminApi.ts's cookie-only apiFetch. Also VALIDATION found a role-SHAPE mismatch: the frontend's AdminRoute.tsx:35 checks user_metadata.role while the backend's requireAdminRole (protocol-lint.js:50 precedent) checks app_metadata.role -- a chairman with only user_metadata.role would render the page then get a 403 from the API. The page must render explicit 401/403/'no brief today'/503-tables-absent states rather than assuming a successful admin-route render guarantees a successful API call.",
    impact: "Without this fix the page would render for an admin user and then silently fail every data fetch -- the single most likely 'looks done, isn't' defect this child could ship. EHG_Engineer's own CORS config already allows the EHG origin with credentials and the Authorization header (server/index.js:116-125), so no EHG_Engineer-side change is needed once the frontend sends the bearer token correctly."
  }
];

const success_criteria = [
  { criterion: "The page exists at /admin/michael and /admin/michael/:date, reachable through the standard admin shell (auth guard, layout, nav)", measure: "src/routes/adminRoutes.tsx registers both routes through the AdminRoute->ProtectedRouteWrapper->Suspense->AdminLayout chain; AdminLayout.tsx's ADMIN_NAV_ITEMS includes a Michael entry" },
  { criterion: "The page renders the two-zone layout from real data_json, not the HTML document", measure: "FrontPageZone/EnrichmentZone components render data_json.frontPage/enrichment fields directly; no dangerouslySetInnerHTML or iframe anywhere in the new code" },
  { criterion: "The EHG block never re-summarizes the fleet", measure: "a unit test asserts the rendered EHG card's text equals data_json.frontPage.ehg.pointer verbatim for a fixture payload, and is absent/hidden when shown===false" },
  { criterion: "API calls carry a valid bearer token and the page handles auth/data-absence failure states explicitly", measure: "the new adminApi/authedFetch-based methods attach Authorization: Bearer <token>; a unit test mocks a 401/403/503 response and asserts the page renders a distinct, honest state for each rather than a blank screen or a false-success render" },
  { criterion: "Code matches this repo's actual conventions, not EHG_Engineer's", measure: "unit tests live under tests/** using Vitest + @testing-library/react + jsdom (vitest.config.ts:8-10,37-38), modeled on tests/unit/protocol-lint-dashboard.test.tsx's vi.mock('@/services/adminApi') pattern; an E2E spec exists under tests/e2e/admin/ modeled on admin-protocol-lint.spec.ts's login->navigate->role-assertion shape" },
  { criterion: "No EHG_Engineer-side change is required to serve this page", measure: "server/index.js:116-125's CORS config already permits the EHG origin with credentials and the Authorization header; confirmed by VALIDATION, no changes made to server/routes/michael.js" }
];

const success_metrics = [
  { metric: "Auth correctness", target: "Zero 401s for a properly authenticated admin user in the page's own test suite; the bearer-token gap VALIDATION found is closed before EXEC is considered done" },
  { metric: "Data fidelity", target: "The rendered front-page/enrichment zones are a direct, un-transformed rendering of data_json's frozen schema-2 shape -- no client-side re-derivation of any field the backend already computed" },
  { metric: "Convention fit", target: "100% of new test files use this repo's actual Vitest+RTL / Playwright conventions, verified against the two named precedent files rather than assumed from EHG_Engineer's own tooling" }
];

const smoke_test_steps = [
  { step_number: 1, instruction: "grep -n \"'/admin/michael'\" src/routes/adminRoutes.tsx", expected_outcome: "Both /admin/michael and /admin/michael/:date routes are registered" },
  { step_number: 2, instruction: "npm run test:unit -- tests/unit/michael-brief-dashboard.test.tsx", expected_outcome: "Passes: renders frontPage/enrichment zones from a fixture data_json, renders the EHG pointer verbatim, renders distinct 401/403/no-brief/503 states" },
  { step_number: 3, instruction: "grep -n 'authedFetch\\|Bearer' src/services/adminApi.ts src/lib/authedFetch.ts", expected_outcome: "The new Michael API methods route through authedFetch (or an equivalent bearer-attaching call), not the cookie-only apiFetch" },
  { step_number: 4, instruction: "grep -rn 'dangerouslySetInnerHTML\\|iframe' src/pages/admin/MichaelBrief.tsx src/components/admin/michael/", expected_outcome: "Prints nothing -- confirms the JSON-render decision was actually followed, not the rejected HTML-embed approach" },
  { step_number: 5, instruction: "npx playwright test tests/e2e/admin/admin-michael-brief.spec.ts", expected_outcome: "Login -> navigate to /admin/michael -> role-based assertions pass, mirroring admin-protocol-lint.spec.ts's shape" }
];

const mechanism_verifications = [
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:src/pages/admin/ProtocolLint.tsx:19' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:src/routes/adminRoutes.tsx:190-203' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:src/components/admin/AdminLayout.tsx:70-75' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:src/services/adminApi.ts:352-388,438-470,69-76' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:src/lib/authedFetch.ts:23-31' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:src/components/auth/AdminRoute.tsx:35' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'server/routes/michael.js:53-55,58-61,64,81,90' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'lib/michael/render-brief.js:49-62' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'lib/michael/brief-model.mjs:18,21-22,72-77' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'server/index.js:116-125,274' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'server/middleware/auth.js:53-67' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'server/routes/protocol-lint.js:50' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:vitest.config.ts:8-10,26-33,37-38' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:playwright.config.ts:13' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:tests/unit/protocol-lint-dashboard.test.tsx:15-32,35-45' },
  { verified_by: 'validation-agent:aaa524dd06463332e', verified_at: 'ehg:tests/e2e/admin/admin-protocol-lint.spec.ts:16-27' },
];

async function main() {
  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) { console.error('READ_FAILED', readErr); process.exit(1); }

  const metadata = {
    ...existing.metadata,
    mechanism_verifications,
    lead_design_notes: {
      corrected_scope_at: now,
      corrected_by: 'LEAD (session 33c321b9), independently investigated via validation-agent:aaa524dd06463332e',
      cross_repo_note: "This SD's code lands in the EHG frontend repo (C:\\Users\\rickf\\Projects\\_EHG\\ehg), worktree at .worktrees/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-H off origin/main -- NOT the EHG_Engineer worktree, which is used only for LEO protocol machinery (handoffs/PRD/gates). target_application column defaulted to 'EHG_Engineer' (target_application_explicit=false); the authoritative field is metadata.target_repos=['EHG'], confirmed by the SD's own description and the dispatching coordinator. Logged as a harness bug (feedback e30acea8).",
      key_finding: "The single highest-risk gap: EHG's adminApi.ts sends no bearer token (cookie-only), which would 401 every call to EHG_Engineer's requireAuth-gated /api/michael routes. Must route through src/lib/authedFetch.ts instead. A secondary role-shape mismatch (frontend user_metadata.role vs backend app_metadata.role) means a rendered admin page can still get a 403 from the API -- the page must handle that explicitly, not assume success."
    }
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ key_changes, success_criteria, success_metrics, smoke_test_steps, metadata })
    .eq('sd_key', SD_KEY);
  if (updateErr) { console.error('UPDATE_FAILED', updateErr); process.exit(1); }
  console.log('SD-H enriched successfully.');
}

main();
