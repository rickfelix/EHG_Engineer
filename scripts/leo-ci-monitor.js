#!/usr/bin/env node

/**
 * LEO CI/CD Monitor
 * Monitors GitHub Actions after push and reports status
 * For use by EXEC agents after pushing code
 */

import { execSync  } from 'child_process';

async function monitorCI(options = {}) {
  const {
    branch = getCurrentBranch(),
    maxWaitTime = 300000, // 5 minutes max
    checkInterval = 10000, // Check every 10 seconds
    autoFix = false
  } = options;

  console.log(`
╔════════════════════════════════════════════════╗
║            LEO CI/CD Monitor v1.0              ║
╚════════════════════════════════════════════════╝
`);

  console.log(`📍 Branch: ${branch}`);
  console.log(`⏰ Max wait: ${maxWaitTime / 1000}s`);
  console.log(`🔄 Check interval: ${checkInterval / 1000}s\n`);

  // Check if gh CLI is available
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    console.error('❌ GitHub CLI (gh) not found. Please install: https://cli.github.com/');
    process.exit(1);
  }

  // Wait for CI to start
  console.log('⏳ Waiting for CI to start...');
  await sleep(5000);

  const startTime = Date.now();
  let lastStatus = null;
  let attempts = 0;

  while (Date.now() - startTime < maxWaitTime) {
    attempts++;
    
    try {
      // Get latest workflow run
      const runInfo = execSync(
        `gh run list --branch "${branch}" --limit 1 --json status,conclusion,name,headSha`,
        { encoding: 'utf8' }
      );
      
      const run = JSON.parse(runInfo)[0];
      
      if (!run) {
        console.log(`⏳ [${attempts}] No CI runs found yet...`);
        await sleep(checkInterval);
        continue;
      }

      const status = run.status;
      const conclusion = run.conclusion || 'pending';
      
      if (status !== lastStatus) {
        console.log('\n📊 CI Status Change:');
        console.log(`   Workflow: ${run.name}`);
        console.log(`   Status: ${getStatusEmoji(status)} ${status}`);
        console.log(`   SHA: ${run.headSha.substring(0, 7)}`);
        lastStatus = status;
      }

      // Check if completed
      if (status === 'completed') {
        console.log('\n✨ CI Completed!');
        console.log(`   Result: ${getConclusionEmoji(conclusion)} ${conclusion}`);
        
        if (conclusion === 'success') {
          console.log('\n✅ CI passed successfully!');
          
          // Report for LEO Protocol
          console.log('\n📋 LEO Protocol Evidence:');
          console.log('```');
          console.log(JSON.stringify({
            type: 'ci_validation',
            branch,
            status: 'passed',
            workflow: run.name,
            sha: run.headSha,
            timestamp: new Date().toISOString()
          }, null, 2));
          console.log('```');
          
          return { success: true, run };
        } else if (conclusion === 'failure') {
          console.log('\n❌ CI failed!');
          
          // Get failure details
          const logs = execSync(
            `gh run view ${run.databaseId} --json jobs`,
            { encoding: 'utf8' }
          );
          
          const jobs = JSON.parse(logs).jobs;
          const failedJobs = jobs.filter(j => j.conclusion === 'failure');
          
          console.log('\n🔍 Failed jobs:');
          failedJobs.forEach(job => {
            console.log(`   - ${job.name}`);
            
            // Get failed steps
            const failedSteps = job.steps.filter(s => s.conclusion === 'failure');
            failedSteps.forEach(step => {
              console.log(`     ❌ ${step.name}`);
            });
          });
          
          if (autoFix) {
            console.log('\n🔧 Attempting auto-fix...');
            // Add auto-fix logic here based on common failures
            // e.g., lint fixes, type errors, etc.
          }
          
          return { success: false, run, failedJobs };
        }
      }
      
      // Still running
      process.stdout.write('.');
      
    } catch (error) {
      console.error(`\n⚠️ Error checking CI: ${error.message}`);
    }
    
    await sleep(checkInterval);
  }
  
  console.log('\n⏰ Timeout reached. CI still running or not started.');
  return { success: false, timeout: true };
}

function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  } catch {
    return 'main';
  }
}

function getStatusEmoji(status) {
  const emojis = {
    'queued': '⏳',
    'in_progress': '🔄',
    'completed': '✅',
    'waiting': '⏸️'
  };
  return emojis[status] || '❓';
}

function getConclusionEmoji(conclusion) {
  const emojis = {
    'success': '✅',
    'failure': '❌',
    'cancelled': '🚫',
    'skipped': '⏭️',
    'neutral': '➖'
  };
  return emojis[conclusion] || '❓';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    
    if (key === 'branch') options.branch = value;
    if (key === 'max-wait') options.maxWaitTime = parseInt(value) * 1000;
    if (key === 'interval') options.checkInterval = parseInt(value) * 1000;
    if (key === 'auto-fix') options.autoFix = true;
  }
  
  monitorCI(options)
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export {  monitorCI  };