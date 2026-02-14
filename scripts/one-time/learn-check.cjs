require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: patterns } = await supabase
    .from('issue_patterns')
    .select('id, pattern_name, category, severity, occurrences, composite_score')
    .is('assigned_sd_id', null)
    .eq('status', 'active')
    .gte('composite_score', 50)
    .order('composite_score', { ascending: false })
    .limit(5);

  const { data: improvements } = await supabase
    .from('protocol_improvement_queue')
    .select('id, title, category, priority, status')
    .eq('status', 'PENDING')
    .limit(5);

  console.log('Patterns (score >= 50):', (patterns && patterns.length) || 0);
  if (patterns && patterns.length) {
    patterns.forEach(function(p) {
      console.log('  -', p.pattern_name, 'score:', p.composite_score);
    });
  }
  console.log('Pending improvements:', (improvements && improvements.length) || 0);
  if (improvements && improvements.length) {
    improvements.forEach(function(i) {
      console.log('  -', i.title);
    });
  }

  if ((!patterns || patterns.length === 0) && (!improvements || improvements.length === 0)) {
    console.log('AUTO-PROCEED: No high-value learning items to act on');
  } else {
    console.log('AUTO-PROCEED: Learning items noted for future review');
  }
}

run();
