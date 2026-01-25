/**
 * PRD Sub-Agent Analysis Phases
 *
 * Functions for invoking sub-agents during PRD creation.
 * Extracted from add-prd-to-database.js for maintainability.
 *
 * Part of SD-LEO-REFACTOR-PRD-001
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  formatObjectives,
  formatArrayField,
  formatRisks,
  formatMetadata
} from './context-builder.js';

/**
 * Get temp directory (cross-platform)
 */
function getTempDir() {
  return os.tmpdir();
}

/**
 * Run DESIGN sub-agent analysis
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} sdData - SD data from database
 * @param {string} personaContextBlock - Persona context string
 * @returns {Promise<string|null>} Analysis output or null
 */
export async function runDesignAnalysis(sdId, sdData, personaContextBlock = '') {
  console.log('🔍 Invoking DESIGN sub-agent to analyze UI/UX workflows...\n');

  const designPrompt = `Analyze UI/UX design and user workflows for Strategic Directive: ${sdId}

## STRATEGIC DIRECTIVE - COMPLETE CONTEXT

**ID**: ${sdData.id || sdId}
**SD Key**: ${sdData.sd_key || 'N/A'}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdData.sd_type || sdData.category || 'feature'}
**Category**: ${sdData.category || 'Not specified'}
**Priority**: ${sdData.priority || 'Not specified'}

**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}
**Rationale**: ${sdData.rationale || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sdData.strategic_objectives)}

**Success Criteria**:
${formatArrayField(sdData.success_criteria, 'criterion')}

**Key Changes**:
${formatArrayField(sdData.key_changes, 'change')}

**Success Metrics**:
${formatArrayField(sdData.success_metrics, 'metric')}

**Dependencies**:
${formatArrayField(sdData.dependencies, 'dependency')}

**Known Risks**:
${formatRisks(sdData.risks)}

**Target Application**: ${sdData.target_application || 'EHG_Engineer'}

${sdData.metadata ? `## SD METADATA (Extended Context)\n${formatMetadata(sdData.metadata)}` : ''}
${personaContextBlock ? `\n${personaContextBlock}` : ''}
**Task**:
1. Identify user workflows and interaction patterns
2. Determine UI components and layouts needed
3. Analyze user journey and navigation flows
4. Identify data that users will view/create/edit
5. Determine what user actions trigger database changes

**Output Format**:
{
  "user_workflows": [
    {
      "workflow_name": "Workflow 1",
      "steps": ["step1", "step2"],
      "user_actions": ["create", "edit", "delete"],
      "data_displayed": ["field1", "field2"],
      "data_modified": ["field1", "field2"]
    }
  ],
  "ui_components_needed": ["component1", "component2"],
  "user_journey": "Description of user flow",
  "data_requirements": {
    "fields_to_display": ["field1", "field2"],
    "fields_to_edit": ["field1"],
    "relationships": ["parent_entity -> child_entity"]
  }
}

Please analyze user workflows and design requirements.`;

  try {
    const designPromptFile = path.join(getTempDir(), `design-agent-prompt-${Date.now()}.txt`);
    fs.writeFileSync(designPromptFile, designPrompt);

    console.log('📝 Prompt written to:', designPromptFile);
    console.log('\n🤖 Executing DESIGN sub-agent...\n');

    const designOutput = execSync(
      `node lib/sub-agent-executor.js DESIGN --context-file "${designPromptFile}"`,
      {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
        cwd: process.cwd()
      }
    );

    console.log('✅ Design analysis complete!\n');
    console.log('─────────────────────────────────────────────────');
    console.log(designOutput);
    console.log('─────────────────────────────────────────────────\n');

    fs.unlinkSync(designPromptFile);
    return designOutput;

  } catch (error) {
    console.warn('⚠️  Design analysis failed:', error.message);
    console.log('   Continuing with manual design review...\n');
    return null;
  }
}

/**
 * Run DATABASE sub-agent analysis
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} sdData - SD data from database
 * @param {string} designAnalysis - Design analysis output (optional)
 * @param {string} personaContextBlock - Persona context string
 * @returns {Promise<string|null>} Analysis output or null
 */
export async function runDatabaseAnalysis(sdId, sdData, designAnalysis = null, personaContextBlock = '') {
  console.log('🔍 Invoking DATABASE sub-agent to analyze schema and recommend changes...\n');

  const dbAgentPrompt = `Analyze database schema for Strategic Directive: ${sdId}

## STRATEGIC DIRECTIVE - COMPLETE CONTEXT

**ID**: ${sdData.id || sdId}
**SD Key**: ${sdData.sd_key || 'N/A'}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdData.sd_type || sdData.category || 'feature'}
**Category**: ${sdData.category || 'Not specified'}
**Priority**: ${sdData.priority || 'Not specified'}

**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}
**Rationale**: ${sdData.rationale || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sdData.strategic_objectives)}

**Success Criteria**:
${formatArrayField(sdData.success_criteria, 'criterion')}

**Key Changes**:
${formatArrayField(sdData.key_changes, 'change')}

**Success Metrics**:
${formatArrayField(sdData.success_metrics, 'metric')}

**Dependencies**:
${formatArrayField(sdData.dependencies, 'dependency')}

**Known Risks**:
${formatRisks(sdData.risks)}

**Target Application**: ${sdData.target_application || 'EHG_Engineer'}

${sdData.metadata ? `## SD METADATA (Extended Context)\n${formatMetadata(sdData.metadata)}` : ''}
${personaContextBlock ? `\n${personaContextBlock}` : ''}
${designAnalysis ? `
**DESIGN ANALYSIS CONTEXT** (from DESIGN sub-agent):
${designAnalysis}

Use this design analysis to understand:
- What data users will view/create/edit (drives table structure)
- User workflows and actions (drives CRUD requirements)
- UI component data needs (drives column selection)
- Data relationships (drives foreign keys and joins)
` : ''}

**Task**:
1. Review the EHG_Engineer database schema documentation at docs/reference/schema/engineer/database-schema-overview.md
2. ${designAnalysis ? 'Based on design analysis, ' : ''}Identify which tables will be affected by this SD
3. Recommend specific database changes (new tables, new columns, modified columns, new RLS policies)
4. ${designAnalysis ? 'Ensure schema supports all user workflows identified in design analysis' : 'Provide technical_approach recommendations for database integration'}
5. List any schema dependencies or constraints to be aware of

**Output Format**:
{
  "affected_tables": ["table1", "table2"],
  "new_tables": [
    {
      "name": "table_name",
      "purpose": "description",
      "key_columns": ["col1", "col2"]
    }
  ],
  "table_modifications": [
    {
      "table": "existing_table",
      "changes": ["add column x", "modify column y"]
    }
  ],
  "rls_policies_needed": ["policy description 1", "policy description 2"],
  "technical_approach": "Detailed technical approach for database integration",
  "dependencies": ["dependency 1", "dependency 2"],
  "migration_complexity": "LOW|MEDIUM|HIGH",
  "estimated_migration_lines": 50
}

Please analyze and provide structured recommendations.`;

  try {
    const promptFile = path.join(getTempDir(), `db-agent-prompt-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, dbAgentPrompt);

    console.log('📝 Prompt written to:', promptFile);
    console.log('\n🤖 Executing DATABASE sub-agent...\n');

    const dbAgentOutput = execSync(
      `node lib/sub-agent-executor.js DATABASE --context-file "${promptFile}"`,
      {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
        cwd: process.cwd()
      }
    );

    console.log('✅ Database sub-agent analysis complete!\n');
    console.log('─────────────────────────────────────────────────');
    console.log(dbAgentOutput);
    console.log('─────────────────────────────────────────────────\n');

    fs.unlinkSync(promptFile);
    return dbAgentOutput;

  } catch (error) {
    console.warn('⚠️  Database schema analysis failed:', error.message);
    console.log('   Continuing with manual schema review...\n');
    return null;
  }
}

/**
 * Run SECURITY sub-agent analysis
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} sdData - SD data from database
 * @returns {Promise<string|null>} Analysis output or null
 */
export async function runSecurityAnalysis(sdId, sdData) {
  const sdType = sdData.sd_type || sdData.category || 'feature';

  console.log('🔍 Invoking SECURITY sub-agent to analyze security requirements...\n');

  const securityPrompt = `Analyze security requirements for Strategic Directive: ${sdId}

## STRATEGIC DIRECTIVE - SECURITY ANALYSIS CONTEXT

**ID**: ${sdData.id || sdId}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdType}
**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}

${sdData.metadata ? `## SD METADATA\n${formatMetadata(sdData.metadata)}` : ''}

**Task**:
1. Identify authentication requirements (login flows, session management)
2. Analyze authorization needs (roles, permissions, RLS policies)
3. Identify data access boundaries and sensitivity levels
4. Recommend security test scenarios
5. Identify potential security risks and mitigations

**Output Format**:
{
  "auth_requirements": ["requirement1", "requirement2"],
  "authorization_model": {
    "roles": ["role1", "role2"],
    "permissions": ["permission1", "permission2"],
    "rls_policies_needed": ["policy1", "policy2"]
  },
  "data_sensitivity": {
    "sensitive_fields": ["field1", "field2"],
    "protection_mechanisms": ["encryption", "masking"]
  },
  "security_test_scenarios": ["scenario1", "scenario2"],
  "security_risks": [
    {
      "risk": "risk description",
      "mitigation": "mitigation strategy"
    }
  ]
}`;

  try {
    const securityPromptFile = path.join(getTempDir(), `security-agent-prompt-${Date.now()}.txt`);
    fs.writeFileSync(securityPromptFile, securityPrompt);

    console.log('📝 Prompt written to:', securityPromptFile);
    console.log('\n🤖 Executing SECURITY sub-agent...\n');

    const securityOutput = execSync(
      `node lib/sub-agent-executor.js SECURITY --context-file "${securityPromptFile}"`,
      {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
        cwd: process.cwd()
      }
    );

    console.log('✅ Security analysis complete!\n');
    console.log('─────────────────────────────────────────────────');
    console.log(securityOutput);
    console.log('─────────────────────────────────────────────────\n');

    fs.unlinkSync(securityPromptFile);
    return securityOutput;

  } catch (error) {
    console.warn('⚠️  Security analysis failed:', error.message);
    console.log('   Continuing without security analysis...\n');
    return null;
  }
}

/**
 * Run RISK sub-agent analysis
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} sdData - SD data from database
 * @returns {Promise<string|null>} Analysis output or null
 */
export async function runRiskAnalysis(sdId, sdData) {
  const sdType = sdData.sd_type || sdData.category || 'feature';

  console.log('🔍 Invoking RISK sub-agent to assess implementation risks...\n');

  const riskPrompt = `Analyze implementation risks for Strategic Directive: ${sdId}

## STRATEGIC DIRECTIVE - RISK ANALYSIS CONTEXT

**ID**: ${sdData.id || sdId}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdType}
**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}
**Rationale**: ${sdData.rationale || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sdData.strategic_objectives)}

**Dependencies**:
${formatArrayField(sdData.dependencies, 'dependency')}

**Known Risks from SD**:
${formatRisks(sdData.risks)}

${sdData.metadata ? `## SD METADATA\n${formatMetadata(sdData.metadata)}` : ''}

**Task**:
1. Identify technical implementation risks specific to this SD
2. Assess probability and impact of each risk
3. Propose concrete mitigation strategies
4. Define rollback plans for critical changes
5. Suggest monitoring strategies to detect issues early

**Output Format**:
{
  "technical_risks": [
    {
      "risk": "specific risk description",
      "probability": "HIGH|MEDIUM|LOW",
      "impact": "HIGH|MEDIUM|LOW",
      "mitigation": "concrete mitigation strategy",
      "rollback_plan": "rollback approach if this fails",
      "monitoring": "how to detect early warning signs"
    }
  ],
  "dependency_risks": ["risk from dependency 1"],
  "timeline_risks": ["potential delays"],
  "overall_risk_level": "HIGH|MEDIUM|LOW"
}`;

  try {
    const riskPromptFile = path.join(getTempDir(), `risk-agent-prompt-${Date.now()}.txt`);
    fs.writeFileSync(riskPromptFile, riskPrompt);

    console.log('📝 Prompt written to:', riskPromptFile);
    console.log('\n🤖 Executing RISK sub-agent...\n');

    const riskOutput = execSync(
      `node lib/sub-agent-executor.js RISK --context-file "${riskPromptFile}"`,
      {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
        cwd: process.cwd()
      }
    );

    console.log('✅ Risk analysis complete!\n');
    console.log('─────────────────────────────────────────────────');
    console.log(riskOutput);
    console.log('─────────────────────────────────────────────────\n');

    fs.unlinkSync(riskPromptFile);
    return riskOutput;

  } catch (error) {
    console.warn('⚠️  Risk analysis failed:', error.message);
    console.log('   Continuing without risk analysis...\n');
    return null;
  }
}

/**
 * Check if SD needs security analysis
 */
export function needsSecurityAnalysis(sdData) {
  const sdType = sdData.sd_type || sdData.category || 'feature';
  return (
    sdType === 'security' ||
    sdData.scope?.toLowerCase().includes('auth') ||
    sdData.scope?.toLowerCase().includes('security') ||
    sdData.description?.toLowerCase().includes('permission') ||
    sdData.description?.toLowerCase().includes('rls')
  );
}
