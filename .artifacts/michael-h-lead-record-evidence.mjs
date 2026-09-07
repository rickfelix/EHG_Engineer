#!/usr/bin/env node
// Records the VALIDATION and Explore sub-agent evidence for child -H's LEAD-TO-PLAN handoff.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-H';

async function record(code, results) {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: code, supabase: db });
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults(code, SD_KEY, null, results, { phase: 'LEAD' });
  const { data, error } = await db.from('sub_agent_execution_results').select('id,sub_agent_code,phase,verdict,created_at').eq('id', stored.id).maybeSingle();
  if (error || !data) { console.error(`WROTE but readback failed for ${code}:`, error); process.exit(1); }
  console.log(`${code}: id=${data.id} verdict=${data.verdict} phase=${data.phase}`);
}

async function main() {
  await record('VALIDATION', {
    verdict: 'PASS',
    confidence: 92,
    summary: "Independently investigated the EHG frontend repo (validation-agent:aaa524dd06463332e) to determine the real implementation surface for the /admin/michael dashboard page, since the SD's boilerplate key_changes named no real files. Found EHG is Vite+React+react-router-dom (not Next.js); precedent page src/pages/admin/ProtocolLint.tsx and its route/nav registration pattern; the exact GET /api/michael/brief/latest JSON contract from EHG_Engineer (briefJsonPayload: {data_json,verified,enriched_at,assembled_at}); a hard recommendation against embedding the HTML-format response (a complete document, no safe embed path in this repo) in favor of JSON-rendering data_json's frozen frontPage/enrichment schema; confirmation that the EHG block must render frontPage.ehg.pointer verbatim (buildEhgBlock); and a real, load-bearing auth gap: EHG's adminApi.ts sends no bearer token, which would 401 against EHG_Engineer's requireAuth-gated API, plus a frontend/backend role-shape mismatch (user_metadata.role vs app_metadata.role) that could 403 even a rendered page. Confirmed EHG_Engineer's own CORS config already permits the EHG origin, so no backend-side change is needed. Also confirmed this SD's target_application column was a wrong default (EHG_Engineer) contradicting metadata.target_repos=['EHG'] -- corrected by building in a separate ehg-repo worktree, logged as a harness bug.",
    findings: [
      "Precedent: src/pages/admin/ProtocolLint.tsx + adminRoutes.tsx (~190-203) + AdminLayout.tsx ADMIN_NAV_ITEMS (~70-75) for page/route/nav pattern",
      "Data contract: GET /api/michael/brief/latest and /:date return {data_json,verified,enriched_at,assembled_at} JSON by default; ?format=html returns a full HTML document unsuitable for embedding in this repo",
      "Recommend JSON-render over data_json.frontPage/enrichment (schema:2, brief-model.mjs), never the HTML document",
      "EHG block must render frontPage.ehg.pointer verbatim (buildEhgBlock, brief-model.mjs:72-77) -- the mechanism satisfying 'must not re-summarize the fleet'",
      "Real auth gap: adminApi.ts's apiFetch (cookie-only) would 401 against EHG_Engineer's bearer-token-required API; must route through src/lib/authedFetch.ts instead",
      "Secondary gap: frontend admin-route check (user_metadata.role) and backend requireAdminRole (app_metadata.role) can disagree, producing a rendered-then-403'd page unless handled explicitly",
      "No EHG_Engineer-side change required; CORS already permits the EHG origin with credentials + Authorization header",
      "Test conventions confirmed: Vitest+RTL+jsdom under tests/**, Playwright under tests/e2e/admin/ -- distinct from EHG_Engineer's own tooling"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-h-lead-record-evidence.mjs), family pattern established at children E/F/G',
      producer_note: 'Transcribes the independent findings of Task-tool agent aaa524dd06463332e (validation-agent), investigating the EHG frontend repo directly.'
    }
  });

  await record('Explore', {
    verdict: 'PASS',
    confidence: 90,
    summary: "Follow-up confirmation pass on VALIDATION's findings before LEAD-TO-PLAN. Confirmed all cited files and line ranges exist and behave as claimed: ProtocolLint.tsx precedent, authedFetch.ts's bearer-token attachment, adminApi.ts's cookie-only fetch (no Authorization header anywhere in the file), and the protocol-lint-dashboard.test.tsx test precedent. Found and reported a refinement: src/hooks/useChairmanDashboardData.ts already uses authedFetch to call a bearer-protected cross-app endpoint with explicit 401 handling, consumed by a real chairman dashboard component (BriefingDashboard.tsx) -- a more directly relevant precedent for the auth+dashboard pattern than protocol-lint alone. Folded into the SD's key_changes before LEAD-TO-PLAN.",
    findings: [
      "All VALIDATION file:line citations confirmed accurate on independent re-check",
      "adminApi.ts confirmed to have zero Authorization/Bearer references anywhere in the file (grep-confirmed)",
      "Better precedent found: useChairmanDashboardData.ts:403 (authedFetch + bearer + 401 handling) and BriefingDashboard.tsx -- an existing real dashboard already solving this exact cross-app-auth pattern, cited alongside authedFetch.ts in the corrected key_changes"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-h-lead-record-evidence.mjs)',
      producer_note: 'Explore is a read-only BUILT-IN and cannot write its own row; sanctioned transcription of the Task-tool Explore agent run.'
    }
  });
}

main();
