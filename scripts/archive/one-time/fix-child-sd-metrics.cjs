const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixChildren() {
  const children = [
    'SD-LEO-SELF-IMPROVE-FOUND-001',
    'SD-LEO-SELF-IMPROVE-AIJUDGE-001',
    'SD-LEO-SELF-IMPROVE-RISK-001',
    'SD-LEO-SELF-IMPROVE-AUTO-001',
    'SD-LEO-SELF-IMPROVE-EVIDENCE-001',
    'SD-LEO-SELF-IMPROVE-BLOAT-001'
  ];

  for (const id of children) {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('success_criteria, success_metrics')
      .eq('id', id)
      .single();

    const metrics = data.success_metrics;
    const isMetricsEmpty = !metrics || (Array.isArray(metrics) && metrics.length === 0);

    if (isMetricsEmpty) {
      let criteria = data.success_criteria;
      if (typeof criteria === 'string') {
        criteria = JSON.parse(criteria);
      }

      const successMetrics = criteria && criteria.length > 0
        ? criteria.map(c => ({
            metric: c.criterion,
            target: c.measure,
            actual: null
          }))
        : [{ metric: 'Implementation complete', target: '100%', actual: null }];

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ success_metrics: successMetrics })
        .eq('id', id);

      if (error) {
        console.error('Error fixing', id, ':', error.message);
      } else {
        console.log('Fixed', id, '- added', successMetrics.length, 'metrics');
      }
    } else {
      console.log(id, '- already has metrics');
    }
  }
}

fixChildren();
