#!/usr/bin/env node
/**
 * ANALYZE USER STORIES QUALITY
 * Identifies boilerplate, empty fields, and repeated patterns
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Get user stories with their content
  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('id, story_key, title, user_role, user_want, user_benefit, acceptance_criteria, definition_of_done, story_points, priority, sd_id, status')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('=== USER STORIES QUALITY ANALYSIS ===');
  console.log(`Total stories analyzed: ${stories.length}\n`);

  // Look for patterns
  const rolePatterns = {};
  const wantPatterns = {};
  const benefitPatterns = {};
  const acPatterns = {};
  const dodPatterns = {};
  const titlePatterns = {};

  let emptyCount = { role: 0, want: 0, benefit: 0, ac: 0, dod: 0, title: 0 };
  let genericCount = { role: 0, want: 0, benefit: 0 };

  // Known generic/boilerplate patterns
  const GENERIC_ROLES = ['user', 'developer', 'admin', 'system'];
  const GENERIC_WANTS = [
    'complete this feature',
    'implement this functionality',
    'have this capability',
    'use this feature'
  ];
  const GENERIC_BENEFITS = [
    'improve the system',
    'enhance functionality',
    'better user experience',
    'meet requirements'
  ];

  stories.forEach(s => {
    // Check for empty/null
    if (!s.title || s.title.trim() === '') emptyCount.title++;
    if (!s.user_role || s.user_role.trim() === '') emptyCount.role++;
    if (!s.user_want || s.user_want.trim() === '') emptyCount.want++;
    if (!s.user_benefit || s.user_benefit.trim() === '') emptyCount.benefit++;
    if (!s.acceptance_criteria || s.acceptance_criteria.length === 0) emptyCount.ac++;
    if (!s.definition_of_done || s.definition_of_done.length === 0) emptyCount.dod++;

    // Check for generic patterns
    const role = (s.user_role || '').toLowerCase().trim();
    if (GENERIC_ROLES.some(g => role === g)) genericCount.role++;

    const want = (s.user_want || '').toLowerCase();
    if (GENERIC_WANTS.some(g => want.includes(g))) genericCount.want++;

    const benefit = (s.user_benefit || '').toLowerCase();
    if (GENERIC_BENEFITS.some(g => benefit.includes(g))) genericCount.benefit++;

    // Count patterns for frequency analysis
    if (role) rolePatterns[role] = (rolePatterns[role] || 0) + 1;

    const titleNorm = (s.title || '').toLowerCase().substring(0, 50);
    if (titleNorm) titlePatterns[titleNorm] = (titlePatterns[titleNorm] || 0) + 1;

    const wantNorm = (s.user_want || '').toLowerCase().substring(0, 80);
    if (wantNorm) wantPatterns[wantNorm] = (wantPatterns[wantNorm] || 0) + 1;

    const benefitNorm = (s.user_benefit || '').toLowerCase().substring(0, 80);
    if (benefitNorm) benefitPatterns[benefitNorm] = (benefitPatterns[benefitNorm] || 0) + 1;

    // Check acceptance criteria
    if (s.acceptance_criteria && Array.isArray(s.acceptance_criteria)) {
      s.acceptance_criteria.forEach(ac => {
        const acText = typeof ac === 'string' ? ac : (ac.criterion || ac.text || ac.description || JSON.stringify(ac));
        const acNorm = acText.toLowerCase().substring(0, 60);
        acPatterns[acNorm] = (acPatterns[acNorm] || 0) + 1;
      });
    }

    // Check definition of done
    if (s.definition_of_done && Array.isArray(s.definition_of_done)) {
      s.definition_of_done.forEach(d => {
        const dodText = typeof d === 'string' ? d : (d.item || d.text || JSON.stringify(d));
        const dodNorm = dodText.toLowerCase().substring(0, 60);
        dodPatterns[dodNorm] = (dodPatterns[dodNorm] || 0) + 1;
      });
    }
  });

  // Calculate quality score
  const totalFields = stories.length * 5; // title, role, want, benefit, AC
  const emptyFields = emptyCount.title + emptyCount.role + emptyCount.want + emptyCount.benefit + emptyCount.ac;
  const genericFields = genericCount.role + genericCount.want + genericCount.benefit;
  const qualityScore = Math.round(((totalFields - emptyFields - genericFields) / totalFields) * 100);

  console.log('=== QUALITY SUMMARY ===');
  console.log(`Overall quality score: ${qualityScore}%`);
  console.log(`Empty fields: ${emptyFields} (${Math.round(emptyFields/totalFields*100)}%)`);
  console.log(`Generic/boilerplate: ${genericFields} (${Math.round(genericFields/totalFields*100)}%)`);

  console.log('\n=== EMPTY/NULL FIELDS ===');
  console.log(`Empty title: ${emptyCount.title} / ${stories.length} (${Math.round(emptyCount.title/stories.length*100)}%)`);
  console.log(`Empty user_role: ${emptyCount.role} / ${stories.length} (${Math.round(emptyCount.role/stories.length*100)}%)`);
  console.log(`Empty user_want: ${emptyCount.want} / ${stories.length} (${Math.round(emptyCount.want/stories.length*100)}%)`);
  console.log(`Empty user_benefit: ${emptyCount.benefit} / ${stories.length} (${Math.round(emptyCount.benefit/stories.length*100)}%)`);
  console.log(`Empty acceptance_criteria: ${emptyCount.ac} / ${stories.length} (${Math.round(emptyCount.ac/stories.length*100)}%)`);
  console.log(`Empty definition_of_done: ${emptyCount.dod} / ${stories.length} (${Math.round(emptyCount.dod/stories.length*100)}%)`);

  console.log('\n=== GENERIC/BOILERPLATE COUNTS ===');
  console.log(`Generic user_role (user/developer/admin): ${genericCount.role} / ${stories.length}`);
  console.log(`Generic user_want: ${genericCount.want} / ${stories.length}`);
  console.log(`Generic user_benefit: ${genericCount.benefit} / ${stories.length}`);

  console.log('\n=== USER ROLES (top 10) ===');
  Object.entries(rolePatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([role, count]) => {
      const pct = Math.round(count/stories.length*100);
      console.log(`(${count}x, ${pct}%) "${role}"`);
    });

  console.log('\n=== REPEATED TITLES (3+) ===');
  const repeatedTitles = Object.entries(titlePatterns)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);
  if (repeatedTitles.length === 0) {
    console.log('No repeated titles found (good!)');
  } else {
    repeatedTitles.slice(0, 10).forEach(([title, count]) => {
      console.log(`(${count}x) "${title}..."`);
    });
  }

  console.log('\n=== REPEATED USER_WANT (3+) ===');
  const repeatedWants = Object.entries(wantPatterns)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);
  if (repeatedWants.length === 0) {
    console.log('No repeated user_wants found (good!)');
  } else {
    repeatedWants.slice(0, 15).forEach(([want, count]) => {
      console.log(`(${count}x) "${want.substring(0, 70)}..."`);
    });
  }

  console.log('\n=== REPEATED ACCEPTANCE CRITERIA (5+) ===');
  const repeatedAC = Object.entries(acPatterns)
    .filter(([_, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1]);
  if (repeatedAC.length === 0) {
    console.log('No heavily repeated AC found (good!)');
  } else {
    repeatedAC.slice(0, 20).forEach(([ac, count]) => {
      console.log(`(${count}x) "${ac}..."`);
    });
  }

  console.log('\n=== REPEATED DEFINITION OF DONE (5+) ===');
  const repeatedDoD = Object.entries(dodPatterns)
    .filter(([_, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1]);
  if (repeatedDoD.length === 0) {
    console.log('No heavily repeated DoD found (good!)');
  } else {
    repeatedDoD.slice(0, 15).forEach(([dod, count]) => {
      console.log(`(${count}x) "${dod}..."`);
    });
  }

  // Show some example low-quality stories
  console.log('\n=== SAMPLE LOW-QUALITY STORIES ===');
  const lowQuality = stories.filter(s =>
    (!s.user_want || s.user_want.length < 20) ||
    (!s.user_benefit || s.user_benefit.length < 20) ||
    (!s.acceptance_criteria || s.acceptance_criteria.length < 2)
  ).slice(0, 5);

  lowQuality.forEach((s, i) => {
    console.log(`\n${i+1}. ${s.story_key || s.id}`);
    console.log(`   Title: ${s.title || '(empty)'}`);
    console.log(`   Role: ${s.user_role || '(empty)'}`);
    console.log(`   Want: ${(s.user_want || '(empty)').substring(0, 60)}`);
    console.log(`   Benefit: ${(s.user_benefit || '(empty)').substring(0, 60)}`);
    console.log(`   AC count: ${s.acceptance_criteria?.length || 0}`);
  });
}

main().catch(console.error);
