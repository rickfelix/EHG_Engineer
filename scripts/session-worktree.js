#!/usr/bin/env node

/**
 * Session Worktree CLI
 * SD-LEO-INFRA-GIT-WORKTREE-AUTOMATION-001 (FR-1, FR-2, FR-5)
 *
 * Creates isolated git worktrees for concurrent Claude Code sessions.
 *
 * Usage:
 *   npm run session:worktree -- --session <name> --branch <branch>
 *   npm run session:worktree -- --list
 *   npm run session:worktree -- --cleanup --session <name>
 */

import {
  createWorktree,
  symlinkNodeModules,
  removeWorktree,
  listWorktrees,
  getRepoRoot
} from '../lib/worktree-manager.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--session' && argv[i + 1]) {
      args.session = argv[++i];
    } else if (arg === '--branch' && argv[i + 1]) {
      args.branch = argv[++i];
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--list') {
      args.list = true;
    } else if (arg === '--cleanup') {
      args.cleanup = true;
    } else if (arg === '--no-symlink') {
      args.noSymlink = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Session Worktree Manager
========================

Create:
  npm run session:worktree -- --session <name> --branch <branch> [--force] [--no-symlink]

List:
  npm run session:worktree -- --list

Cleanup:
  npm run session:worktree -- --cleanup --session <name>

Options:
  --session <name>   Session name (used as directory name under .sessions/)
  --branch <branch>  Branch to check out in the worktree
  --force            Force recreate if worktree exists with different branch
  --no-symlink       Skip node_modules symlink/junction
  --list             List all active worktree sessions
  --cleanup          Remove a worktree and deregister it
  --help, -h         Show this help

Examples:
  npm run session:worktree -- --session track-a --branch feat/SD-INFRA-001-feature
  npm run session:worktree -- --session track-b --branch feat/SD-FEAT-002-ui-work
  npm run session:worktree -- --list
  npm run session:worktree -- --cleanup --session track-a
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // ── List mode ──
  if (args.list) {
    const sessions = listWorktrees();
    if (sessions.length === 0) {
      console.log('No active worktree sessions found.');
      process.exit(0);
    }

    console.log('\nActive Worktree Sessions:');
    console.log('─'.repeat(70));
    for (const s of sessions) {
      const status = s.exists ? '  active' : '  STALE (directory missing)';
      console.log(`  ${s.session.padEnd(20)} ${s.branch.padEnd(40)} ${status}`);
    }
    console.log('─'.repeat(70));
    console.log(`Total: ${sessions.length} session(s)\n`);
    process.exit(0);
  }

  // ── Cleanup mode ──
  if (args.cleanup) {
    if (!args.session) {
      console.error('Error: --cleanup requires --session <name>');
      process.exit(1);
    }

    try {
      removeWorktree(args.session);
      console.log(`Worktree '${args.session}' removed successfully.`);
    } catch (err) {
      console.error(`Error removing worktree: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // ── Create mode ──
  if (!args.session || !args.branch) {
    console.error('Error: --session and --branch are required for worktree creation.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  try {
    const result = createWorktree({
      session: args.session,
      branch: args.branch,
      force: args.force || false
    });

    if (result.reused) {
      console.log(`\nWorktree '${args.session}' already exists on branch '${result.branch}'.`);
      console.log(`Path: ${result.path}`);
      console.log('\nTo use it:');
      console.log(`  cd ${result.path}`);
      process.exit(0);
    }

    // Symlink node_modules (FR-2)
    if (!args.noSymlink) {
      try {
        symlinkNodeModules(result.path, getRepoRoot());
        console.log('node_modules linked successfully.');
      } catch (err) {
        console.error(`Warning: Could not link node_modules: ${err.message}`);
        console.error('You may need to run npm ci inside the worktree.');
      }
    }

    console.log('\nWorktree created successfully!');
    console.log(`  Path:   ${result.path}`);
    console.log(`  Branch: ${result.branch}`);
    console.log('\nTo start working:');
    console.log(`  cd ${result.path}`);

  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
