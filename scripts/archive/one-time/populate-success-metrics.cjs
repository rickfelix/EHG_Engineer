const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function populateSuccessMetrics() {
  console.log('=== Adding success_metrics to SD-VIDEO-VARIANT-001 ===\n');

  const success_metrics = [
    {
      metric: "Video Variant Generation Speed",
      target: "12-20 variants generated in <10 minutes",
      measurement: "Time from prompt submission to all variants ready"
    },
    {
      metric: "Performance Data Completeness",
      target: "100% of variants tracked across 5 platforms",
      measurement: "Number of variants with complete metrics (views, engagement, CTR, conversions, shares) for Instagram, TikTok, YouTube, LinkedIn, X"
    },
    {
      metric: "Winner Identification Confidence",
      target: ">70% statistical confidence in winner selection",
      measurement: "Hypothesis testing p-value and confidence intervals"
    },
    {
      metric: "Component Sizing Compliance",
      target: "100% of components <600 LOC",
      measurement: "Lines of code per component file (enforced in code review)"
    },
    {
      metric: "Test Coverage",
      target: ">=80% code coverage (unit + E2E)",
      measurement: "Jest/Vitest unit test coverage + Playwright E2E test coverage"
    }
  ];

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ success_metrics })
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .select();

  if (error) {
    console.error('Error updating SD:', error.message);
    return;
  }

  console.log('Successfully added success_metrics to SD-VIDEO-VARIANT-001');
  console.log('\nSuccess Metrics Added:');
  success_metrics.forEach((m, i) => {
    console.log((i + 1) + '. ' + m.metric);
    console.log('   Target: ' + m.target);
    console.log('   Measurement: ' + m.measurement);
    console.log('');
  });
  
  console.log('Total: 5 measurable metrics (need >=3)');
  console.log('Should meet 85% threshold now');
}

populateSuccessMetrics();
