/**
 * SharedGitContext -- Cached git state for handoff pipeline
 * SD-LEO-FIX-HANDOFF-PIPELINE-GIT-001
 *
 * Eliminates redundant execSync git calls (20-30 per handoff reduced to 3-5).
 * Each property is lazily computed on first access and cached for the
 * lifetime of the context instance.
 *
 * Usage:
 *   const gitCtx = new SharedGitContext();
 *   gitCtx.branch;    // cached after first call
 *   gitCtx.diffFiles; // cached after first call
 *   gitCtx.invalidate(); // force re-fetch on next access
 */
import { execSync } from 'child_process';

export class SharedGitContext {
  #branch = null;
  #gitRoot = null;
  #diffFiles = null;
  #diffStat = null;

  /**
   * Current git branch name (cached).
   * @returns {string}
   */
  get branch() {
    if (this.#branch === null) {
      try {
        this.#branch = execSync('git rev-parse --abbrev-ref HEAD', {
          encoding: 'utf8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
      } catch {
        this.#branch = 'unknown';
      }
    }
    return this.#branch;
  }

  /**
   * Repository root directory (cached).
   * @returns {string}
   */
  get gitRoot() {
    if (this.#gitRoot === null) {
      try {
        this.#gitRoot = execSync('git rev-parse --show-toplevel', {
          encoding: 'utf8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
      } catch {
        this.#gitRoot = process.cwd();
      }
    }
    return this.#gitRoot;
  }

  /**
   * Files changed relative to main (or HEAD if on main). Cached.
   * Returns an array of file path strings.
   * @returns {string[]}
   */
  get diffFiles() {
    if (this.#diffFiles === null) {
      try {
        const branch = this.branch;
        let output;
        if (branch === 'main' || branch === 'master') {
          output = execSync('git diff --name-only HEAD', {
            encoding: 'utf8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();
        } else {
          output = execSync('git diff --name-only main...HEAD', {
            encoding: 'utf8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();
        }
        this.#diffFiles = output ? output.split('\n').filter(f => f.trim()) : [];
      } catch {
        this.#diffFiles = [];
      }
    }
    return this.#diffFiles;
  }

  /**
   * Git diff --stat output relative to main (or HEAD if on main). Cached.
   * Raw string output for LOC parsing.
   * @returns {string}
   */
  get diffStat() {
    if (this.#diffStat === null) {
      try {
        const branch = this.branch;
        if (branch === 'main' || branch === 'master') {
          this.#diffStat = execSync('git diff --stat', {
            encoding: 'utf8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe']
          });
        } else {
          this.#diffStat = execSync('git diff --stat main...HEAD', {
            encoding: 'utf8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe']
          });
        }
      } catch {
        this.#diffStat = '';
      }
    }
    return this.#diffStat;
  }

  /**
   * Whether the current branch is the main/master branch.
   * @returns {boolean}
   */
  get isMainBranch() {
    return this.branch === 'main' || this.branch === 'master';
  }

  /**
   * Invalidate all cached values. Next property access will re-fetch.
   */
  invalidate() {
    this.#branch = null;
    this.#gitRoot = null;
    this.#diffFiles = null;
    this.#diffStat = null;
  }
}
