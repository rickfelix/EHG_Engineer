/**
 * UI_INTERACTIVITY_CHECK — Frontend Component Actionability Gate
 * SD-MAN-INFRA-LEO-GATE-IMPROVEMENTS-001
 *
 * Verifies that EHG frontend feature SDs include at least one
 * interactive handler (onClick, onSubmit, authedFetch) in their
 * changed component files. Display-only components are not shippable features.
 *
 * Why: S18-S26 redesign shipped 8 stage components, all display-only.
 * Zero onClick, zero API calls. Chairman can see data but can't act on it.
 *
 * Applies only when: target_application = 'EHG' AND sd_type = 'feature'
 *
 * Phase: EXEC-TO-PLAN
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { createBranchFileReader } from '../../../lib/branch-file-reader.js';
import { resolveRepoPath } from '../../../../../../lib/repo-paths.js';

const GATE_NAME = 'UI_INTERACTIVITY_CHECK';
const INTERACTIVE_PATTERNS = ['onClick', 'onSubmit', 'authedFetch', 'onChange', 'onSelect'];

/**
 * Create the UI interactivity check gate.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate definition
 */
export function createUiInteractivityCheckGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🖱️  GATE: UI Interactivity Check');
      console.log('-'.repeat(50));

      const sd = ctx.sd || {};
      const targetApp = sd.target_application;
      const sdType = sd.sd_type;

      // Only applies to EHG frontend feature SDs
      if (targetApp !== 'EHG' || sdType !== 'feature') {
        const reason = targetApp !== 'EHG'
          ? `target_application=${targetApp} (not EHG)`
          : `sd_type=${sdType} (not feature)`;
        console.log(`   ℹ️  Skipped: ${reason}`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [`Skipped: ${reason}`] };
      }

      const sdKey = sd.sd_key || ctx.sdKey;
      const branchPatterns = [`feat/${sdKey}`, `fix/${sdKey}`];

      // Resolved INSIDE the validator (not at module load) and existence-checked explicitly,
      // so a genuinely broken repo path surfaces as a real gate failure rather than falling
      // into the generic catch(err) below's advisory pass -- SD-LEO-INFRA-REPO-HYGIENE-PATH-001,
      // RCA finding: a wrong-but-defined EHG_REPO_PATH previously made every execSync call throw
      // ENOENT, caught below, and silently returned passed:true score:70 -- indistinguishable
      // from a genuine pass for every EHG feature SD run from a worktree.
      //
      // Checks for .git specifically (not just the directory existing) -- SECURITY sub-agent
      // finding, EXEC-TO-PLAN review 2026-08-24: a plain existsSync(EHG_REPO_PATH) is satisfied
      // by an EMPTY directory too (measured: this SD's own FR-4 dry-run script creates exactly
      // such a placeholder), which then made `git branch -r` throw "not a git repository",
      // landing in the unchanged catch(err) below and re-opening the same advisory-pass
      // camouflage this fix exists to close.
      const EHG_REPO_PATH = resolveRepoPath('ehg');
      if (!EHG_REPO_PATH || !existsSync(EHG_REPO_PATH) || !existsSync(path.join(EHG_REPO_PATH, '.git'))) {
        console.log(`   ❌ Resolved ehg repo path is missing or not a git checkout: ${EHG_REPO_PATH}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`resolveRepoPath('ehg') returned '${EHG_REPO_PATH}', which is missing or not a git checkout (.git not found). This is a gate-infrastructure failure, not a component-interactivity finding.`],
          warnings: [],
          remediation: 'Verify applications/registry.json\'s ehg entry and that the ehg repo is checked out as a sibling of EHG_Engineer\'s main checkout.',
        };
      }

      try {
        // Find the SD's branch in the EHG repo
        let branchName = null;
        const branches = execSync('git branch -r', {
          cwd: EHG_REPO_PATH, encoding: 'utf8', timeout: 10000
        }).split('\n').map(b => b.trim());

        for (const pattern of branchPatterns) {
          const match = branches.find(b => b.toLowerCase().includes(pattern.toLowerCase()));
          if (match) {
            branchName = match.replace('origin/', '');
            break;
          }
        }

        if (!branchName) {
          console.log(`   ℹ️  No branch found for ${sdKey} in EHG repo — advisory pass`);
          return { passed: true, score: 80, max_score: 100, issues: [], warnings: ['No SD branch found in EHG repo'] };
        }

        // Get component files changed on this branch vs main
        const diffOutput = execSync(
          `git diff --name-only origin/main...origin/${branchName} -- "src/components/"`,
          { cwd: EHG_REPO_PATH, encoding: 'utf8', timeout: 10000 }
        ).trim();

        if (!diffOutput) {
          console.log('   ℹ️  No component files changed on this branch');
          return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No component files changed'] };
        }

        const changedFiles = diffOutput.split('\n')
          .filter(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx'));

        if (changedFiles.length === 0) {
          console.log('   ℹ️  No .tsx/.ts component files changed');
          return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No component files changed'] };
        }

        // Check each changed file for interactive patterns.
        // SD-LEO-INFRA-FIX-GATE-FILE-001: read from origin/<branch>, not the shared
        // working tree (which may be on an unrelated branch in parallel sessions).
        const reader = createBranchFileReader(EHG_REPO_PATH);
        let interactiveFiles = 0;
        const displayOnlyFiles = [];

        for (const file of changedFiles) {
          let content;
          try {
            content = reader.readFile(branchName, file);
          } catch {
            // File may have been deleted on branch — skip like the old fs.existsSync path
            continue;
          }
          const hasInteractivity = INTERACTIVE_PATTERNS.some(p => content.includes(p));

          if (hasInteractivity) {
            interactiveFiles++;
          } else {
            displayOnlyFiles.push(file);
          }
        }

        console.log(`   Changed components: ${changedFiles.length}`);
        console.log(`   Interactive: ${interactiveFiles}`);
        console.log(`   Display-only: ${displayOnlyFiles.length}`);

        if (interactiveFiles > 0) {
          const warnings = displayOnlyFiles.length > 0
            ? [`${displayOnlyFiles.length} display-only file(s): ${displayOnlyFiles.join(', ')}`]
            : [];
          console.log(`   ✅ Found ${interactiveFiles} interactive component(s)`);
          return { passed: true, score: 100, max_score: 100, issues: [], warnings };
        }

        // Zero interactive components — block
        console.log('   ❌ No interactive handlers found in changed EHG components');
        console.log('   💡 Components must have at least one onClick/onSubmit/authedFetch');
        displayOnlyFiles.forEach(f => console.log(`      - ${f}`));

        return {
          passed: false,
          score: 30,
          max_score: 100,
          issues: [
            `No onClick/onSubmit/authedFetch found in ${changedFiles.length} changed component file(s). Display-only components are not shippable features.`,
            ...displayOnlyFiles.map(f => `  → ${f}`)
          ],
          warnings: [],
          remediation: 'Add event handlers that call API endpoints for user actions described in the PRD.'
        };
      } catch (err) {
        console.log(`   ⚠️  Interactivity check failed (advisory): ${err.message?.slice(0, 100)}`);
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [`UI interactivity check failed: ${err.message?.slice(0, 80)}`]
        };
      }
    }
  };
}
