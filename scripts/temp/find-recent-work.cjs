require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findRecentWork() {
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  console.log('Looking for SDs with handoffs in the last 5 days...');
  console.log('Since:', fiveDaysAgo.toISOString().split('T')[0]);

  // Query handoffs from the last 5 days
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('sd_id, from_phase, to_phase, status, created_at')
    .gte('created_at', fiveDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error querying handoffs:', error.message);
    return;
  }

  // Get unique SD IDs
  const sdIds = [...new Set(handoffs.map(h => h.sd_id))];
  console.log('\nFound', sdIds.length, 'unique SDs with recent handoffs');

  if (sdIds.length === 0) {
    console.log('No handoffs in the last 5 days.');
    return;
  }

  // Get SD details
  const { data: sds, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, status, created_at')
    .in('id', sdIds);

  if (sdError) {
    console.error('Error querying SDs:', sdError.message);
    return;
  }

  console.log('\n' + '='.repeat(70));
  console.log('SDs ACTUALLY WORKED ON (last 5 days) - Based on handoffs');
  console.log('='.repeat(70));

  // Map SD details
  const sdMap = {};
  sds.forEach(sd => { sdMap[sd.id] = sd; });

  // Group handoffs by SD
  const bySD = {};
  handoffs.forEach(h => {
    if (!bySD[h.sd_id]) bySD[h.sd_id] = [];
    bySD[h.sd_id].push(h);
  });

  // Documentation requirements
  const docRequirements = {
    'feature': { required: true, docs: ['User guide', 'Feature docs'] },
    'api': { required: true, docs: ['API spec', 'Endpoint docs'] },
    'database': { required: true, docs: ['Schema docs', 'Migration notes'] },
    'infrastructure': { required: true, docs: ['Runbook', 'Ops docs'] },
    'security': { required: true, docs: ['Security docs'] },
    'enhancement': { required: true, docs: ['Feature update docs'] },
    'fix': { required: false, docs: ['Changelog'] },
    'bugfix': { required: false, docs: ['Changelog'] },
    'documentation': { required: false, docs: ['Self-documenting'] }
  };

  let count = 0;
  const needsDocs = [];
  const minimalDocs = [];

  for (const [sdId, sdHandoffs] of Object.entries(bySD)) {
    const sd = sdMap[sdId];
    if (!sd) continue;

    const type = sd.sd_type || 'unknown';
    const reqs = docRequirements[type] || { required: true, docs: ['Standard docs'] };

    count++;
    console.log('\n' + count + '. ' + sdId);
    console.log('   Title: ' + sd.title);
    console.log('   Type: ' + type + ' | Status: ' + sd.status);
    console.log('   Requires full docs: ' + (reqs.required ? 'YES' : 'No (minimal)'));
    console.log('   Handoffs (' + sdHandoffs.length + '):');
    sdHandoffs.slice(0, 3).forEach(h => {
      console.log('     - ' + h.from_phase + ' -> ' + h.to_phase + ' (' + h.status + ') ' + h.created_at.split('T')[0]);
    });

    if (reqs.required) {
      needsDocs.push({ sd, handoffs: sdHandoffs, reqs });
    } else {
      minimalDocs.push({ sd, handoffs: sdHandoffs, reqs });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('Total SDs worked on: ' + count);
  console.log('Requiring full documentation: ' + needsDocs.length);
  console.log('Minimal docs only: ' + minimalDocs.length);

  // Save for further processing
  const fs = require('fs');
  fs.writeFileSync(
    './scripts/temp/recent-work-audit.json',
    JSON.stringify({ needsDocs, minimalDocs, total: count }, null, 2)
  );
  console.log('\nResults saved to: scripts/temp/recent-work-audit.json');
}

findRecentWork().catch(console.error);
