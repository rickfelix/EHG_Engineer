#!/usr/bin/env node
/**
 * Repo Cleanup Engine — Pattern-based untracked file categorization
 *
 * Scans untracked git files, categorizes them via glob rules from
 * .claude/cleanup-rules.json, presents a summary, and optionally
 * executes cleanup actions (delete, gitignore, commit).
 *
 * CLI: node scripts/repo-cleanup.js [--dry-run] [--execute] [--no-learn] [--json]
 * API: import { scan, execute } from './scripts/repo-cleanup.js'
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { minimatch } from 'minimatch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const RULES_PATH = path.join(REPO_ROOT, '.claude', 'cleanup-rules.json');

// ── Rules ──────────────────────────────────────────────────────

function loadRules() {
  if (!fs.existsSync(RULES_PATH)) {
    console.error(`Rules file not found: ${RULES_PATH}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
}

// ── Scanner ────────────────────────────────────────────────────

export function scanUntracked() {
  const output = execSync('git status --porcelain', {
    cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  });
  return output
    .split('\n')
    .filter(l => l.startsWith('??'))
    .map(l => l.slice(3).trim())
    .filter(Boolean);
}

// ── Categorizer ────────────────────────────────────────────────

function isProtected(filePath, protectedPaths) {
  const normalized = filePath.replace(/\\/g, '/');
  return protectedPaths.some(p => normalized.startsWith(p));
}

function matchesRule(filePath, rule) {
  const normalized = filePath.replace(/\\/g, '/');
  const pattern = rule.pattern.replace(/\\/g, '/');
  const withoutSlash = pattern.startsWith('/') ? pattern.slice(1) : pattern;

  if (!minimatch(normalized, pattern, { dot: true }) &&
      !minimatch(normalized, withoutSlash, { dot: true })) {
    return false;
  }

  if (rule.exclude) {
    const basename = path.basename(normalized);
    if (rule.exclude.some(ex => minimatch(basename, ex) || minimatch(normalized, ex))) {
      return false;
    }
  }
  return true;
}

export function categorize(files, rules) {
  const result = { delete: [], gitignore: [], commit: [], review: [] };
  if (!rules) return { ...result, review: files.map(f => ({ file: f, reason: 'no rules loaded' })) };

  const protectedPaths = rules.protected_paths || [];
  const allRules = rules.rules || {};
  const learnedRules = rules.learned || [];

  for (const file of files) {
    if (isProtected(file, protectedPaths)) {
      result.review.push({ file, reason: 'protected path' });
      continue;
    }

    let matched = false;
    for (const category of ['delete', 'gitignore', 'commit']) {
      const categoryRules = [...(allRules[category] || []), ...learnedRules.filter(r => r.category === category)];
      for (const rule of categoryRules) {
        if (matchesRule(file, rule)) {
          result[category].push({ file, reason: rule.reason || rule.pattern, source: 'rule' });
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      result.review.push({ file, reason: 'no matching rule' });
    }
  }

  return result;
}

// ── Scan API ───────────────────────────────────────────────────

export function scan() {
  const files = scanUntracked();
  const rules = loadRules();
  return categorize(files, rules);
}

// ── Summary Display ────────────────────────────────────────────

function presentSummary(categories) {
  const counts = {
    DELETE: categories.delete.length,
    GITIGNORE: categories.gitignore.length,
    COMMIT: categories.commit.length,
    REVIEW: categories.review.length
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\nScanning untracked files... ${total} found\n`);

  if (total === 0) {
    console.log('  Repository is clean — no untracked files.');
    return;
  }

  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
  console.log('  Category     Count  Examples');
  console.log('  ----------   -----  ----------------------------------------');

  for (const [cat, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    const label = cat.toUpperCase();
    const examples = items.slice(0, 3).map(i => typeof i === 'string' ? i : i.file);
    const exStr = examples.join(', ').slice(0, 40);
    console.log(`  ${pad(label, 12)} ${pad(String(items.length), 5)}  ${exStr}`);
  }
}

// ── Execute Actions ────────────────────────────────────────────

export async function executeActions(categories, options = {}) {
  const { dryRun = true } = options;
  const stats = { deleted: 0, gitignored: 0, committed: 0, skipped: 0, rulesLearned: 0 };

  if (dryRun) {
    console.log('\n  DRY RUN — no changes will be made.\n');
    presentSummary(categories);

    if (categories.review.length > 0) {
      console.log(`\n  ${categories.review.length} file(s) need manual review:`);
      for (const item of categories.review) {
        const f = typeof item === 'string' ? item : item.file;
        console.log(`   ? ${f}`);
      }
    }
    return stats;
  }

  // DELETE
  for (const item of categories.delete) {
    const filePath = path.join(REPO_ROOT, item.file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true });
      } else {
        fs.unlinkSync(filePath);
      }
      stats.deleted++;
    } catch (e) {
      console.warn(`   Could not delete ${item.file}: ${e.message}`);
    }
  }

  // GITIGNORE
  if (categories.gitignore.length > 0) {
    const gitignorePath = path.join(REPO_ROOT, '.gitignore');
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
    const newPatterns = [];

    for (const item of categories.gitignore) {
      const pattern = item.file.endsWith('/') ? item.file : `/${item.file}`;
      if (!existing.includes(item.file) && !existing.includes(pattern)) {
        newPatterns.push(pattern);
        stats.gitignored++;
      }
    }

    if (newPatterns.length > 0) {
      const addition = '\n# Auto-added by /leo cleanup\n' + newPatterns.join('\n') + '\n';
      fs.appendFileSync(gitignorePath, addition);
    }
  }

  // COMMIT (stage only — actual commit is done by /ship)
  if (categories.commit.length > 0) {
    const filesToCommit = categories.commit.map(i => i.file);
    try {
      execSync(`git add ${filesToCommit.map(f => `"${f}"`).join(' ')}`, { cwd: REPO_ROOT });
      stats.committed = filesToCommit.length;
    } catch (e) {
      console.warn(`   Could not stage files: ${e.message}`);
    }
  }

  stats.skipped = categories.review.length;

  console.log(`\n  Cleanup complete: ${stats.deleted} deleted, ${stats.gitignored} gitignored, ${stats.committed} staged, ${stats.skipped} skipped`);
  if (stats.rulesLearned > 0) {
    console.log(`   Rules learned: ${stats.rulesLearned} new pattern(s) added to cleanup-rules.json`);
  }

  return stats;
}

// ── Rule Learning ──────────────────────────────────────────────

export function learnRule(file, category, reason) {
  const rules = loadRules();
  if (!rules) return null;

  const basename = path.basename(file);
  const dir = path.dirname(file);
  const ext = path.extname(basename);
  const prefix = basename.replace(ext, '').replace(/[-_]?\d+/g, '*').replace(/\*+/g, '*');
  const pattern = dir === '.' ? `/${prefix}${ext}` : `${dir}/${prefix}${ext}`;

  const newRule = {
    pattern,
    category,
    reason: reason || `Learned from: ${file}`,
    learned_at: new Date().toISOString()
  };

  rules.learned.push(newRule);
  fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2) + '\n');
  return newRule;
}

// ── CLI ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const noLearn = args.includes('--no-learn');
  const jsonOutput = args.includes('--json');

  const categories = scan();

  if (jsonOutput) {
    console.log(JSON.stringify(categories, null, 2));
    return;
  }

  presentSummary(categories);

  if (execute) {
    const total = categories.delete.length + categories.gitignore.length + categories.commit.length;
    if (total > 0) {
      console.log(`\n  Executing: DELETE ${categories.delete.length}, GITIGNORE ${categories.gitignore.length}, COMMIT ${categories.commit.length}`);
    }
    await executeActions(categories, { dryRun: false, noLearn });
  } else {
    const actionable = categories.delete.length + categories.gitignore.length + categories.commit.length;
    if (actionable > 0) {
      console.log(`\n  Run with --execute to apply changes.`);
    }
  }
}

const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
               import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
