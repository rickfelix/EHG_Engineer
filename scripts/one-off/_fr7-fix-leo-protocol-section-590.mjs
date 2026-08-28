import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001 / FR-7: id=590's worked examples cited a
// nonexistent `stage_config` table (the live registry table is `venture_stages`,
// per lib/db-content-registry-allowlist.js) and stale stage names for S18/S21
// (real names as of the 2026-08-28 27-stage renumbering: S18='Marketing Copy
// Studio', S21='Distribution Setup' -- 'MVP Development'/'Pre-Launch' were wrong).
const NEW_CONTENT = `# metadata.db_content_assertions Field Guide

When authoring a PRD for an SD that touches a central-registry table, populate
\`strategic_directives_v2.metadata.db_content_assertions\` so the DB_CONTENT_PARITY
gate at /leo complete can verify code-vs-DB content drift.

## Shape

\`\`\`jsonc
{
  "db_content_assertions": [
    {
      "table": "venture_stages",                // must be in REGISTRY_TABLES
      "row_filter": { "stage_number": 20 },     // selects exactly one row
      "expected_columns": {
        "stage_name": "Code Quality Gate",      // literal comparison
        "description": { "regex": "^Code Quality" }  // anchored regex
      }
    }
  ]
}
\`\`\`

## Allowlist (REGISTRY_TABLES)

The list of tables eligible for assertions lives in
\`lib/db-content-registry-allowlist.js\` — currently \`['venture_stages',
'chairman_dashboard_config']\`. Adding a table requires explicit chairman-approved
PR and compounds gate runtime / false-positive surface area.

## Worked examples

### Literal match (preferred)
\`\`\`jsonc
{ "table": "venture_stages", "row_filter": { "stage_number": 18 },
  "expected_columns": { "stage_name": "Marketing Copy Studio" } }
\`\`\`

### Anchored regex (only when literal won't fit)
\`\`\`jsonc
{ "table": "venture_stages", "row_filter": { "stage_number": 21 },
  "expected_columns": { "description": { "regex": "^Configures marketing distribution" } } }
\`\`\`

## Anti-ReDoS guard

- Regex patterns are capped at 500 characters.
- When \`LEO_PARITY_REGEX_REQUIRE_ANCHORS=true\`, unanchored patterns are rejected.
- Prefer literal matches; reach for regex only when the value is dynamic.

## What happens at /leo complete

The gate (\`scripts/modules/handoff/gates/db-content-parity-gate.js\`) runs after
scope-completion and before /learn. On mismatch it fails closed with a remediation
message naming \`table\`, \`row_filter\`, \`expected\`, and \`actual\`. Each run writes one
row to \`sd_verification_results\` (verification_type='DB_CONTENT_PARITY', column
\`result\` not \`status\`). Skip path (no assertions) returns pass:true with no DB reads.`;

const { error } = await supabase
  .from('leo_protocol_sections')
  .update({ content: NEW_CONTENT })
  .eq('id', 590);

if (error) {
  console.error('UPDATE FAILED:', error.message);
  process.exit(1);
}

const { data: verify } = await supabase
  .from('leo_protocol_sections')
  .select('content')
  .eq('id', 590)
  .single();

console.log('Updated. New content includes venture_stages:', verify.content.includes('venture_stages'));
console.log('Old stage_config gone:', !verify.content.includes('stage_config'));
console.log('S18 name corrected:', verify.content.includes('Marketing Copy Studio'));
