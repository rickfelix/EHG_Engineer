require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log('📝 Updating SD-EVA-MEETING-001 to include Settings panel integration...\n');

  // Get current SD
  const { data: sd, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-EVA-MEETING-001')
    .single();

  if (fetchError) {
    console.error('❌ Error fetching SD:', fetchError);
    return;
  }

  // Add new phase for Settings integration
  const updatedGuidelines = [
    ...sd.implementation_guidelines,
    '',
    'Phase 8: Settings Panel Integration (3-4 hours)',
    '  - Add "EVA Meeting" section to Settings page (/settings)',
    '  - Create EVAMeetingSettings.tsx component',
    '  - Add configuration options:',
    '    * Default dashboard view for screen sharing',
    '    * Video quality preference (480p, 720p, 1080p)',
    '    * Transcript auto-save toggle',
    '    * Meeting auto-start preference',
    '    * Avatar selection (future: multiple avatar options)',
    '    * Voice speed/tone preferences',
    '  - Create user_eva_meeting_preferences table (user_id, settings JSONB)',
    '  - Implement useEVAMeetingSettings() hook (read/write preferences)',
    '  - Connect preferences to EVAMeetingPage component',
    '  - Add Settings icon link from EVAMeetingPage header',
    '  - Test preference persistence across sessions'
  ];

  // Update scope - ensure it's properly initialized
  const updatedScope = {
    in_scope: Array.isArray(sd.scope?.in_scope) ? [...sd.scope.in_scope] : [],
    out_of_scope: Array.isArray(sd.scope?.out_of_scope) ? [...sd.scope.out_of_scope] : []
  };

  // Add Settings integration to in_scope
  const settingsItems = [
    'Settings page integration for EVA Meeting preferences',
    'User preferences table (video quality, transcription, defaults)',
    'EVAMeetingSettings component',
    'Persistent configuration across sessions'
  ];

  settingsItems.forEach(item => {
    if (!updatedScope.in_scope.includes(item)) {
      updatedScope.in_scope.push(item);
    }
  });

  // Update description to mention Settings
  const updatedDescription = sd.description + '\n\nIntegrates with Settings page to allow users to configure meeting preferences including video quality, transcription options, default dashboard views, and voice settings. Preferences persist across sessions via user_eva_meeting_preferences table.';

  // Update the SD
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      implementation_guidelines: updatedGuidelines,
      scope: updatedScope,
      description: updatedDescription
    })
    .eq('id', sd.id);

  if (updateError) {
    console.error('❌ Error updating SD:', updateError);
    return;
  }

  console.log('✅ SD-EVA-MEETING-001 updated successfully!\n');
  console.log('📋 Changes made:');
  console.log('  1. Added Phase 8: Settings Panel Integration (3-4 hours)');
  console.log('  2. Added Settings configuration options:');
  console.log('     - Default dashboard view for screen sharing');
  console.log('     - Video quality preference');
  console.log('     - Transcript auto-save toggle');
  console.log('     - Meeting auto-start preference');
  console.log('     - Voice speed/tone preferences');
  console.log('  3. Added user_eva_meeting_preferences table');
  console.log('  4. Added useEVAMeetingSettings() hook');
  console.log('  5. Updated scope to include Settings integration');
  console.log('  6. Updated description to mention Settings page\n');

  console.log('🎯 Total effort now includes Settings integration (Phase 8: +3-4 hours)');

  process.exit(0);
})();
