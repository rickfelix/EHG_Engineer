/**
 * Source-pin tests for QF-20260819-415: --backup-plan / --deletion-approved on --from-plan.
 *
 * lib/sd-creation/source-adapters/plan.js's createFromPlan() has no existing runtime test
 * harness (heavy DB/file-I/O function, same as its sibling migrationReviewed/securityReviewed
 * lines it sits beside, which are also untested at the runtime level). Source-pin tests verify
 * the literal wiring is present, matching this codebase's own precedent for this exact function.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../scripts/leo-create-sd.js');
const planAdapterPath = path.resolve(__dirname, '../../lib/sd-creation/source-adapters/plan.js');

const cliSource = fs.readFileSync(cliPath, 'utf8');
const planAdapterSource = fs.readFileSync(planAdapterPath, 'utf8');

describe('QF-20260819-415: --backup-plan/--deletion-approved on --from-plan', () => {
  it('leo-create-sd.js parses both boolean flags for the --from-plan branch', () => {
    expect(cliSource).toMatch(/const backupPlan = args\.includes\('--backup-plan'\);/);
    expect(cliSource).toMatch(/const deletionApproved = args\.includes\('--deletion-approved'\);/);
  });

  it('leo-create-sd.js registers both flags in knownPlanFlags (so they are never mistaken for the plan path)', () => {
    const knownPlanFlagsMatch = cliSource.match(/const knownPlanFlags = new Set\(\[[\s\S]*?\]\);/);
    expect(knownPlanFlagsMatch).not.toBeNull();
    expect(knownPlanFlagsMatch[0]).toContain("'--backup-plan'");
    expect(knownPlanFlagsMatch[0]).toContain("'--deletion-approved'");
  });

  it('leo-create-sd.js forwards backupPlan/deletionApproved into the createFromPlan() options object', () => {
    const createFromPlanCallMatch = cliSource.match(/const planRes = await createFromPlan\(planPath, hasYesFlag, \{[\s\S]*?\}\);/);
    expect(createFromPlanCallMatch).not.toBeNull();
    expect(createFromPlanCallMatch[0]).toMatch(/\bbackupPlan,/);
    expect(createFromPlanCallMatch[0]).toMatch(/\bdeletionApproved,/);
  });

  it('plan.js sets metadata.backup_plan/deletion_approved from overrides, mirroring feedback.js:148', () => {
    expect(planAdapterSource).toMatch(/\.\.\.\(overrides\.backupPlan \? \{ backup_plan: true \} : \{\}\),/);
    expect(planAdapterSource).toMatch(/\.\.\.\(overrides\.deletionApproved \? \{ deletion_approved: true \} : \{\}\),/);
  });

  it('the new metadata lines sit inside the same metadata object as migrationReviewed/securityReviewed (not a separate, disconnected block)', () => {
    const metadataBlockMatch = planAdapterSource.match(/metadata: \{[\s\S]*?plan_linkage: classifyPlanLinkage\(\{[\s\S]*?\}\)\s*\}/);
    expect(metadataBlockMatch).not.toBeNull();
    expect(metadataBlockMatch[0]).toContain('overrides.migrationReviewed');
    expect(metadataBlockMatch[0]).toContain('overrides.backupPlan');
    expect(metadataBlockMatch[0]).toContain('overrides.deletionApproved');
  });
});
