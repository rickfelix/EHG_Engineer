/**
 * One-time script: Add Sub-Agent Invocation Quality Standard section
 * to leo_protocol_sections database table.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Client } = require('pg');
const url = process.env.SUPABASE_POOLER_URL;
const u = new URL(url);

const client = new Client({
  host: u.hostname,
  port: parseInt(u.port),
  database: u.pathname.slice(1),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  ssl: { rejectUnauthorized: false }
});

const PROTOCOL_ID = 'leo-v4-3-3-ui-parity';
const SECTION_TYPE = 'sub_agent_prompt_quality';
const TITLE = 'Sub-Agent Invocation Quality Standard';

const CONTENT = `## Sub-Agent Invocation Quality Standard

**CRITICAL**: The prompt you write when spawning a sub-agent is the highest-leverage point in the entire agent chain. Everything downstream — team composition, investigation direction, finding quality — inherits from it.

### Required Elements (The Five-Point Brief)

When invoking ANY sub-agent via the Task tool, your prompt MUST include:

| Element | What to Include | Example |
|---------|----------------|---------|
| **Symptom** | What is actually happening (observable behavior) | "The /users endpoint returns 504 after 30s" |
| **Location** | Files, endpoints, systems, or DB tables involved | "API route in routes/users.js, query in lib/queries/" |
| **Frequency** | One-time, recurring, pattern, or regression | "Started 2 hours ago, affects every 3rd request" |
| **Prior attempts** | What has already been tried or ruled out | "Restarted server — no improvement. Not a DNS issue." |
| **Impact** | Severity and what is blocked downstream | "Blocking all user signups, P0 severity" |

### What to EXCLUDE from Sub-Agent Prompts

| Exclude | Why |
|---------|-----|
| **Your hypothesis about the cause** | Biases the investigation — let the agent form its own hypothesis |
| **Large log/code dumps** | The agent has Read and Bash tools — point to files instead |
| **Unrelated context** | Every extra token is a token not spent on investigation |
| **Vague descriptions** | "Look into this error" gives the agent nothing to anchor on |

### Quality Examples

**GOOD prompt** (RCA agent):
\`\`\`
"Analyze why the /api/users endpoint returns 504 timeout after 30 seconds.
- Location: routes/users.js line 45 calls lib/queries/user-lookup.js
- Frequency: Started 2 hours ago, every 3rd request fails
- Prior attempts: Server restart did not help, DNS resolution is fine
- Impact: All user signups blocked (P0)
Perform 5-whys analysis and identify the root cause."
\`\`\`

**BAD prompt** (same scenario):
\`\`\`
"Investigate this timeout issue. Something is wrong with the users endpoint."
\`\`\`

### Why This Matters

The prompt quality compounds through every level of the agent chain:

\`\`\`
Strong prompt -> Agent understands domain -> Picks RIGHT teammates
  -> Teammates get focused assignments -> Findings are actionable

Weak prompt -> Agent guesses at scope -> Generic team spawned
  -> Broad investigation -> Scattered findings -> "12 possible issues"
\`\`\`

### Enforcement

This standard applies to ALL sub-agent invocations, not just RCA. Whether spawning DATABASE, TESTING, SECURITY, PERFORMANCE, or any other agent — include the Five-Point Brief.

**Exception**: Routine/automated invocations (e.g., DOCMON on phase transitions) that follow a fixed template are exempt.`;

async function main() {
  await client.connect();

  // Check if section already exists
  const check = await client.query(
    `SELECT id FROM leo_protocol_sections WHERE protocol_id = $1 AND section_type = $2`,
    [PROTOCOL_ID, SECTION_TYPE]
  );

  if (check.rows.length > 0) {
    console.log(`Section '${SECTION_TYPE}' already exists (id: ${check.rows[0].id}). Skipping.`);
    await client.end();
    return;
  }

  // Insert new section — order_index 26 places it after mandatory_agent_invocation
  const result = await client.query(
    `INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      PROTOCOL_ID,
      SECTION_TYPE,
      TITLE,
      CONTENT,
      26,
      JSON.stringify({
        added_in: '4.3.3',
        category: 'agent_quality',
        phase: 'CORE'
      })
    ]
  );

  console.log(`Inserted section '${SECTION_TYPE}' with id: ${result.rows[0].id}`);
  console.log('Next steps:');
  console.log('  1. Add section_type to section-file-mapping.json under CLAUDE_CORE.md');
  console.log('  2. Run: node scripts/generate-claude-md-from-db.js');

  await client.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  client.end();
  process.exit(1);
});
