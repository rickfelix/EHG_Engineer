/**
 * Orphan Rules Discovery Routine
 * SD-LEO-SELF-IMPROVE-002B: Phase 2 - Self-Discovery Infrastructure
 *
 * Detects dead AEGIS references - validation rules that are defined
 * but never used, or referenced but no longer exist.
 */

import { DiscoveryRoutine, routineRegistry, SEVERITY_LEVELS, EVIDENCE_TYPES } from '../routineFramework.js';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import glob from 'glob';

/**
 * Orphan Rules Detection Routine
 * Finds AEGIS validation rules that are orphaned (defined but unused, or referenced but missing)
 */
class OrphanRulesRoutine extends DiscoveryRoutine {
  constructor() {
    super({
      key: 'orphan_rules',
      name: 'Orphan Rules Detector',
      description: 'Finds dead AEGIS references and orphaned validation rules'
    });

    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Execute orphan rules detection
   */
  async execute(options) {
    const { mode, repoRef, commitSha } = options;
    this.validateMode(mode);

    const findings = [];

    try {
      // Find all rule definitions in database
      const dbRules = await this.fetchDatabaseRules();
      console.log(`[orphan_rules] Found ${dbRules.length} rules in database`);

      // Find all rule references in codebase
      const codeRefs = await this.scanCodebaseForRules();
      console.log(`[orphan_rules] Found ${codeRefs.length} rule references in code`);

      // Detect orphans
      const { unusedRules, missingRules } = this.detectOrphans(dbRules, codeRefs);

      // Create findings for unused rules (defined but never referenced)
      for (const rule of unusedRules) {
        findings.push(this.createFinding({
          title: `Unused validation rule: ${rule.rule_code}`,
          summary: `Rule "${rule.rule_code}" is defined in database but never referenced in codebase. Consider removing or documenting its purpose.`,
          severity: SEVERITY_LEVELS.LOW,
          confidence: 0.85,
          evidencePack: [
            {
              path: `database/leo_validation_rules/${rule.rule_code}`,
              line_start: 1,
              line_end: 1,
              snippet: JSON.stringify({
                rule_code: rule.rule_code,
                rule_type: rule.rule_type,
                description: rule.description?.slice(0, 200)
              }, null, 2),
              evidence_type: EVIDENCE_TYPES.DOC
            },
            {
              path: 'lib/governance/aegis/',
              line_start: 1,
              line_end: 1,
              snippet: `// No references found to rule: ${rule.rule_code}`,
              evidence_type: EVIDENCE_TYPES.IMPLEMENTATION
            }
          ],
          repoRef,
          commitSha,
          mode,
          metadata: {
            rule_code: rule.rule_code,
            rule_type: rule.rule_type,
            orphan_type: 'unused'
          }
        }));
      }

      // Create findings for missing rules (referenced but not defined)
      for (const ref of missingRules) {
        findings.push(this.createFinding({
          title: `Missing validation rule: ${ref.ruleCode}`,
          summary: `Rule "${ref.ruleCode}" is referenced in code at ${ref.file}:${ref.line} but not defined in database.`,
          severity: SEVERITY_LEVELS.HIGH,
          confidence: 0.9,
          evidencePack: [
            {
              path: ref.file,
              line_start: ref.line,
              line_end: ref.line + 2,
              snippet: ref.context,
              evidence_type: EVIDENCE_TYPES.IMPLEMENTATION
            }
          ],
          repoRef,
          commitSha,
          mode,
          metadata: {
            rule_code: ref.ruleCode,
            file: ref.file,
            line: ref.line,
            orphan_type: 'missing'
          }
        }));
      }
    } catch (error) {
      console.error(`[orphan_rules] Error: ${error.message}`);
    }

    return findings;
  }

  /**
   * Fetch validation rules from database
   */
  async fetchDatabaseRules() {
    const { data, error } = await this.supabase
      .from('leo_validation_rules')
      .select('id, rule_code, rule_type, description, is_active')
      .eq('is_active', true);

    if (error) {
      console.warn('[orphan_rules] Could not fetch rules:', error.message);
      return [];
    }

    return data || [];
  }

  /**
   * Scan codebase for rule references
   */
  async scanCodebaseForRules() {
    const references = [];

    // Patterns to search for rule references
    const patterns = [
      /rule[_-]?code['":\s]+['"]?([A-Z][A-Z0-9_-]+)/gi,
      /validateRule\(['"]([A-Z][A-Z0-9_-]+)['"]/gi,
      /RULE[_-]ID['":\s]+['"]?([A-Z][A-Z0-9_-]+)/gi,
      /checkRule\(['"]([A-Z][A-Z0-9_-]+)['"]/gi,
      /['"]rule['"]:\s*['"]([A-Z][A-Z0-9_-]+)['"]/gi
    ];

    // Search directories
    const searchDirs = [
      'lib/governance/**/*.js',
      'scripts/modules/**/*.js',
      'lib/validators/**/*.js'
    ];

    try {
      for (const pattern of searchDirs) {
        const files = await glob(pattern, {
          cwd: this.repoRoot,
          ignore: ['**/node_modules/**']
        });

        for (const file of files) {
          const fullPath = resolve(this.repoRoot, file);
          if (!existsSync(fullPath)) continue;

          const content = readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            for (const regex of patterns) {
              regex.lastIndex = 0; // Reset regex state
              let match;
              while ((match = regex.exec(line)) !== null) {
                const ruleCode = match[1];

                // Filter out false positives
                if (this.isValidRuleCode(ruleCode)) {
                  references.push({
                    ruleCode,
                    file,
                    line: i + 1,
                    context: lines.slice(Math.max(0, i - 1), i + 3).join('\n').slice(0, 300)
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[orphan_rules] Scan error: ${error.message}`);
    }

    return references;
  }

  /**
   * Check if a string looks like a valid rule code
   */
  isValidRuleCode(code) {
    if (!code || code.length < 3 || code.length > 50) return false;

    // Must start with letter, contain mostly uppercase
    if (!/^[A-Z]/.test(code)) return false;

    // Filter out common false positives
    const falsePositives = [
      'CREATE', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TABLE',
      'INDEX', 'CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE',
      'NULL', 'TRUE', 'FALSE', 'DEFAULT', 'CHECK'
    ];

    if (falsePositives.includes(code)) return false;

    return true;
  }

  /**
   * Detect orphaned rules
   */
  detectOrphans(dbRules, codeRefs) {
    const dbRuleCodes = new Set(dbRules.map(r => r.rule_code));
    const referencedCodes = new Set(codeRefs.map(r => r.ruleCode));

    // Unused: in DB but not referenced
    const unusedRules = dbRules.filter(r => !referencedCodes.has(r.rule_code));

    // Missing: referenced but not in DB
    const missingRuleCodes = new Set();
    const missingRules = [];

    for (const ref of codeRefs) {
      if (!dbRuleCodes.has(ref.ruleCode) && !missingRuleCodes.has(ref.ruleCode)) {
        missingRuleCodes.add(ref.ruleCode);
        missingRules.push(ref);
      }
    }

    return { unusedRules, missingRules };
  }
}

// Create and register the routine
const orphanRulesRoutine = new OrphanRulesRoutine();
routineRegistry.register(orphanRulesRoutine);

export default orphanRulesRoutine;
