/**
 * Branch Resolver Domain Exports
 * Re-exports all domain modules for easy import
 *
 * @module branch-resolver/domains
 */

// Validation Domain
export {
  validateBranchExists,
  validateBranchContent
} from './validation.js';

// Discovery Domain
export {
  discoverBranchFromGit,
  selectBestBranch
} from './discovery.js';

// Fallback Domain
export {
  checkPostMergeFallback,
  checkMergeEvidence,
  checkPRMergeEvidence
} from './fallback.js';

// Database Operations Domain
export {
  storeBranchInDatabase,
  updateBranchAsMerged
} from './db-operations.js';

// File Operations Domain
export {
  readFileFromBranch,
  listFilesFromBranch,
  fileExistsOnBranch
} from './file-operations.js';
