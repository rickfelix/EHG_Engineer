#!/usr/bin/env node

/**
 * SD Worktree CLI
 * SD-LEO-INFRA-REFACTOR-WORKTREE-MANAGER-001
 *
 * Creates isolated git worktrees keyed by Strategic Directive (SD).
 *
 * Usage:
 *   npm run session:worktree -- --sd-key <key> --branch <branch>
 *   npm run session:worktree -- --list
 *   npm run session:worktree -- --cleanup --sd-key <key>
 */

import {
  createWorktree,
  symlinkNodeModules,
  cleanupWorktree,
  cleanupStaleWorktrees,
  listWorktrees,
  getRepoRoot
} from '../lib/worktree-manager.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--sd-key' && argv[i + 1]) {
      args.sdKey = argv[++i];
    } else if (arg === '--session' && argv[i + 1]) {
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
    } else if (arg === '--cleanup-stale') {
      args.cleanupStale = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--max-age-hours' && argv[i + 1]) {
      args.maxAgeHours = parseInt(argv[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
SD Worktree Manager
========================

Create:
  npm run session:worktree -- --sd-key <key> --branch <branch> [--force] [--no-symlink]

List:
  npm run session:worktree -- --list

Cleanup:
  npm run session:worktree -- --cleanup --sd-key <key> [--force]

Options:
  --sd-key <key>     SD key (used as directory name under .worktrees/)
  --session <name>   DEPRECATED: Maps to --sd-key session-<name>
  --branch <branch>  Branch to check out in the worktree
  --force            Force recreate if worktree exists with different branch
  --no-symlink       Skip node_modules symlink/junction
  --list             List all active SD worktrees
  --cleanup          Remove a worktree and deregister it from git
  --help, -h         Show this help

Examples:
  npm run session:worktree -- --sd-key SD-INFRA-001 --branch feat/SD-INFRA-001-feature
  npm run session:worktree -- --sd-key SD-FEAT-002 --branch feat/SD-FEAT-002-ui-work
  npm run session:worktree -- --list
  npm run session:worktree -- --cleanup --sd-key SD-INFRA-001
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Warn if --session provided with --sd-key
  if (args.sdKey && args.session) {
    console.warn('[worktree-cli] WARNING: Both --sd-key and --session provided. Using --sd-key, ignoring --session.');
  }

  // ── List mode ──
  if (args.list) {
    const worktrees = listWorktrees();
    if (worktrees.length === 0) {
      console.log('No active SD worktrees found.');
      process.exit(0);
    }

    console.log('\nActive SD Worktrees:');
    console.log('\u2500'.repeat(70));
    for (const wt of worktrees) {
      const status = wt.exists ? '  active' : '  STALE (directory missing)';
      console.log(`  ${wt.sdKey.padEnd(20)} ${wt.branch.padEnd(40)} ${status}`);
    }
    console.log('\u2500'.repeat(70));
    console.log(`Total: ${worktrees.length} worktree(s)\n`);
    process.exit(0);
  }

  // ── Cleanup mode ──
  if (args.cleanup) {
    const key = args.sdKey || args.session;
    if (!key) {
      console.error('Error: --cleanup requires --sd-key <key>');
      process.exit(1);
    }

    try {
      const result = cleanupWorktree(args.sdKey || key, { force: args.force || false });
      if (result.cleaned) {
        console.log(`Worktree '${key}' removed successfully.`);
      } else {
        console.log(`Worktree cleanup result: ${result.reason}`);
        if (result.reason === 'dirty_worktree') {
          console.log('Use --force to override dirty-worktree safety check.');
        }
      }
    } catch (err) {
      console.error(`Error removing worktree: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // ── Cleanup stale mode ──
  if (args.cleanupStale) {
    let supabase = null;
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    } catch {
      console.log('Note: Supabase unavailable - SD completion check skipped');
    }

    const maxAgeMs = (args.maxAgeHours || 24) * 60 * 60 * 1000;
    console.log(`\nStale Worktree Cleanup ${args.dryRun ? '(DRY RUN)' : ''}`);
    console.log('\u2500'.repeat(60));

    const result = await cleanupStaleWorktrees({ dryRun: args.dryRun, maxAgeMs, supabase });

    if (result.cursorWarnings.length > 0) {
      console.log('\n  Cursor worktrees detected (not touched):');
      for (const w of result.cursorWarnings) console.log(`    ${w}`);
    }
    if (result.cleaned.length > 0) {
      console.log(`\n  Cleaned (${result.cleaned.length}):`);
      for (const c of result.cleaned) console.log(`    ${c}`);
    }
    if (result.skipped.length > 0) {
      console.log(`\n  Skipped (${result.skipped.length}):`);
      for (const s of result.skipped) console.log(`    ${s}`);
    }
    if (result.errors.length > 0) {
      console.log(`\n  Errors (${result.errors.length}):`);
      for (const e of result.errors) console.log(`    ${e}`);
    }
    if (result.cleaned.length === 0 && result.skipped.length === 0 && result.errors.length === 0) {
      console.log('\n  No stale worktrees found.');
    }
    console.log('\u2500'.repeat(60));
    process.exit(0);
  }

  // ── Create mode ──
  const key = args.sdKey || args.session;
  if (!key || !args.branch) {
    console.error('Error: --sd-key and --branch are required for worktree creation.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  try {
    const result = createWorktree({
      sdKey: args.sdKey,
      session: args.session,
      branch: args.branch,
      force: args.force || false
    });

    if (result.reused) {
      console.log(`\nWorktree '${result.sdKey}' already exists on branch '${result.branch}'.`);
      console.log(`Path: ${result.path}`);
      console.log('\nTo use it:');
      console.log(`  cd ${result.path}`);
      process.exit(0);
    }

    // Symlink node_modules
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
    console.log(`  SD Key: ${result.sdKey}`);
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
