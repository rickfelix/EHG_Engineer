#!/usr/bin/env node

/**
 * Apply User Story Validation Fix Migration
 *
 * Issue: get_progress_breakdown() returns user_stories_validated: false
 *        for documentation SDs with no user stories
 *
 * Expected: user_stories_validated: true when COUNT(*) = 0
 *
 * Migration: database/migrations/20251016_fix_user_story_validation_check.sql
 *
 * This migration was created but never applied to Supabase.
 */

import { readFileSync } from 'fs';

console.log('\n🔧 USER STORY VALIDATION FIX - MIGRATION APPLICATION');
console.log('═'.repeat(70));
console.log('');

console.log('📋 Migration: 20251016_fix_user_story_validation_check.sql');
console.log('');

console.log('🎯 Purpose:');
console.log('   Fix progress calculation for documentation/process SDs');
console.log('   that have no user stories (e.g., SD-PROOF-DRIVEN-1758340937844)');
console.log('');

console.log('🐛 Bug:');
console.log('   PLAN_verification.user_stories_validated returns false');
console.log('   even when COUNT(user_stories) = 0');
console.log('');

console.log('✅ Fix:');
console.log('   Lines 101-111 in get_progress_breakdown():');
console.log('   CASE');
console.log('     WHEN COUNT(*) = 0 THEN true  -- No user stories = validation not required');
console.log('     WHEN COUNT(*) FILTER (...) = COUNT(*) THEN true');
console.log('     ELSE false');
console.log('   END');
console.log('');

console.log('📝 MANUAL APPLICATION REQUIRED:');
console.log('═'.repeat(70));
console.log('');
console.log('⚠️  This migration updates PostgreSQL functions.');
console.log('⚠️  RLS policies block function updates via anon key.');
console.log('⚠️  Must be applied via Supabase Dashboard SQL Editor.');
console.log('');

console.log('STEPS:');
console.log('------');
console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard');
console.log('2. Navigate to: SQL Editor');
console.log('3. Create new query');
console.log('4. Copy migration SQL from:');
console.log('   database/migrations/20251016_fix_user_story_validation_check.sql');
console.log('5. Execute query');
console.log('6. Verify output shows:');
console.log('   ✅ SD-RETRO-ENHANCE-001 now at 100% - bug fixed!');
console.log('');

console.log('VERIFICATION:');
console.log('-------------');
console.log('After applying, test with SD-PROOF-DRIVEN-1758340937844:');
console.log('');
console.log('   SELECT get_progress_breakdown(\'SD-PROOF-DRIVEN-1758340937844\');');
console.log('');
console.log('Expected output:');
console.log('   PLAN_verification.user_stories_validated: true');
console.log('   PLAN_verification.progress: 15');
console.log('   total_progress: 100');
console.log('');

// Read migration file to show content
const migrationPath = 'database/migrations/20251016_fix_user_story_validation_check.sql';
const migrationSQL = readFileSync(migrationPath, 'utf8');

console.log('═'.repeat(70));
console.log('📄 MIGRATION PREVIEW (first 50 lines):');
console.log('═'.repeat(70));
console.log('');

const lines = migrationSQL.split('\n').slice(0, 50);
lines.forEach((line, i) => {
  console.log(`${String(i + 1).padStart(3, ' ')}  ${line}`);
});

console.log('');
console.log('... (see full file for complete migration)');
console.log('');
console.log('═'.repeat(70));
console.log('');
console.log('✅ Ready to apply migration in Supabase Dashboard');
console.log('');
