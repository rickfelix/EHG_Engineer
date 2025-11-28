#!/usr/bin/env node
/**
 * Sync Deliverables from Git (US-007)
 *
 * Part of SD-DELIVERABLES-V2-001 Phase 3 - Real-Time Tracking
 * Parses git commits and matches changed files to deliverables.
 *
 * Features:
 * - Parses commits on SD branch since PLAN→EXEC handoff
 * - Matches file paths to deliverable patterns
 * - Updates completion_status with commit_hash as evidence
 * - Logs file operations to sd_exec_file_operations table
 *
 * Usage:
 *   node scripts/sync-deliverables-from-git.js <SD-ID> [--repo-path /path/to/repo]
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// File pattern to deliverable type mapping
const FILE_TYPE_PATTERNS = {
  database: [
    /\.sql$/,
    /migrations?\//,
    /schema\//,
    /database\//
  ],
  ui_feature: [
    /\.tsx$/,
    /\.jsx$/,
    /components?\//,
    /pages?\//,
    /views?\//
  ],
  api: [
    /api\//,
    /routes?\//,
    /controllers?\//,
    /endpoints?\//
  ],
  test: [
    /\.test\./,
    /\.spec\./,
    /tests?\//,
    /__tests__\//
  ],
  documentation: [
    /\.md$/,
    /docs?\//,
    /README/
  ],
  configuration: [
    /\.config\./,
    /\.env/,
    /package\.json/,
    /tsconfig/
  ]
};

/**
 * Infer deliverable type from file path
 */
function inferTypeFromPath(filePath) {
  for (const [type, patterns] of Object.entries(FILE_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(filePath)) {
        return type;
      }
    }
  }
  return 'other';
}

/**
 * Parse git commits for an SD
 */
function getGitCommits(sdId, repoPath, sinceBranch = 'main') {
  try {
    // Get commits on the SD branch that aren't on main
    const branchName = `feat/${sdId}`;

    // First check if branch exists
    try {
      execSync(`git -C "${repoPath}" rev-parse --verify ${branchName}`, { encoding: 'utf-8', stdio: 'pipe' });
    } catch {
      console.log(`   ℹ️  Branch ${branchName} not found, trying alternate patterns...`);
      // Try to find a branch containing the SD-ID
      const branches = execSync(`git -C "${repoPath}" branch -a`, { encoding: 'utf-8' });
      const matchingBranch = branches.split('\n').find(b => b.includes(sdId));
      if (!matchingBranch) {
        return [];
      }
    }

    // Get commit log with file changes
    const logOutput = execSync(
      `git -C "${repoPath}" log ${sinceBranch}..HEAD --name-status --pretty=format:"%H|%s|%ai" 2>/dev/null || echo ""`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    if (!logOutput.trim()) {
      return [];
    }

    const commits = [];
    let currentCommit = null;

    for (const line of logOutput.split('\n')) {
      if (!line.trim()) continue;

      // Check if this is a commit header line
      if (line.includes('|') && line.length === 40 + line.indexOf('|') - 40 + line.length - line.lastIndexOf('|')) {
        // Parse commit header
        const parts = line.split('|');
        if (parts.length >= 3 && parts[0].length === 40) {
          if (currentCommit) {
            commits.push(currentCommit);
          }
          currentCommit = {
            hash: parts[0],
            message: parts[1],
            date: parts[2],
            files: []
          };
          continue;
        }
      }

      // Parse file change line (A/M/D followed by tab and filename)
      const fileMatch = line.match(/^([AMD])\t(.+)$/);
      if (fileMatch && currentCommit) {
        currentCommit.files.push({
          operation: fileMatch[1] === 'A' ? 'create' : fileMatch[1] === 'M' ? 'modify' : 'delete',
          path: fileMatch[2]
        });
      }
    }

    if (currentCommit) {
      commits.push(currentCommit);
    }

    return commits;
  } catch (error) {
    console.error(`   ❌ Git error: ${error.message}`);
    return [];
  }
}

/**
 * Match file to deliverable using pattern matching
 */
function matchFileToDeliverable(filePath, deliverables) {
  const fileName = path.basename(filePath);
  const fileType = inferTypeFromPath(filePath);

  // Score each deliverable for match quality
  const scores = deliverables.map(d => {
    let score = 0;
    const nameWords = d.deliverable_name.toLowerCase().split(/\s+/);
    const pathWords = filePath.toLowerCase().split(/[\/\\._-]/);

    // Type match (high weight)
    if (d.deliverable_type === fileType) {
      score += 30;
    }

    // Keyword match in path
    for (const word of nameWords) {
      if (word.length > 3 && pathWords.some(pw => pw.includes(word) || word.includes(pw))) {
        score += 20;
      }
    }

    // Filename direct match
    if (nameWords.some(w => fileName.toLowerCase().includes(w))) {
      score += 25;
    }

    return { deliverable: d, score };
  });

  // Get best match above threshold
  const threshold = 40;
  const bestMatch = scores.sort((a, b) => b.score - a.score)[0];

  if (bestMatch && bestMatch.score >= threshold) {
    return {
      deliverable: bestMatch.deliverable,
      confidence: Math.min(100, bestMatch.score)
    };
  }

  return null;
}

/**
 * Sync deliverables from git history
 */
async function syncDeliverables(sdId, options = {}) {
  const { repoPath = '/mnt/c/_EHG/ehg', silent = false } = options;

  if (!silent) {
    console.log('\n📊 Sync Deliverables from Git');
    console.log(`   SD: ${sdId}`);
    console.log(`   Repository: ${repoPath}`);
    console.log('='.repeat(60));
  }

  // Get PLAN→EXEC handoff timestamp to filter commits
  const { data: handoff } = await supabase
    .from('sd_phase_handoffs')
    .select('created_at')
    .eq('sd_id', sdId)
    .eq('handoff_type', 'PLAN-TO-EXEC')
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!handoff) {
    if (!silent) console.log('   ⚠️  No PLAN-TO-EXEC handoff found - using all commits');
  }

  // Get deliverables for this SD
  const { data: deliverables, error: delError } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name, deliverable_type, completion_status')
    .eq('sd_id', sdId)
    .neq('completion_status', 'completed');

  if (delError || !deliverables) {
    if (!silent) console.log(`   ❌ Failed to fetch deliverables: ${delError?.message}`);
    return { success: false, error: delError?.message };
  }

  if (deliverables.length === 0) {
    if (!silent) console.log('   ✅ All deliverables already completed');
    return { success: true, matched: 0, updated: 0 };
  }

  if (!silent) console.log(`   📦 Found ${deliverables.length} pending deliverables`);

  // Parse git commits
  const commits = getGitCommits(sdId, repoPath);

  if (commits.length === 0) {
    if (!silent) console.log('   ℹ️  No commits found on SD branch');
    return { success: true, matched: 0, updated: 0 };
  }

  if (!silent) console.log(`   📝 Found ${commits.length} commits to analyze`);

  // Process each commit
  let matchedFiles = 0;
  let updatedDeliverables = 0;
  const fileOperations = [];
  const deliverableUpdates = new Map(); // Track best match per deliverable

  for (const commit of commits) {
    for (const file of commit.files) {
      const match = matchFileToDeliverable(file.path, deliverables);

      const fileOp = {
        sd_id: sdId,
        operation_type: file.operation,
        file_path: file.path,
        commit_hash: commit.hash,
        commit_message: commit.message,
        deliverable_id: match?.deliverable.id || null,
        matched_by: match ? 'pattern' : 'unmatched',
        match_confidence: match?.confidence || 0
      };

      fileOperations.push(fileOp);

      if (match) {
        matchedFiles++;

        // Track best match for each deliverable
        const existing = deliverableUpdates.get(match.deliverable.id);
        if (!existing || match.confidence > existing.confidence) {
          deliverableUpdates.set(match.deliverable.id, {
            id: match.deliverable.id,
            name: match.deliverable.deliverable_name,
            commitHash: commit.hash,
            commitMessage: commit.message,
            confidence: match.confidence
          });
        }
      }
    }
  }

  // Insert file operations
  if (fileOperations.length > 0) {
    const { error: insertError } = await supabase
      .from('sd_exec_file_operations')
      .insert(fileOperations);

    if (insertError) {
      if (!silent) console.log(`   ⚠️  Failed to log file operations: ${insertError.message}`);
    } else if (!silent) {
      console.log(`   📁 Logged ${fileOperations.length} file operations`);
    }
  }

  // Update matched deliverables
  for (const [deliverableId, update] of deliverableUpdates) {
    const { error: updateError } = await supabase
      .from('sd_scope_deliverables')
      .update({
        completion_status: 'completed',
        verified_by: 'EXEC',
        verified_at: new Date().toISOString(),
        completion_evidence: `Git commit ${update.commitHash.substring(0, 7)}: ${update.commitMessage}`,
        completion_notes: `Auto-matched from git history with ${update.confidence}% confidence`,
        metadata: {
          auto_completed: true,
          matched_by: 'git_sync',
          commit_hash: update.commitHash,
          confidence: update.confidence
        }
      })
      .eq('id', deliverableId);

    if (!updateError) {
      updatedDeliverables++;
      if (!silent) {
        console.log(`   ✅ ${update.name} → commit ${update.commitHash.substring(0, 7)} (${update.confidence}%)`);
      }
    }
  }

  // Summary
  if (!silent) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Sync Summary:');
    console.log(`   Commits analyzed: ${commits.length}`);
    console.log(`   Files matched: ${matchedFiles}`);
    console.log(`   Deliverables updated: ${updatedDeliverables}`);
    console.log(`   Match rate: ${deliverables.length > 0 ? Math.round(updatedDeliverables / deliverables.length * 100) : 0}%`);
  }

  return {
    success: true,
    commits: commits.length,
    matched: matchedFiles,
    updated: updatedDeliverables
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node scripts/sync-deliverables-from-git.js <SD-ID> [options]

Options:
  --repo-path <path>  Path to git repository (default: /mnt/c/_EHG/ehg)
  --help              Show this help message

Example:
  node scripts/sync-deliverables-from-git.js SD-UI-PARITY-001
`);
    process.exit(0);
  }

  const sdId = args[0];
  const repoPathIdx = args.indexOf('--repo-path');
  const repoPath = repoPathIdx !== -1 ? args[repoPathIdx + 1] : '/mnt/c/_EHG/ehg';

  await syncDeliverables(sdId, { repoPath });
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

export { syncDeliverables, matchFileToDeliverable, inferTypeFromPath };
