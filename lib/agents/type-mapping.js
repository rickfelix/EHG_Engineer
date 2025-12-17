/**
 * Type Mapping System
 * Maps agent-specific finding types to standardized fix types
 * Solves the integration problem without rewriting all agents
 */

class TypeMapper {
  constructor() {
    // Map various security finding types to fix engine types
    this.securityTypeMap = {
      // Direct mappings
      'HARDCODED_SECRET': 'HARDCODED_SECRET',
      'SQL_INJECTION': 'SQL_INJECTION',
      'XSS_VULNERABILITY': 'XSS_VULNERABILITY',
      'INSECURE_RANDOM': 'INSECURE_RANDOM',
      'MISSING_VALIDATION': 'MISSING_VALIDATION',
      'WEAK_CRYPTO': 'WEAK_CRYPTO',
      'PATH_TRAVERSAL': 'PATH_TRAVERSAL',
      
      // SecuritySubAgentV3 specific types -> Fix engine types
      'SENSITIVE_DATA_LOGGING': 'HARDCODED_SECRET', // Treat as secret exposure
      'SECRET': 'HARDCODED_SECRET',
      'HARDCODED_API_KEY': 'HARDCODED_SECRET',
      'HARDCODED_TOKEN': 'HARDCODED_SECRET',
      'EXPOSED_CREDENTIAL': 'HARDCODED_SECRET',
      'XSS': 'XSS_VULNERABILITY',
      'SQLI': 'SQL_INJECTION',
      'WEAK_HASH': 'WEAK_CRYPTO',
      'INSUFFICIENT_VALIDATION': 'MISSING_VALIDATION'
    };
    
    this.performanceTypeMap = {
      'N_PLUS_ONE_QUERY': 'N_PLUS_ONE_QUERY',
      'DOM_QUERY_IN_LOOP': 'DOM_QUERY_IN_LOOP',
      'MISSING_MEMO': 'MISSING_MEMO',
      'UNNECESSARY_RERENDER': 'UNNECESSARY_RERENDER',
      'MEMORY_LEAK': 'MEMORY_LEAK',
      'BLOCKING_OPERATION': 'BLOCKING_OPERATION',
      
      // Performance pattern groupings
      'DOM_IN_LOOP_PATTERN': 'DOM_QUERY_IN_LOOP',
      'REACT_OPTIMIZATION': 'MISSING_MEMO',
      'ASYNC_BLOCKING': 'BLOCKING_OPERATION'
    };
    
    this.designTypeMap = {
      'MISSING_ALT_TEXT': 'MISSING_ALT_TEXT',
      'COLOR_CONTRAST': 'COLOR_CONTRAST',
      'MISSING_ARIA': 'MISSING_ARIA',
      'KEYBOARD_NAV': 'KEYBOARD_NAV',
      'RESPONSIVE_ISSUE': 'RESPONSIVE_ISSUE',
      
      // Design sub-agent variations
      'ACCESSIBILITY_ALT': 'MISSING_ALT_TEXT',
      'WCAG_CONTRAST': 'COLOR_CONTRAST',
      'KEYBOARD_TRAP': 'MISSING_ARIA',
      'MISSING_FORM_LABELS': 'MISSING_ARIA',
      'HEADING_SKIP': 'MISSING_ARIA'
    };
    
    this.databaseTypeMap = {
      'MISSING_INDEX': 'MISSING_INDEX',
      'SLOW_QUERY': 'SLOW_QUERY',
      'MISSING_CONSTRAINT': 'MISSING_CONSTRAINT',
      'DENORMALIZATION': 'DENORMALIZATION',
      
      // Database patterns
      'N_PLUS_ONE': 'N_PLUS_ONE_QUERY',
      'INEFFICIENT_QUERY': 'SLOW_QUERY',
      'MISSING_FK': 'MISSING_CONSTRAINT'
    };
    
    this.testingTypeMap = {
      'MISSING_TEST': 'MISSING_TEST',
      'LOW_COVERAGE': 'LOW_COVERAGE',
      'FLAKY_TEST': 'FLAKY_TEST',
      'NO_ASSERTIONS': 'NO_ASSERTIONS',
      'LOW_TEST_COVERAGE': 'LOW_COVERAGE',
      'NO_COVERAGE_DATA': 'LOW_COVERAGE',
      'LOW_ASSERTION_DENSITY': 'NO_ASSERTIONS',
      'SKIPPED_TESTS': 'FLAKY_TEST',
      'CONSOLE_LOG_IN_TESTS': 'FLAKY_TEST',
      'ASYNC_WITHOUT_AWAIT': 'FLAKY_TEST',
      'LONG_TEST_TIMEOUT': 'FLAKY_TEST',
      'CRITICAL_FILES_UNTESTED': 'MISSING_TEST',
      'LOW_TEST_RATIO': 'MISSING_TEST',
      'MISSING_E2E_TESTS': 'MISSING_TEST',
      'EMPTY_E2E_DIRECTORY': 'MISSING_TEST',
      'FLAKY_TEST_PATTERN': 'FLAKY_TEST',
      'SLOW_TEST_DISCOVERY': 'FLAKY_TEST',
      'NO_TEST_FRAMEWORK': 'MISSING_TEST'
    };
    
    this.documentationTypeMap = {
      'MISSING_DOCUMENTATION': 'MISSING_DOCUMENTATION',
      'OUTDATED_DOCUMENTATION': 'OUTDATED_DOCUMENTATION',
      'BROKEN_LINK': 'BROKEN_LINK',
      'INVALID_CODE_EXAMPLE': 'INVALID_CODE_EXAMPLE',
      
      // Documentation-specific types
      'INCOMPLETE_DOCUMENTATION': 'MISSING_DOCUMENTATION',
      'INVALID_IMPORT_IN_EXAMPLE': 'INVALID_CODE_EXAMPLE',
      'LOW_CODE_EXAMPLE_QUALITY': 'INVALID_CODE_EXAMPLE',
      'MISSING_README_SECTIONS': 'MISSING_DOCUMENTATION',
      'API_DOCS_WITHOUT_EXAMPLES': 'MISSING_DOCUMENTATION',
      'UNDOCUMENTED_SCRIPTS': 'MISSING_DOCUMENTATION',
      'UNDOCUMENTED_API_ENDPOINT': 'MISSING_DOCUMENTATION',
      'MINIMAL_README': 'MISSING_DOCUMENTATION',
      'NO_BADGES': 'MISSING_DOCUMENTATION',
      'MISSING_SETUP_INSTRUCTIONS': 'MISSING_DOCUMENTATION',
      'MISSING_README': 'MISSING_DOCUMENTATION',
      'UNDOCUMENTED_PUBLIC_API': 'MISSING_DOCUMENTATION',
      'MISSING_API_DOCUMENTATION': 'MISSING_DOCUMENTATION',
      'API_NOT_DOCUMENTED_IN_README': 'MISSING_DOCUMENTATION',
      'MISSING_API_VERSION': 'MISSING_DOCUMENTATION',
      'MISSING_API_INFO': 'MISSING_DOCUMENTATION',
      'EMPTY_API_SPECIFICATION': 'MISSING_DOCUMENTATION',
      'INVALID_API_SPECIFICATION': 'BROKEN_LINK',
      'INCOMPLETE_API_DOCUMENTATION': 'MISSING_DOCUMENTATION'
    };
    
    this.apiTypeMap = {
      'API_ENDPOINT_ERROR': 'API_ENDPOINT_ERROR',
      'MISSING_AUTHENTICATION': 'MISSING_AUTHENTICATION',
      'MISSING_VALIDATION': 'MISSING_VALIDATION',
      'INSECURE_API': 'INSECURE_API',
      
      // API-specific types
      'NO_API_ENDPOINTS': 'API_ENDPOINT_ERROR',
      'MISSING_INPUT_VALIDATION': 'MISSING_VALIDATION',
      'MISSING_ERROR_HANDLING': 'API_ENDPOINT_ERROR',
      'SQL_INJECTION_RISK': 'SQL_INJECTION',
      'INCORRECT_STATUS_CODE': 'API_ENDPOINT_ERROR',
      'MISSING_RATE_LIMITING': 'API_ENDPOINT_ERROR',
      'INCOMPLETE_GRAPHQL_SCHEMA': 'API_ENDPOINT_ERROR',
      'GRAPHQL_N_PLUS_ONE': 'N_PLUS_ONE_QUERY',
      'MISSING_API_DOCUMENTATION': 'MISSING_DOCUMENTATION',
      'INVALID_API_SPECIFICATION': 'API_ENDPOINT_ERROR',
      'EMPTY_API_SPECIFICATION': 'API_ENDPOINT_ERROR',
      'INCOMPLETE_API_DOCUMENTATION': 'MISSING_DOCUMENTATION',
      'INCONSISTENT_ROUTE_NAMING': 'API_ENDPOINT_ERROR',
      'NON_RESTFUL_RESOURCE_NAMING': 'API_ENDPOINT_ERROR',
      'DEEPLY_NESTED_ROUTES': 'API_ENDPOINT_ERROR',
      'HARDCODED_API_KEY': 'HARDCODED_SECRET',
      'INSECURE_CORS': 'INSECURE_API',
      'INSECURE_HTTP': 'INSECURE_API',
      'INADEQUATE_ERROR_HANDLING': 'API_ENDPOINT_ERROR',
      'MISSING_SCHEMA_VALIDATION': 'MISSING_VALIDATION',
      'MISSING_API_VERSIONING': 'API_ENDPOINT_ERROR',
      'MISSING_CORS_CONFIGURATION': 'INSECURE_API'
    };
    
    this.dependencyTypeMap = {
      'VULNERABILITY': 'VULNERABILITY',
      'OUTDATED_DEPENDENCY': 'OUTDATED_DEPENDENCY',
      'UNUSED_DEPENDENCY': 'UNUSED_DEPENDENCY',
      'LICENSE_ISSUE': 'LICENSE_ISSUE',
      
      // Dependency-specific types
      'MISSING_PACKAGE_JSON': 'MISSING_DEPENDENCY_CONFIG',
      'INCOMPLETE_PACKAGE_JSON': 'MISSING_DEPENDENCY_CONFIG',
      'DEV_DEPENDENCIES_IN_PRODUCTION': 'DEPENDENCY_MISCONFIGURATION',
      'MISSING_ENGINES_FIELD': 'MISSING_DEPENDENCY_CONFIG',
      'UNPINNED_SECURITY_PACKAGE': 'VULNERABILITY',
      'TOO_MANY_DEPENDENCIES': 'DEPENDENCY_BLOAT',
      'SECURITY_VULNERABILITY': 'VULNERABILITY',
      'VULNERABILITY_THRESHOLD_EXCEEDED': 'VULNERABILITY',
      'AUDIT_FAILED': 'DEPENDENCY_AUDIT_ERROR',
      'OUTDATED_SECURITY_PACKAGE': 'OUTDATED_DEPENDENCY',
      'TOO_MANY_MAJOR_OUTDATED': 'OUTDATED_DEPENDENCY',
      'PROBLEMATIC_LICENSE': 'LICENSE_ISSUE',
      'UNKNOWN_LICENSES': 'LICENSE_ISSUE',
      'MISSING_PROJECT_LICENSE': 'LICENSE_ISSUE',
      'UNUSED_DEPENDENCIES': 'UNUSED_DEPENDENCY',
      'HEAVY_DEPENDENCY': 'DEPENDENCY_BLOAT',
      'DUPLICATE_FUNCTIONALITY': 'DEPENDENCY_BLOAT',
      'DEPENDENCY_DUPLICATES': 'DEPENDENCY_BLOAT',
      'DEPRECATED_PACKAGE': 'OUTDATED_DEPENDENCY',
      'DEEP_DEPENDENCY_TREE': 'DEPENDENCY_BLOAT',
      'MISSING_LOCK_FILE': 'MISSING_DEPENDENCY_CONFIG',
      'OUTDATED_LOCK_FILE': 'DEPENDENCY_MISCONFIGURATION'
    };
  }
  
  /**
   * Map a finding type to its fix engine equivalent
   */
  mapType(finding) {
    const agent = finding.agent?.toLowerCase();
    const type = finding.type;
    
    let typeMap;
    switch(agent) {
      case 'security':
        typeMap = this.securityTypeMap;
        break;
      case 'performance':
        typeMap = this.performanceTypeMap;
        break;
      case 'design':
        typeMap = this.designTypeMap;
        break;
      case 'database':
        typeMap = this.databaseTypeMap;
        break;
      case 'testing':
        typeMap = this.testingTypeMap;
        break;
      case 'documentation':
        typeMap = this.documentationTypeMap;
        break;
      case 'api':
        typeMap = this.apiTypeMap;
        break;
      case 'dependencies':
        typeMap = this.dependencyTypeMap;
        break;
      default:
        return type; // Return unchanged if unknown agent
    }
    
    // Return mapped type or original if no mapping exists
    return typeMap[type] || type;
  }
  
  /**
   * Prepare finding for fix engine
   */
  prepareFindingForFix(finding) {
    // Ensure finding has the right structure
    const prepared = {
      ...finding,
      originalType: finding.type,
      type: this.mapType(finding)
    };
    
    // Ensure location exists (BaseSubAgent should have created this)
    if (!prepared.location) {
      prepared.location = {
        file: finding.file || null,
        line: finding.line || null,
        snippet: finding.snippet || null
      };
    }
    
    // Add metadata if missing
    if (!prepared.metadata) {
      prepared.metadata = {};
    }
    
    // Extract variable names from snippets for secret fixes
    if (prepared.type === 'HARDCODED_SECRET' && prepared.location.snippet) {
      const varMatch = /(?:const|let|var)\s+(\w+)\s*=/.exec(prepared.location.snippet);
      if (varMatch) {
        prepared.metadata.variable = varMatch[1];
        prepared.metadata.envVar = varMatch[1].toUpperCase();
      }
    }
    
    return prepared;
  }
  
  /**
   * Check if a type is fixable
   */
  isFixable(finding) {
    const mappedType = this.mapType(finding);
    const fixableTypes = [
      'HARDCODED_SECRET', 'XSS_VULNERABILITY', 'SQL_INJECTION',
      'INSECURE_RANDOM', 'MISSING_VALIDATION', 'WEAK_CRYPTO',
      'PATH_TRAVERSAL', 'N_PLUS_ONE_QUERY', 'DOM_QUERY_IN_LOOP',
      'MISSING_MEMO', 'UNNECESSARY_RERENDER', 'MEMORY_LEAK',
      'BLOCKING_OPERATION', 'MISSING_ALT_TEXT', 'COLOR_CONTRAST',
      'MISSING_ARIA', 'KEYBOARD_NAV', 'RESPONSIVE_ISSUE',
      'MISSING_INDEX', 'SLOW_QUERY', 'MISSING_CONSTRAINT',
      'MISSING_TEST', 'LOW_COVERAGE', 'FLAKY_TEST', 'NO_ASSERTIONS'
    ];
    
    return fixableTypes.includes(mappedType);
  }
  
  /**
   * Get fix confidence based on type
   */
  getFixConfidence(finding) {
    const mappedType = this.mapType(finding);
    
    // High confidence fixes
    const highConfidence = [
      'HARDCODED_SECRET', 'MISSING_ALT_TEXT', 'MISSING_ARIA',
      'DOM_QUERY_IN_LOOP', 'MISSING_INDEX'
    ];
    
    // Medium confidence fixes
    const mediumConfidence = [
      'XSS_VULNERABILITY', 'SQL_INJECTION', 'MISSING_MEMO',
      'COLOR_CONTRAST', 'KEYBOARD_NAV'
    ];
    
    if (highConfidence.includes(mappedType)) return 0.9;
    if (mediumConfidence.includes(mappedType)) return 0.7;
    return 0.5;
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance of TypeMapper
 */
function getInstance() {
  if (!instance) {
    instance = new TypeMapper();
  }
  return instance;
}

export { TypeMapper, getInstance };