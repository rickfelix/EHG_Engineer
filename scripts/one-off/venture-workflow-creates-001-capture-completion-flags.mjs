#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { captureCompletionFlags, formatCompletionFlagsBlock } from '../capture-completion-flags.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001';

const flags = [
  {
    type: 'gap',
    description: 'The organization_qa launch-readiness checklist category ships flag-gated OFF by default (LEO_S24_ORGANIZATION_QA_REQUIRED) rather than unconditionally REQUIRED, per this SD\'s own literal success-criteria text. This was a deliberate LEAD-phase rollout-safety decision mirroring the CAPABILITY_CATEGORIES precedent already shipped in stage-23-launch-readiness.js -- not an oversight -- but it means no in-flight or future venture is actually gated on organization QA/QC until a separate future action explicitly enables the flag.',
  },
  {
    type: 'gap',
    description: 'The new organization_qa_result artifact type is registered in code (ARTIFACT_TYPES, mapped to its producing stage) but the live venture_artifacts_artifact_type_check CHECK constraint has not yet been widened to allow it. A chairman-gated widening migration is staged (database/migrations/20260915_add_organization_qa_result_artifact_type.sql, requires-chairman-apply) with a matching pending-chairman-gate parity exemption -- until approved and applied, any real write attempt is silently caught by the calling function\'s own try/catch and the artifact is never persisted, even though the code path is fully implemented and unit-tested.',
  },
  {
    type: 'deferred',
    description: 'The architectural question "should venture-organization creation become its own formally-numbered stage, or remain a step within existing stages 23-24" is explicitly reserved to Solomon/the chairman per the SD\'s own text (citing the stage-key renumber ceremony precedent) -- this SD deliberately implemented the full functional scope within the existing stages rather than deciding that reserved question itself.',
  },
  {
    type: 'note',
    description: 'No live end-to-end smoke-test run of a mock venture through the actual stage 23/24 pipeline was executed as part of this SD -- coverage is unit-level (mocked Supabase clients) only, proven non-vacuous via mutation testing. The literal smoke_test_steps describing a live pipeline run were not performed; /heal scored this dimension 60/100 accordingly (score persisted, no corrective SD generated on this single occurrence).',
  },
  {
    type: 'note',
    description: 'A real table-discovery detour occurred while grounding the SD\'s scoping decision: chairman_decisions and feedback were searched first for the cited ruling ids (3c20483a, 58f5345f, 2af667eb) and returned nothing -- the correct table is chairman_ratifications. Once found, ratification 58f5345f\'s full quote directly confirmed the "same stage" scoping decision the SD had originally grounded only by inference; a follow-up signal (d5412736) downgraded the original spec-conflict flag (7ab3945a) once this was confirmed.',
  },
];

const reflection = {
  asked: true,
  checklist_items: 5,
  gaps_found: 4,
};

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const results = await captureCompletionFlags({ supabase, sdKey: SD_KEY, flags, reflection });
  console.log(formatCompletionFlagsBlock(results));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
