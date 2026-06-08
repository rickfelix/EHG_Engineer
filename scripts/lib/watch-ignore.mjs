// scripts/lib/watch-ignore.mjs — SD-FDBK-FIX-STAGE-WORKER-SUPERVISOR-001
import { basename } from 'path';

/**
 * chokidar `ignored` predicate: ignore dotfiles by BASENAME only.
 *
 * The previous inline regex `/(^|[/\\])\../` matched a dotted segment ANYWHERE in the
 * path, so a `.worktrees` (or any dotted) ANCESTOR excluded the ENTIRE watch tree —
 * silently disabling hot-reload when the stage-worker supervisor runs from inside a git
 * worktree. Matching only the leaf basename still ignores real dotfiles (.git, .env,
 * .cache) without excluding a tree that merely lives under a dotted ancestor.
 *
 * chokidar v4 calls `ignored` with the full path of each watched entry; we look only at
 * its basename so ancestor segments never trigger a tree-wide exclusion.
 *
 * @param {string} p path chokidar is considering (absolute or relative)
 * @returns {boolean} true to ignore the entry
 */
export const isDotfileBasename = (p) => basename(String(p)).startsWith('.');
