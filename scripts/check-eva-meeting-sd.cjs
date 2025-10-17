require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-EVA-MEETING-001')
    .single();

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('📋 SD-EVA-MEETING-001: EVA Meeting Interface\n');
  console.log('Title:', sd.title);
  console.log('Priority:', sd.priority);
  console.log('Status:', sd.status);
  console.log('\n' + '='.repeat(70) + '\n');

  console.log('DESCRIPTION:\n');
  console.log(sd.description);
  console.log('\n' + '='.repeat(70) + '\n');

  console.log('STRATEGIC INTENT:\n');
  console.log(sd.strategic_intent);
  console.log('\n' + '='.repeat(70) + '\n');

  console.log('IMPLEMENTATION GUIDELINES:\n');
  console.log(sd.implementation_guidelines);
  console.log('\n' + '='.repeat(70) + '\n');

  if (sd.scope) {
    console.log('SCOPE:\n');
    console.log('In Scope:', JSON.stringify(sd.scope.in_scope, null, 2));
    console.log('\nOut of Scope:', JSON.stringify(sd.scope.out_of_scope, null, 2));
  }

  console.log('\n' + '='.repeat(70) + '\n');

  // Check for Settings mentions
  const fullText = JSON.stringify(sd).toLowerCase();
  const settingsMentions = fullText.match(/settings/gi) || [];

  console.log('\n🔍 SETTINGS ANALYSIS:');
  console.log('Settings mentions found:', settingsMentions.length);

  if (settingsMentions.length > 0) {
    console.log('✅ Settings is mentioned in the SD');
  } else {
    console.log('❌ Settings panel is NOT mentioned in the SD');
    console.log('💡 Recommendation: Add Settings panel integration to scope');
  }

  process.exit(0);
})();
