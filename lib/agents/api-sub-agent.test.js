/**
 * API Sub-Agent Tests
 * Verifies modular structure and backward compatibility
 *
 * @module api-sub-agent.test
 */

import { describe, it, expect } from 'vitest';
import APISubAgent from './api-sub-agent.js';

// Test backward-compatible imports
import {
  analyzeEndpoints,
  findAPIFiles,
  analyzeAPIDocumentation,
  analyzeAPIStructure,
  analyzeVersioning,
  analyzeAPISecurity,
  analyzeCORS,
  analyzeErrorHandling,
  validateSchemas,
  checkRateLimiting
} from './api-sub-agent.js';

// Test direct domain imports
import {
  analyzeEndpoints as endpointAnalysis,
  findAPIFiles as findFiles
} from './api-sub-agent/domains/endpoint-analysis.js';

import {
  analyzeAPIDocumentation as docAnalysis
} from './api-sub-agent/domains/documentation-analysis.js';

describe('API Sub-Agent - Backward Compatibility', () => {
  it('should export APISubAgent class as default', () => {
    expect(APISubAgent).toBeDefined();
    expect(typeof APISubAgent).toBe('function');
  });

  it('should have prototype methods defined', () => {
    // Check prototype instead of instantiating (due to budget enforcement)
    expect(typeof APISubAgent.prototype.intelligentAnalyze).toBe('function');
    expect(typeof APISubAgent.prototype.detectAPIFramework).toBe('function');
    expect(typeof APISubAgent.prototype.detectAPIPatterns).toBe('function');
  });

  it('should extend IntelligentBaseSubAgent', () => {
    // Verify class hierarchy by checking prototype chain
    const proto = Object.getPrototypeOf(APISubAgent.prototype);
    expect(proto.constructor.name).toBe('IntelligentBaseSubAgent');
  });
});

describe('API Sub-Agent - Domain Function Exports', () => {
  it('should export analyzeEndpoints function', () => {
    expect(analyzeEndpoints).toBeDefined();
    expect(typeof analyzeEndpoints).toBe('function');
  });

  it('should export findAPIFiles function', () => {
    expect(findAPIFiles).toBeDefined();
    expect(typeof findAPIFiles).toBe('function');
  });

  it('should export analyzeAPIDocumentation function', () => {
    expect(analyzeAPIDocumentation).toBeDefined();
    expect(typeof analyzeAPIDocumentation).toBe('function');
  });

  it('should export analyzeAPIStructure function', () => {
    expect(analyzeAPIStructure).toBeDefined();
    expect(typeof analyzeAPIStructure).toBe('function');
  });

  it('should export analyzeVersioning function', () => {
    expect(analyzeVersioning).toBeDefined();
    expect(typeof analyzeVersioning).toBe('function');
  });

  it('should export analyzeAPISecurity function', () => {
    expect(analyzeAPISecurity).toBeDefined();
    expect(typeof analyzeAPISecurity).toBe('function');
  });

  it('should export analyzeCORS function', () => {
    expect(analyzeCORS).toBeDefined();
    expect(typeof analyzeCORS).toBe('function');
  });

  it('should export analyzeErrorHandling function', () => {
    expect(analyzeErrorHandling).toBeDefined();
    expect(typeof analyzeErrorHandling).toBe('function');
  });

  it('should export validateSchemas function', () => {
    expect(validateSchemas).toBeDefined();
    expect(typeof validateSchemas).toBe('function');
  });

  it('should export checkRateLimiting function', () => {
    expect(checkRateLimiting).toBeDefined();
    expect(typeof checkRateLimiting).toBe('function');
  });
});

describe('API Sub-Agent - Direct Domain Imports', () => {
  it('should export same functions from domain modules', () => {
    expect(endpointAnalysis).toBeDefined();
    expect(typeof endpointAnalysis).toBe('function');

    expect(findFiles).toBeDefined();
    expect(typeof findFiles).toBe('function');

    expect(docAnalysis).toBeDefined();
    expect(typeof docAnalysis).toBe('function');
  });

  it('should reference same function instances', () => {
    // Functions from main export should be same as domain exports
    expect(analyzeEndpoints).toBe(endpointAnalysis);
    expect(findAPIFiles).toBe(findFiles);
    expect(analyzeAPIDocumentation).toBe(docAnalysis);
  });
});

describe('API Sub-Agent - Structure Analysis', () => {
  it('should detect inconsistent naming', () => {
    const mockApiHealth = {
      endpoints: [
        { route: '/api/user_profile' },
        { route: '/api/user-settings' }
      ]
    };
    const findings = [];
    const addFinding = (f) => findings.push(f);

    analyzeAPIStructure(mockApiHealth, addFinding);

    const namingFinding = findings.find(f => f.type === 'INCONSISTENT_ROUTE_NAMING');
    expect(namingFinding).toBeDefined();
    expect(namingFinding.severity).toBe('low');
  });

  it('should detect deeply nested routes', () => {
    const mockApiHealth = {
      endpoints: [
        { route: '/api/v1/org/team/project/resource/action' }
      ]
    };
    const findings = [];
    const addFinding = (f) => findings.push(f);

    analyzeAPIStructure(mockApiHealth, addFinding);

    const nestingFinding = findings.find(f => f.type === 'DEEPLY_NESTED_ROUTES');
    expect(nestingFinding).toBeDefined();
    expect(nestingFinding.severity).toBe('medium');
  });
});

describe('API Sub-Agent - Versioning Analysis', () => {
  it('should detect missing API versioning', () => {
    const mockApiHealth = {
      endpoints: [
        { route: '/api/users' },
        { route: '/api/products' },
        { route: '/api/orders' },
        { route: '/api/invoices' },
        { route: '/api/reports' },
        { route: '/api/settings' }
      ],
      versionedEndpoints: 0
    };
    const findings = [];
    const addFinding = (f) => findings.push(f);

    analyzeVersioning(mockApiHealth, addFinding);

    const versionFinding = findings.find(f => f.type === 'MISSING_API_VERSIONING');
    expect(versionFinding).toBeDefined();
    expect(versionFinding.severity).toBe('high');
  });

  it('should not flag versioned APIs', () => {
    const mockApiHealth = {
      endpoints: [
        { route: '/api/v1/users' },
        { route: '/api/v1/products' }
      ],
      versionedEndpoints: 0
    };
    const findings = [];
    const addFinding = (f) => findings.push(f);

    analyzeVersioning(mockApiHealth, addFinding);

    expect(mockApiHealth.versionedEndpoints).toBe(2);
    const versionFinding = findings.find(f => f.type === 'MISSING_API_VERSIONING');
    expect(versionFinding).toBeUndefined();
  });
});
