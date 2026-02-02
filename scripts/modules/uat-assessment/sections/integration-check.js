/**
 * UAT Assessment Template - Integration Check Section
 * Section 4: Frontend-backend mapping, cross-component communication
 *
 * Updated by SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001:
 * - Now reads from product_requirements_v2.integration_operationalization
 * - Validates consumer presence for infrastructure SDs
 * - Checks dependency entries for required fields
 *
 * @module uat-assessment/sections/integration-check
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Required fields for dependency entries (FR-4)
 */
const REQUIRED_DEPENDENCY_FIELDS = ['name', 'direction', 'failure_mode'];

/**
 * Minimum justification length for infrastructure SDs with no consumers (FR-4)
 */
const MIN_JUSTIFICATION_LENGTH = 30;

/**
 * Static template for backward compatibility
 */
export const integrationCheckSection = `
## 4. INTEGRATION CHECK

### Frontend-Backend Mapping Table

| Feature | UI Component | Backend Service | Data Source | Integration Status | Verification Needed |
|---------|--------------|-----------------|-------------|-------------------|-------------------|
| **Authentication** | ProtectedRoute | Supabase Auth | auth.users | Connected | [ ] Test unauthorized access |
| **Navigation** | ModernNavigationSidebar | Static config | navigationItems array | Functional | [ ] Verify active state |
| **Company Filter** | CompanySelector | useCompanies hook | companies table | Connected | [ ] Test filter propagation |
| **Portfolio Value** | MetricCard | usePortfolioMetrics | ventures table | Connected | [ ] Verify calculation accuracy |
| **Active Ventures** | MetricCard | usePortfolioMetrics | ventures table | Connected | [ ] Verify count logic |
| **Success Rate** | MetricCard | usePortfolioMetrics | ventures table | Connected | [ ] Verify percentage calc |
| **At Risk Count** | MetricCard | usePortfolioMetrics | ventures table | Connected | [ ] Verify risk criteria |
| **Priority Alerts** | ExecutiveAlerts | useExecutiveAlertsUnified | chairman_feedback, ventures, compliance_violations | Connected | [ ] Test real-time updates |
| **Performance Cycle** | PerformanceDriveCycle | Unknown hook | Unknown table | Unknown | [X] **VERIFY BACKEND** |
| **AI Insights** | AIInsightsEngine | Unknown service | AI/ML endpoint? | Unknown | [X] **VERIFY BACKEND** |
| **Synergy Ops** | SynergyOpportunities | Unknown hook | ventures analysis? | Unknown | [X] **VERIFY BACKEND** |
| **Stage Counts** | Hard-coded divs | **NONE** | **STUBBED** | Not Connected | [X] **REPLACE WITH DYNAMIC QUERY** |
| **Team Utilization** | Hard-coded Progress | **NONE** | **STUBBED** | Not Connected | [X] **CONNECT TO RESOURCE DATA** |
| **Portfolio Tab** | VenturePortfolioOverview | Unknown hook | ventures table? | Unknown | [X] **VERIFY BACKEND** |
| **KPIs Tab** | StrategicKPIMonitor | Unknown hook | kpis table? | Unknown | [X] **VERIFY BACKEND** |
| **Financial Tab** | FinancialAnalytics | Unknown hook | financial_data table? | Unknown | [X] **VERIFY BACKEND** |
| **Operations Tab** | OperationalIntelligence | Unknown hook | operational_metrics? | Unknown | [X] **VERIFY BACKEND** |
| **Intelligence Tab** | AIInsightsEngine + Placeholder | Partial | Mixed | Mixed | [X] **COMPLETE OR REMOVE PLACEHOLDER** |
| **Export Report** | Button | Unknown | Unknown | Unknown | [X] **VERIFY FUNCTIONALITY** |
| **Configure** | Button | Unknown | Unknown | Unknown | [X] **VERIFY FUNCTIONALITY** |

### Cross-Component Communication

#### Verified Communication Paths
1. **CompanySelector -> ExecutiveOverviewCards**: \`companyId\` prop -> \`usePortfolioMetrics(companyId)\`
2. **CompanySelector -> ExecutiveAlerts**: \`companyId\` prop -> \`useExecutiveAlertsUnified(companyId)\`
3. **CompanySelector -> PerformanceDriveCycle**: \`companyId\` prop passed
4. **CompanySelector -> SynergyOpportunities**: \`companyId\` prop passed
5. **Tab State -> Content**: Managed by Shadcn Tabs component (controlled)

#### Needs Verification
- [ ] Does CompanySelector state persist across tab changes?
- [ ] Do all 6 tabs respect the company filter?
- [ ] Do metric cards update immediately when company changes?
- [ ] Are there loading states during company filter transitions?

---`;

/**
 * Fetch integration data from PRD for a given SD
 *
 * FR-4: Reads integration_operationalization from product_requirements_v2
 * as the sole source for integration checks.
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Optional Supabase client (will create if not provided)
 * @returns {Promise<Object>} Integration data and PRD reference
 */
export async function fetchIntegrationDataFromPRD(sdId, supabase = null) {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return { error: 'Supabase credentials not configured', data: null };
    }
    supabase = createClient(url, key);
  }

  try {
    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('id, integration_operationalization, sd_id')
      .eq('sd_id', sdId)
      .single();

    if (error) {
      return { error: error.message, data: null, prdId: null };
    }

    return {
      error: null,
      data: prd?.integration_operationalization || null,
      prdId: prd?.id || null
    };
  } catch (err) {
    return { error: err.message, data: null, prdId: null };
  }
}

/**
 * Validate consumer presence for infrastructure SDs (FR-4)
 *
 * If consumers subsection indicates zero consumers (empty list or explicit "none"),
 * returns a failing result unless the PRD includes an explicit justification field
 * with >= 30 non-whitespace characters.
 *
 * @param {Object} integrationData - The integration_operationalization content
 * @param {string} sdType - The SD type
 * @returns {Object} Validation result
 */
export function validateConsumerPresence(integrationData, sdType) {
  const result = {
    passed: true,
    hasConsumers: false,
    hasJustification: false,
    justificationLength: 0,
    message: null
  };

  if (!integrationData || sdType !== 'infrastructure') {
    return result;
  }

  const consumers = integrationData.consumers;

  // Check if consumers exist
  if (!consumers) {
    result.hasConsumers = false;
  } else if (Array.isArray(consumers)) {
    result.hasConsumers = consumers.length > 0;
  } else if (typeof consumers === 'object') {
    // Check for explicit "none" indicator
    const consumerList = consumers.list || consumers.items || [];
    result.hasConsumers = Array.isArray(consumerList) && consumerList.length > 0;

    // Check for justification field
    const justification = consumers.justification || '';
    const trimmedJustification = justification.replace(/\s+/g, '');
    result.justificationLength = trimmedJustification.length;
    result.hasJustification = result.justificationLength >= MIN_JUSTIFICATION_LENGTH;
  }

  // FR-4: Fail if no consumers AND no valid justification for infrastructure SDs
  if (!result.hasConsumers && !result.hasJustification) {
    result.passed = false;
    result.message = 'Infrastructure SD has no consumers defined and no justification provided. ' +
      'Either add consumers to the integration section or provide a justification ' +
      `(min ${MIN_JUSTIFICATION_LENGTH} characters) in consumers.justification.`;
  }

  return result;
}

/**
 * Validate dependency entries have required fields (FR-4)
 *
 * If dependencies subsection lists external systems, verifies each entry
 * includes: name, direction (upstream/downstream), and failure_mode fields.
 *
 * @param {Object} integrationData - The integration_operationalization content
 * @returns {Object} Validation result with missing fields
 */
export function validateDependencyEntries(integrationData) {
  const result = {
    passed: true,
    dependencies: [],
    warnings: []
  };

  if (!integrationData || !integrationData.dependencies) {
    return result;
  }

  const dependencies = Array.isArray(integrationData.dependencies)
    ? integrationData.dependencies
    : [];

  for (const dep of dependencies) {
    const missingFields = REQUIRED_DEPENDENCY_FIELDS.filter(f => !dep[f] || dep[f] === '');

    result.dependencies.push({
      name: dep.name || 'unnamed',
      direction: dep.direction || 'unspecified',
      missingFields
    });

    if (missingFields.length > 0) {
      result.warnings.push(
        `Dependency "${dep.name || 'unnamed'}" missing fields: ${missingFields.join(', ')}`
      );
    }
  }

  return result;
}

/**
 * Run full integration check for UAT assessment
 *
 * FR-4: Uses integration_operationalization as sole source for integration checks.
 * Returns comprehensive result with PRD reference and subsection validation.
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} sdType - SD type for consumer validation rules
 * @param {Object} supabase - Optional Supabase client
 * @returns {Promise<Object>} Full integration check result
 */
export async function runIntegrationCheck(sdId, sdType = 'feature', supabase = null) {
  const result = {
    passed: true,
    prdId: null,
    subsectionsUsed: [],
    consumerValidation: null,
    dependencyValidation: null,
    errors: [],
    warnings: []
  };

  // Fetch integration data from PRD
  const { data, error, prdId } = await fetchIntegrationDataFromPRD(sdId, supabase);
  result.prdId = prdId;

  if (error) {
    result.errors.push(`Failed to fetch integration data: ${error}`);
    result.passed = false;
    return result;
  }

  if (!data) {
    result.warnings.push('No integration_operationalization data found in PRD');
    return result;
  }

  // Track which subsections were used
  result.subsectionsUsed = Object.keys(data).filter(k =>
    ['consumers', 'dependencies', 'data_contracts', 'runtime_config', 'observability_rollout'].includes(k)
  );

  // FR-4: Validate consumer presence for infrastructure SDs
  result.consumerValidation = validateConsumerPresence(data, sdType);
  if (!result.consumerValidation.passed) {
    result.passed = false;
    result.errors.push(result.consumerValidation.message);
  }

  // FR-4: Validate dependency entries
  result.dependencyValidation = validateDependencyEntries(data);
  result.warnings.push(...result.dependencyValidation.warnings);

  return result;
}

/**
 * Generate dynamic integration check section based on PRD data
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} sdType - SD type
 * @param {Object} supabase - Optional Supabase client
 * @returns {Promise<string>} Markdown section content
 */
export async function generateIntegrationCheckSection(sdId, sdType = 'feature', supabase = null) {
  const checkResult = await runIntegrationCheck(sdId, sdType, supabase);

  let section = `
## 4. INTEGRATION CHECK (PRD-Sourced)

**PRD Reference**: ${checkResult.prdId || 'Not found'}
**Subsections Used**: ${checkResult.subsectionsUsed.join(', ') || 'None'}

### Validation Results

| Check | Status | Details |
|-------|--------|---------|
| PRD Integration Data | ${checkResult.prdId ? '✅' : '⚠️'} | ${checkResult.prdId ? 'Found' : 'Missing or not fetched'} |
| Consumer Presence | ${checkResult.consumerValidation?.passed ? '✅' : '❌'} | ${checkResult.consumerValidation?.message || 'Validated'} |
| Dependency Fields | ${checkResult.dependencyValidation?.warnings.length === 0 ? '✅' : '⚠️'} | ${checkResult.dependencyValidation?.warnings.length || 0} warnings |

`;

  if (checkResult.errors.length > 0) {
    section += '\n### Errors\n';
    checkResult.errors.forEach(e => {
      section += `- ❌ ${e}\n`;
    });
  }

  if (checkResult.warnings.length > 0) {
    section += '\n### Warnings\n';
    checkResult.warnings.forEach(w => {
      section += `- ⚠️ ${w}\n`;
    });
  }

  // Add static template for additional checks
  section += `\n${integrationCheckSection}`;

  return section;
}
