/**
 * Plan Archiver Module
 *
 * Archives Claude Code plan files to permanent locations and finds recent plans.
 * Part of SD-LEO-INFRA-PLAN-AWARE-SD-CREATION feature.
 *
 * @module scripts/modules/plan-archiver
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Default archive directory for plan files
 */
export const ARCHIVE_DIR = path.join(process.cwd(), 'docs', 'plans', 'archived');

/**
 * Default Claude Code plans directory
 */
export const CLAUDE_PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');

/**
 * Find the most recently modified plan file in a directory
 *
 * @param {string} plansDir - Directory to search (defaults to ~/.claude/plans/)
 * @returns {Promise<{path: string, mtime: Date}|null>} Most recent plan or null
 */
export async function findMostRecentPlan(plansDir = CLAUDE_PLANS_DIR) {
  try {
    // Check if directory exists
    if (!fs.existsSync(plansDir)) {
      console.log(`[PlanArchiver] Plans directory not found: ${plansDir}`);
      return null;
    }

    // Read all files in directory
    const files = fs.readdirSync(plansDir);

    // Filter to .md files and get stats
    const planFiles = [];
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(plansDir, file);
        try {
          const stat = fs.statSync(filePath);
          planFiles.push({
            path: filePath,
            mtime: stat.mtime,
            name: file
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }

    if (planFiles.length === 0) {
      console.log('[PlanArchiver] No .md plan files found');
      return null;
    }

    // Sort by modification time descending
    planFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const mostRecent = planFiles[0];
    console.log(`[PlanArchiver] Most recent plan: ${mostRecent.name} (${mostRecent.mtime.toISOString()})`);

    return {
      path: mostRecent.path,
      mtime: mostRecent.mtime,
      name: mostRecent.name
    };
  } catch (error) {
    console.error('[PlanArchiver] Error finding recent plan:', error.message);
    return null;
  }
}

/**
 * Ensure archive directory exists
 *
 * @param {string} archiveDir - Archive directory path
 */
export function ensureArchiveDir(archiveDir = ARCHIVE_DIR) {
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
    console.log(`[PlanArchiver] Created archive directory: ${archiveDir}`);
  }
}

/**
 * Archive a plan file to permanent location
 *
 * @param {string} sourcePath - Path to source plan file
 * @param {string} sdKey - SD key for naming the archived file
 * @param {string} archiveDir - Archive directory (defaults to docs/plans/archived/)
 * @returns {Promise<{success: boolean, archivedPath: string|null, error: string|null}>}
 */
export async function archivePlanFile(sourcePath, sdKey, archiveDir = ARCHIVE_DIR) {
  try {
    // Validate source exists
    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        archivedPath: null,
        error: `Source file not found: ${sourcePath}`
      };
    }

    // Ensure archive directory exists
    ensureArchiveDir(archiveDir);

    // Generate archive filename
    const sanitizedKey = sdKey.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const archiveFileName = `${sanitizedKey}-plan.md`;
    const archivedPath = path.join(archiveDir, archiveFileName);

    // Read source content
    const content = fs.readFileSync(sourcePath, 'utf8');

    // Add archive header
    const archiveHeader = `<!-- Archived from: ${sourcePath} -->
<!-- SD Key: ${sdKey} -->
<!-- Archived at: ${new Date().toISOString()} -->

`;

    // Write to archive
    fs.writeFileSync(archivedPath, archiveHeader + content, 'utf8');

    console.log(`[PlanArchiver] Archived plan to: ${archivedPath}`);

    return {
      success: true,
      archivedPath,
      error: null
    };
  } catch (error) {
    console.error('[PlanArchiver] Error archiving plan:', error.message);
    return {
      success: false,
      archivedPath: null,
      error: error.message
    };
  }
}

/**
 * Read plan file content
 *
 * @param {string} planPath - Path to plan file
 * @returns {string|null} File content or null if error
 */
export function readPlanFile(planPath) {
  try {
    if (!fs.existsSync(planPath)) {
      console.error(`[PlanArchiver] Plan file not found: ${planPath}`);
      return null;
    }

    let content = fs.readFileSync(planPath, 'utf8');

    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    return content;
  } catch (error) {
    console.error('[PlanArchiver] Error reading plan file:', error.message);
    return null;
  }
}

/**
 * Get relative path for display purposes
 *
 * @param {string} absolutePath - Absolute file path
 * @returns {string} Relative or shortened path
 */
export function getDisplayPath(absolutePath) {
  const home = os.homedir();
  if (absolutePath.startsWith(home)) {
    return absolutePath.replace(home, '~');
  }

  const cwd = process.cwd();
  if (absolutePath.startsWith(cwd)) {
    return absolutePath.replace(cwd + path.sep, '');
  }

  return absolutePath;
}

// Default export
export default {
  ARCHIVE_DIR,
  CLAUDE_PLANS_DIR,
  findMostRecentPlan,
  ensureArchiveDir,
  archivePlanFile,
  readPlanFile,
  getDisplayPath
};
