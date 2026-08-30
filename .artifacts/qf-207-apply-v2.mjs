import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// QF-20260829-207 A2 scaffolding, per coordinator ruling 5991d3c1/7c629d92 (2026-08-29T16:13:44Z):
// - thinking_effort is the real, already-wired effort axis (NOT model_tier, which MODEL_TIER_MAP
//   flattens to opus regardless -- explicitly out of scope, see closure note in QF body).
// - tool_policy_profile is 'full' for all 33 agents -- genuinely unimplemented, durable to fix.
// - NO classification list exists; this is authored explicitly, PROPOSED, conservative:
//   only agents whose OWN description confirms no file-write need are tool-restricted, to avoid
//   breaking agents (GITHUB/DOCMON/RETRO/QUICKFIX/MONITORING) whose real jobs need Write/Task
//   despite superficially reading as "mechanical".
const EFFORT_DOWNGRADE_TO_LOW = ['AUDIT', 'CLAIM']; // currently 'medium'; description = pure read/status ops
const TOOL_RESTRICT = {
  AUDIT: ['Bash', 'Read', 'TeamCreate', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'SendMessage'], // drop Task(=Agent-spawn), Write
  CLAIM: ['Bash', 'Read'], // drop Write; no Task present already
};

async function main() {
  const results = [];
  for (const code of EFFORT_DOWNGRADE_TO_LOW) {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .update({ thinking_effort: 'low' })
      .eq('code', code)
      .select('code,thinking_effort');
    results.push({ code, change: 'thinking_effort->low', error: error?.message, data });
  }
  for (const [code, tools] of Object.entries(TOOL_RESTRICT)) {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .update({ allowed_tools: tools })
      .eq('code', code)
      .select('code,allowed_tools');
    results.push({ code, change: 'allowed_tools restricted', error: error?.message, data });
  }
  console.log(JSON.stringify(results, null, 2));
}

main();
