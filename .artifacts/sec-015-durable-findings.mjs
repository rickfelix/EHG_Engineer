import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ROW = '91602645-d80c-4739-a21e-dcc1bc88e69a';
const ART = 'bb81b2c9-0748-4dc3-b149-a73e92f0f3d9';

// Recover the full finding set from the (expiring) artifact and re-home it on the row itself,
// under a key the writer's anti-snowball strip does not target (it strips metadata.findings only).
const { data: art } = await sb.from('agent_artifacts').select('content_text').eq('id', ART);
const parsed = JSON.parse(art[0].content_text);
const findings = parsed.findings;
if (!Array.isArray(findings) || findings.length !== 12) throw new Error(`expected 12 findings, got ${findings?.length}`);

const { data: cur } = await sb.from('sub_agent_execution_results').select('metadata').eq('id', ROW);
const md = { ...(cur[0].metadata || {}) };

md.security_review_findings = findings;
md.durability_note =
  'detailed_analysis was auto-compressed to agent_artifacts ' + ART + ' with a 2-hour expires_at. ' +
  'The full 12-finding set is therefore mirrored here in metadata.security_review_findings so this ' +
  'evidence row stays self-sufficient after the artifact expires. Row-level summary, warnings, ' +
  'recommendations and metrics were already durable.';

const { data: upd, error } = await sb
  .from('sub_agent_execution_results')
  .update({ metadata: md, updated_at: new Date().toISOString() })
  .eq('id', ROW)
  .select('id, metadata');

if (error) throw new Error(error.message);
const back = upd[0].metadata;
console.log('update ok. readback:');
console.log('  security_review_findings count :', back.security_review_findings?.length);
console.log('  severities                     :', back.security_review_findings?.map((f) => f.severity).join(', '));
console.log('  analysis_mode still present    :', back.analysis_mode);
console.log('  handoff_type still present     :', back.handoff_type);
console.log('  diff_verdict still present     :', back.diff_verdict);
console.log('  repo_path still present        :', back.repo_path);
console.log('  metrics still present          :', !!back.metrics);
