require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createBacklogItem() {
  console.log('Creating minor UX backlog item for export button integration...\n');

  const backlogItem = {
    sd_id: 'SD-EXPORT-001',
    backlog_id: `BACKLOG-EXPORT-BUTTONS-${Date.now()}`,
    backlog_title: 'Add Export Buttons to Dashboards',
    item_description: 'Connect existing /analytics/exports functionality to dashboard buttons for better discoverability',
    priority: 'Low',
    description_raw: 'Nice to Have',
    completion_status: 'NOT_STARTED',
    phase: 'Launch',
    sequence_no: 1,
    item_type: 'story',
    extras: {
      Description_1: 'Add "Export Report" buttons to ChairmanDashboard, AnalyticsDashboard, Portfolio, and Financial dashboards. Buttons should navigate to /analytics/exports or open export modal. Estimated effort: 1-2 hours (15 lines of code). Export functionality already exists and is fully operational at /analytics/exports.',
      'Page Category_1': 'UX Enhancement',
      Category: 'User Experience',
      Effort: 'Minimal (1-2 hours)',
      Dependencies: 'None - Export page already complete',
      Business_Value: 'Improved feature discoverability',
      User_Story: 'As a user viewing any dashboard, I want quick access to export functionality so I can generate reports without navigating to /analytics/exports manually'
    }
  };

  const { data, error } = await supabase
    .from('sd_backlog_map')
    .insert([backlogItem])
    .select();

  if (error) {
    console.error('Error creating backlog item:', error);
    return;
  }

  console.log('✅ Backlog item created successfully!\n');
  console.log('Details:');
  console.log('- SD: SD-EXPORT-001');
  console.log('- Title:', backlogItem.backlog_title);
  console.log('- Priority: Low (Nice to Have)');
  console.log('- Effort: 1-2 hours');
  console.log('- Status: NOT_STARTED');
  console.log('- Phase: Launch (polish/enhancement)');
  console.log('\nThis item can be picked up as a minor UX improvement in the future.\n');

  return data;
}

createBacklogItem()
  .then(() => {
    console.log('✅ Backlog item creation complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed:', err);
    process.exit(1);
  });
