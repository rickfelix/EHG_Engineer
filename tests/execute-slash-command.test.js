/**
 * Tests for .claude/commands/execute.md content shape.
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-D (Phase 4 of /execute)
 *
 * The slash command file is markdown-only (no JS execution), so this test
 * validates the file exists, contains all required sections, references the
 * correct underlying scripts, and never invokes AskUserQuestion.
 */

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const EXECUTE_MD_PATH = path.join(REPO_ROOT, '.claude/commands/execute.md');

describe('.claude/commands/execute.md', () => {
  let content;

  test('file exists', () => {
    expect(fs.existsSync(EXECUTE_MD_PATH)).toBe(true);
    content = fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content.length).toBeGreaterThan(500);
  });

  test('lists all 5 subcommands', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toMatch(/`start`/);
    expect(content).toMatch(/`stop`/);
    expect(content).toMatch(/`status`/);
    expect(content).toMatch(/`list`/);
    expect(content).toMatch(/`help`/);
  });

  test('references scripts/execute-team.mjs for start dispatch', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toContain('scripts/execute-team.mjs');
  });

  test('references scripts/execute-stop.mjs for stop dispatch', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toContain('scripts/execute-stop.mjs');
  });

  test('references scripts/fleet-dashboard.cjs for status dispatch', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toContain('scripts/fleet-dashboard.cjs team');
  });

  test('contains "Pre-flight failure reference" section', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toContain('Pre-flight Failure Reference');
    expect(content).toContain('node_modules');
    expect(content).toContain('Database unreachable');
    expect(content).toContain('Claim gate RPC');
  });

  test('contains "Manual Acceptance" section with both pilots', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toContain('Manual Acceptance');
    expect(content).toMatch(/1-worker.*3-SD/);
    expect(content).toMatch(/3-worker.*10-SD/);
    expect(content).toContain('Pilot Failure Protocol');
  });

  test('explicitly forbids AskUserQuestion', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    // The file should mention AskUserQuestion only as a prohibition
    const askMatches = content.match(/AskUserQuestion/g) || [];
    expect(askMatches.length).toBeGreaterThanOrEqual(1);
    expect(content).toMatch(/NEVER call AskUserQuestion/i);
  });

  test('references coordinator bootstrap helper', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toContain('coordinator-bootstrap');
    expect(content).toContain('checkCoordinatorRunning');
  });

  test('references the parent vision and architecture docs', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toContain('VISION-EXECUTE-COMMAND-L2-001');
    expect(content).toContain('ARCH-EXECUTE-COMMAND-001');
  });

  test('lists named flags only (no positional args after subcommand)', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    // Verify the doc mentions named flags
    expect(content).toContain('--workers');
    expect(content).toContain('--track');
    expect(content).toContain('--team');
    expect(content).toContain('--callsign');
    expect(content).toContain('--all');
    expect(content).toContain('--grace-period');
    expect(content).toContain('--force');
    // No positional args section
    expect(content).toContain('named flags only');
  });

  test('mentions all 4 phase children', () => {
    content = content || fs.readFileSync(EXECUTE_MD_PATH, 'utf8');
    expect(content).toContain('Phase 1');
    expect(content).toContain('Phase 2');
    expect(content).toContain('Phase 3');
    expect(content).toContain('Phase 4');
  });
});
