#!/usr/bin/env node

/**
 * Audit Recent SD Completions for False Completions
 * Check if SDs marked complete actually have implementation evidence
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

dotenv.config();
const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkGitEvidence(sdId) {
  try {
    // Check both EHG_Engineer and EHG repos for SD-related commits
    const repos = [
      { name: 'EHG_Engineer', path: '/mnt/c/_EHG/EHG_Engineer' },
      { name: 'EHG', path: '/mnt/c/_EHG/ehg' }
    ];

    const evidence = {
      commits: [],
      recentActivity: false
    };

    for (const repo of repos) {
      try {
        // Search for commits mentioning the SD-ID in the last 30 days
        const { stdout } = await execAsync(
          `cd ${repo.path} && git log --oneline --since="30 days ago" --grep="${sdId}" --all`,
          { timeout: 10000 }
        );

        if (stdout.trim()) {
          const commits = stdout.trim().split('\n').map(line => ({
            repo: repo.name,
            commit: line.trim()
          }));
          evidence.commits.push(...commits);
          evidence.recentActivity = true;
        }
      } catch (error) {
        // Repository might not exist or git command failed
        console.log(chalk.gray(`   Could not check ${repo.name}: ${error.message}`));
      }
    }

    return evidence;
  } catch (error) {
    return { commits: [], recentActivity: false, error: error.message };
  }
}

async function auditRecentCompletions() {
  console.log(chalk.blue.bold('=== AUDITING RECENT SD COMPLETIONS FOR FALSE POSITIVES ===\n'));

  try {
    // Get SDs completed in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentCompletions, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('status', 'completed')
      .gte('completion_date', sevenDaysAgo)
      .order('completion_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch recent completions: ${error.message}`);
    }

    console.log(chalk.cyan(`Found ${recentCompletions.length} SDs completed in the last 7 days\n`));

    const suspiciousSDs = [];
    const validSDs = [];

    for (const sd of recentCompletions) {
      console.log(chalk.yellow(`🔍 Checking ${sd.id}: ${sd.title}`));
      console.log(chalk.gray(`   Completed: ${new Date(sd.completion_date).toLocaleString()}`));
      console.log(chalk.gray(`   Approved by: ${sd.metadata?.approved_by || 'Unknown'}`));

      // Check for git evidence
      const evidence = await checkGitEvidence(sd.id);

      if (evidence.commits.length > 0) {
        console.log(chalk.green(`   ✅ Found ${evidence.commits.length} git commits:`));
        evidence.commits.forEach(commit => {
          console.log(chalk.gray(`      ${commit.repo}: ${commit.commit}`));
        });
        validSDs.push(sd);
      } else {
        console.log(chalk.red(`   ❌ No git commits found for ${sd.id}`));

        // Check if approved by orchestrator (suspicious)
        if (sd.metadata?.approved_by?.includes('ORCHESTRATOR')) {
          console.log(chalk.red(`   🚨 SUSPICIOUS: Approved by orchestrator without git evidence`));
          suspiciousSDs.push({
            ...sd,
            reason: 'No git commits + orchestrator approval'
          });
        } else {
          suspiciousSDs.push({
            ...sd,
            reason: 'No git commits found'
          });
        }
      }
      console.log('');
    }

    // Summary
    console.log(chalk.blue.bold('=== AUDIT SUMMARY ==='));
    console.log(chalk.green(`✅ Valid completions: ${validSDs.length}`));
    console.log(chalk.red(`🚨 Suspicious completions: ${suspiciousSDs.length}`));

    if (suspiciousSDs.length > 0) {
      console.log(chalk.red.bold('\n🚨 SUSPICIOUS COMPLETIONS DETECTED:'));
      suspiciousSDs.forEach(sd => {
        console.log(chalk.red(`   ${sd.id}: ${sd.title}`));
        console.log(chalk.gray(`      Reason: ${sd.reason}`));
        console.log(chalk.gray(`      Completed: ${new Date(sd.completion_date).toLocaleString()}`));
      });

      console.log(chalk.yellow.bold('\n⚠️  RECOMMENDED ACTIONS:'));
      console.log('1. Review these SDs for actual implementation');
      console.log('2. Revert status if no real work was done');
      console.log('3. Fix orchestrator before marking any more SDs complete');
    }

    if (validSDs.length > 0) {
      console.log(chalk.green.bold('\n✅ VALID COMPLETIONS:'));
      validSDs.forEach(sd => {
        console.log(chalk.green(`   ${sd.id}: ${sd.title}`));
      });
    }

    return {
      total: recentCompletions.length,
      valid: validSDs.length,
      suspicious: suspiciousSDs.length,
      suspiciousList: suspiciousSDs
    };

  } catch (error) {
    console.error(chalk.red('\n❌ Audit failed:'), error.message);
    throw error;
  }
}

auditRecentCompletions()
  .then(results => {
    console.log(chalk.blue.bold('\n🎉 Audit complete!'));
    if (results.suspicious > 0) {
      console.log(chalk.red(`⚠️  ${results.suspicious} suspicious completions need investigation`));
      process.exit(1); // Exit with error to indicate issues found
    } else {
      console.log(chalk.green('✅ All recent completions appear valid'));
      process.exit(0);
    }
  })
  .catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });