#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-CREWAI-ARCHITECTURE-001';
const PRD_ID = 'PRD-CREWAI-ARCHITECTURE-001';

console.log('🎯 Generating User Stories from PRD');
console.log('═══════════════════════════════════════════════════\n');
console.log('SD ID:', SD_ID);
console.log('PRD ID:', PRD_ID);
console.log('');

const result = await autoTriggerStories(supabase, SD_ID, PRD_ID, {
  skipIfExists: false,  // Force generation even if stories exist
  notifyOnSkip: true,
  logExecution: true
});

if (result.skipped) {
  console.log('\n⏭️  User story generation skipped');
  console.log('Reason:', result.reason);
  console.log('Existing stories:', result.existing_stories);
} else if (result.executed) {
  console.log('\n✅ User story generation complete');
  console.log('Generated:', result.generated_count, 'user stories');
  console.log('Duration:', result.duration_seconds, 'seconds');
} else {
  console.error('\n❌ User story generation failed');
  console.error('Error:', result.error);
  process.exit(1);
}
