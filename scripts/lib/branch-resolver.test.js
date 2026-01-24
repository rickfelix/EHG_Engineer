/**
 * Branch Resolver Tests
 * Verifies modular structure and backward compatibility
 *
 * @module branch-resolver.test
 */

import { describe, it, expect } from 'vitest';

// Test backward-compatible imports from main module
import branchResolver, {
  resolveBranch,
  validateBranchExists,
  validateBranchContent,
  discoverBranchFromGit,
  selectBestBranch,
  checkPostMergeFallback,
  storeBranchInDatabase,
  updateBranchAsMerged,
  readFileFromBranch,
  listFilesFromBranch,
  fileExistsOnBranch
} from './branch-resolver.js';

// Test direct domain imports
import {
  validateBranchExists as validationValidate,
  validateBranchContent as validationContent
} from './branch-resolver/domains/validation.js';

import {
  discoverBranchFromGit as discoveryDiscover,
  selectBestBranch as discoverySelect
} from './branch-resolver/domains/discovery.js';

import {
  checkPostMergeFallback as fallbackCheck,
  checkMergeEvidence,
  checkPRMergeEvidence
} from './branch-resolver/domains/fallback.js';

import {
  storeBranchInDatabase as dbStore,
  updateBranchAsMerged as dbUpdate
} from './branch-resolver/domains/db-operations.js';

import {
  readFileFromBranch as fileRead,
  listFilesFromBranch as fileList,
  fileExistsOnBranch as fileExists
} from './branch-resolver/domains/file-operations.js';

describe('Branch Resolver - Backward Compatibility', () => {
  it('should export default object with expected methods', () => {
    expect(branchResolver).toBeDefined();
    expect(typeof branchResolver.resolveBranch).toBe('function');
    expect(typeof branchResolver.readFileFromBranch).toBe('function');
    expect(typeof branchResolver.listFilesFromBranch).toBe('function');
    expect(typeof branchResolver.fileExistsOnBranch).toBe('function');
  });

  it('should export resolveBranch function', () => {
    expect(resolveBranch).toBeDefined();
    expect(typeof resolveBranch).toBe('function');
  });
});

describe('Branch Resolver - Validation Domain Exports', () => {
  it('should export validateBranchExists function', () => {
    expect(validateBranchExists).toBeDefined();
    expect(typeof validateBranchExists).toBe('function');
  });

  it('should export validateBranchContent function', () => {
    expect(validateBranchContent).toBeDefined();
    expect(typeof validateBranchContent).toBe('function');
  });
});

describe('Branch Resolver - Discovery Domain Exports', () => {
  it('should export discoverBranchFromGit function', () => {
    expect(discoverBranchFromGit).toBeDefined();
    expect(typeof discoverBranchFromGit).toBe('function');
  });

  it('should export selectBestBranch function', () => {
    expect(selectBestBranch).toBeDefined();
    expect(typeof selectBestBranch).toBe('function');
  });
});

describe('Branch Resolver - Fallback Domain Exports', () => {
  it('should export checkPostMergeFallback function', () => {
    expect(checkPostMergeFallback).toBeDefined();
    expect(typeof checkPostMergeFallback).toBe('function');
  });
});

describe('Branch Resolver - Database Operations Exports', () => {
  it('should export storeBranchInDatabase function', () => {
    expect(storeBranchInDatabase).toBeDefined();
    expect(typeof storeBranchInDatabase).toBe('function');
  });

  it('should export updateBranchAsMerged function', () => {
    expect(updateBranchAsMerged).toBeDefined();
    expect(typeof updateBranchAsMerged).toBe('function');
  });
});

describe('Branch Resolver - File Operations Exports', () => {
  it('should export readFileFromBranch function', () => {
    expect(readFileFromBranch).toBeDefined();
    expect(typeof readFileFromBranch).toBe('function');
  });

  it('should export listFilesFromBranch function', () => {
    expect(listFilesFromBranch).toBeDefined();
    expect(typeof listFilesFromBranch).toBe('function');
  });

  it('should export fileExistsOnBranch function', () => {
    expect(fileExistsOnBranch).toBeDefined();
    expect(typeof fileExistsOnBranch).toBe('function');
  });
});

describe('Branch Resolver - Direct Domain Imports', () => {
  it('should export same functions from validation domain', () => {
    expect(validationValidate).toBeDefined();
    expect(typeof validationValidate).toBe('function');
    expect(validationContent).toBeDefined();
    expect(typeof validationContent).toBe('function');
  });

  it('should export same functions from discovery domain', () => {
    expect(discoveryDiscover).toBeDefined();
    expect(typeof discoveryDiscover).toBe('function');
    expect(discoverySelect).toBeDefined();
    expect(typeof discoverySelect).toBe('function');
  });

  it('should export same functions from fallback domain', () => {
    expect(fallbackCheck).toBeDefined();
    expect(typeof fallbackCheck).toBe('function');
    expect(checkMergeEvidence).toBeDefined();
    expect(typeof checkMergeEvidence).toBe('function');
    expect(checkPRMergeEvidence).toBeDefined();
    expect(typeof checkPRMergeEvidence).toBe('function');
  });

  it('should export same functions from db-operations domain', () => {
    expect(dbStore).toBeDefined();
    expect(typeof dbStore).toBe('function');
    expect(dbUpdate).toBeDefined();
    expect(typeof dbUpdate).toBe('function');
  });

  it('should export same functions from file-operations domain', () => {
    expect(fileRead).toBeDefined();
    expect(typeof fileRead).toBe('function');
    expect(fileList).toBeDefined();
    expect(typeof fileList).toBe('function');
    expect(fileExists).toBeDefined();
    expect(typeof fileExists).toBe('function');
  });

  it('should reference same function instances', () => {
    // Functions from main export should be same as domain exports
    expect(validateBranchExists).toBe(validationValidate);
    expect(validateBranchContent).toBe(validationContent);
    expect(discoverBranchFromGit).toBe(discoveryDiscover);
    expect(selectBestBranch).toBe(discoverySelect);
    expect(checkPostMergeFallback).toBe(fallbackCheck);
    expect(storeBranchInDatabase).toBe(dbStore);
    expect(updateBranchAsMerged).toBe(dbUpdate);
    expect(readFileFromBranch).toBe(fileRead);
    expect(listFilesFromBranch).toBe(fileList);
    expect(fileExistsOnBranch).toBe(fileExists);
  });
});

// Git-dependent tests use absolute paths for cross-platform compatibility
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoPath = path.resolve(__dirname, '../..');

describe('Branch Resolver - Validation Domain Logic', () => {
  it('should return exists:false for non-existent branch', () => {
    const result = validateBranchExists(repoPath, 'non-existent-branch-xyz-123');
    expect(result.exists).toBe(false);
  });

  it('should return exists:true for main branch', () => {
    const result = validateBranchExists(repoPath, 'main');
    expect(result.exists).toBe(true);
    expect(result.commitHash).toBeDefined();
    expect(result.lastCommitDate).toBeDefined();
  });
});

describe('Branch Resolver - Discovery Domain Logic', () => {
  it('should not find branches for non-existent SD ID', () => {
    const result = discoverBranchFromGit(repoPath, 'SD-NON-EXISTENT-XYZ-999');
    expect(result.found).toBe(false);
    expect(result.error).toContain('No branches found');
    expect(result.searchedPatterns).toContain('SD-NON-EXISTENT-XYZ-999');
  });

  it('should select single branch when only one match', () => {
    const result = selectBestBranch(repoPath, ['main']);
    expect(result.branch).toBe('main');
  });
});

describe('Branch Resolver - File Operations Domain Logic', () => {
  it('should read existing file from main branch', () => {
    const result = readFileFromBranch(repoPath, 'main', 'package.json');
    expect(result.success).toBe(true);
    expect(result.content).toContain('name');
  });

  it('should fail for non-existent file', () => {
    const result = readFileFromBranch(repoPath, 'main', 'non-existent-file-xyz.txt');
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });

  it('should list files matching pattern', () => {
    const files = listFilesFromBranch(repoPath, 'main', '\\.js$');
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it('should check file existence on branch', () => {
    expect(fileExistsOnBranch(repoPath, 'main', 'package.json')).toBe(true);
    expect(fileExistsOnBranch(repoPath, 'main', 'non-existent-xyz.txt')).toBe(false);
  });
});
