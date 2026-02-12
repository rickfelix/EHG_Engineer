import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, title, description, sd_type, priority, parent_sd_id, success_criteria, success_metrics, strategic_objectives')
    .like('sd_key', 'SD-EVA-%')
    .order('sd_key');

  const newSDs = data.filter(s => /SD-EVA-(ORCH|FEAT)/.test(s.sd_key));

  console.log(`\n${'='.repeat(80)}`);
  console.log(`  QUALITY REVIEW: ${newSDs.length} EVA Strategic Directives`);
  console.log(`${'='.repeat(80)}\n`);

  // Quality criteria
  const qualityIssues = [];

  newSDs.forEach(s => {
    const desc = s.description || '';
    const title = s.title || '';

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`SD: ${s.sd_key}`);
    console.log(`Title: ${title}`);
    console.log(`Type: ${s.sd_type} | Priority: ${s.priority} | Parent: ${s.parent_sd_id || 'none'}`);
    console.log(`Description (${desc.length} chars):`);
    console.log(`  ${desc}`);
    console.log(`Success Criteria (${(s.success_criteria || []).length}):`);
    (s.success_criteria || []).forEach(c => console.log(`  - ${typeof c === 'string' ? c : JSON.stringify(c)}`));
    console.log(`Success Metrics (${(s.success_metrics || []).length}):`);
    (s.success_metrics || []).forEach(m => console.log(`  - ${typeof m === 'string' ? m : JSON.stringify(m)}`));
    console.log(`Strategic Objectives (${(s.strategic_objectives || []).length}):`);
    (s.strategic_objectives || []).forEach(o => console.log(`  - ${typeof o === 'string' ? o : JSON.stringify(o)}`));

    // Quality checks
    const issues = [];
    if (desc.length < 100) issues.push('Description too short (<100 chars before refs)');
    if (!title || title.length < 10) issues.push('Title missing or too short');
    if ((s.success_criteria || []).length === 0) issues.push('No success criteria');
    if ((s.success_metrics || []).length === 0) issues.push('No success metrics');

    // Check for generic/placeholder content
    if (desc.includes('TBD') || desc.includes('TODO')) issues.push('Contains TBD/TODO placeholder');
    if (title.includes('TBD') || title.includes('TODO')) issues.push('Title contains TBD/TODO');

    // Check if description has actionable specifics
    const hasSpecifics = desc.includes('table') || desc.includes('function') || desc.includes('command') ||
      desc.includes('API') || desc.includes('Stage') || desc.includes('CLI') ||
      desc.includes('schema') || desc.includes('component') || desc.includes('service');
    if (!hasSpecifics) issues.push('Description may lack technical specifics');

    if (issues.length > 0) {
      qualityIssues.push({ sd_key: s.sd_key, issues });
      console.log(`  ** QUALITY ISSUES: ${issues.join(', ')}`);
    }
  });

  console.log(`\n${'='.repeat(80)}`);
  console.log('  QUALITY SUMMARY');
  console.log(`${'='.repeat(80)}`);
  console.log(`Total SDs: ${newSDs.length}`);
  console.log(`SDs with quality issues: ${qualityIssues.length}`);
  if (qualityIssues.length > 0) {
    qualityIssues.forEach(q => {
      console.log(`  ${q.sd_key}: ${q.issues.join(', ')}`);
    });
  } else {
    console.log('  All SDs pass quality checks');
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) main().catch(console.error);
