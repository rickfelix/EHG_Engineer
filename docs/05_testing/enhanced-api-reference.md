# Enhanced Testing and Debugging Sub-Agents API Reference


## Metadata
- **Category**: API
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, security

## Table of Contents

1. [TestCollaborationCoordinator](#testcollaborationcoordinator)
2. [EnhancedTestingSubAgent](#enhancedtestingsubagent)
3. [EnhancedDebuggingSubAgent](#enhanceddebuggingsubagent)
4. [TestHandoff](#testhandoff)
5. [Interfaces and Types](#interfaces-and-types)
6. [Error Classification](#error-classification)
7. [Fix Generation](#fix-generation)

---

## TestCollaborationCoordinator

The main orchestrator class that manages collaboration between testing and debugging agents.

### Constructor

```javascript
new TestCollaborationCoordinator()
```

Creates a new coordinator instance with embedded testing and debugging agents.

### Methods

#### `async initialize()`

Initializes both testing and debugging agents and sets up event listeners.

**Returns:** `Promise<void>`

**Example:**
```javascript
const coordinator = new TestCollaborationCoordinator();
await coordinator.initialize();
```

#### `on(event: string, handler: Function)`

Registers an event listener for real-time collaboration.

**Parameters:**
- `event` (string): Event name ('test:started', 'test:failed', 'test:passed', 'diagnosis:ready', 'fix:applied')
- `handler` (Function): Event handler function

**Example:**
```javascript
coordinator.on('test:failed', async (failure) => {
  console.log(`Test failed: ${failure.testName}`);
});
```

#### `emit(event: string, data: any)`

Emits an event to all registered listeners.

**Parameters:**
- `event` (string): Event name
- `data` (any): Event payload

#### `async runTestSuite(page: Page, tests: TestDefinition[]): Promise<TestSuiteResults>`

Executes a complete test suite with real-time collaboration between agents.

**Parameters:**
- `page` (Playwright Page): Browser page instance
- `tests` (TestDefinition[]): Array of test definitions

**Returns:** `Promise<TestSuiteResults>`

**TestDefinition Interface:**
```typescript
interface TestDefinition {
  name: string;
  function: () => Promise<void>;
}
```

**TestSuiteResults Interface:**
```typescript
interface TestSuiteResults {
  handoff: TestHandoff;
  diagnosis: DiagnosisReport;
  results: TestResult[];
}
```

**Example:**
```javascript
const results = await coordinator.runTestSuite(page, [
  {
    name: 'Login Test',
    function: async () => {
      const loginButton = await coordinator.testingAgent.findElement(page, [
        { name: 'testId', selector: '[data-testid="login"]' },
        { name: 'text', selector: 'button:has-text("Login")' }
      ]);
      await loginButton.click();
    }
  }
]);
```

#### `async applyFix(fix: FixScript)`

Applies a generated fix script if it's auto-executable.

**Parameters:**
- `fix` (FixScript): Generated fix script

**Returns:** `Promise<void>`

---

## EnhancedTestingSubAgent

Enhanced testing agent with self-healing selectors and comprehensive failure capture.

### Constructor

```javascript
new EnhancedTestingSubAgent()
```

### Properties

- `name`: 'Enhanced Testing Sub-Agent'
- `supabase`: Supabase client instance
- `backstory`: Agent backstory loaded from database
- `currentHandoff`: Current test handoff instance
- `selectorStrategies`: Array of selector strategies

### Methods

#### `async initialize()`

Loads backstory from database and sets up selector strategies.

**Returns:** `Promise<void>`

#### `async findElement(page: Page, selectors: SelectorStrategy[]): Promise<Locator | null>`

Attempts to find an element using multiple selector strategies in order.

**Parameters:**
- `page` (Playwright Page): Browser page instance
- `selectors` (SelectorStrategy[]): Array of selector strategies to try

**Returns:** `Promise<Locator | null>` - Found element or null if all strategies failed

**SelectorStrategy Interface:**
```typescript
interface SelectorStrategy {
  name: string;     // Strategy name (testId, id, text, etc.)
  selector: string; // CSS selector or Playwright selector
}
```

**Example:**
```javascript
const element = await testingAgent.findElement(page, [
  { name: 'testId', selector: '[data-testid="submit-button"]' },
  { name: 'text', selector: 'button:has-text("Submit")' },
  { name: 'type', selector: 'button[type="submit"]' }
]);
```

#### `async runTest(page: Page, testName: string, testFunction: Function): Promise<TestResult>`

Executes a single test with enhanced error handling and context capture.

**Parameters:**
- `page` (Playwright Page): Browser page instance
- `testName` (string): Name of the test
- `testFunction` (Function): Test function to execute

**Returns:** `Promise<TestResult>`

**TestResult Interface:**
```typescript
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: Error;
  retries: number;
}
```

#### `async intelligentRetry(page: Page, test: TestDefinition, maxRetries: number = 3): Promise<TestResult>`

Implements intelligent retry logic with exponential backoff based on error types.

**Parameters:**
- `page` (Playwright Page): Browser page instance
- `test` (TestDefinition): Test to retry
- `maxRetries` (number): Maximum retry attempts (default: 3)

**Returns:** `Promise<TestResult>`

**Retry Strategies:**
```javascript
{
  'TimeoutError': { wait: 2000, multiplier: 2 },
  'NetworkError': { wait: 1000, multiplier: 1.5 },
  'ElementNotFound': { wait: 500, multiplier: 1.2 },
  'Default': { wait: 1000, multiplier: 1.5 }
}
```

#### `createHandoff(testResults: TestResult[]): TestHandoff`

Creates a structured handoff for the debugging agent.

**Parameters:**
- `testResults` (TestResult[]): Array of test results

**Returns:** `TestHandoff` - Finalized handoff object

---

## EnhancedDebuggingSubAgent

Intelligent debugging agent with root cause analysis and fix generation capabilities.

### Constructor

```javascript
new EnhancedDebuggingSubAgent()
```

### Properties

- `name`: 'Enhanced Debugging Sub-Agent'
- `supabase`: Supabase client instance
- `backstory`: Agent backstory loaded from database
- `fixGenerators`: Map of fix generators by error category

### Methods

#### `async initialize()`

Loads backstory and sets up fix generators.

**Returns:** `Promise<void>`

#### `async analyzeHandoff(handoff: TestHandoff): Promise<DiagnosisReport>`

Analyzes a test handoff and provides comprehensive diagnosis with fixes.

**Parameters:**
- `handoff` (TestHandoff): Test handoff from testing agent

**Returns:** `Promise<DiagnosisReport>`

**DiagnosisReport Interface:**
```typescript
interface DiagnosisReport {
  handoffId: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
    flakiness: number;
  };
  issues: IssueAnalysis[];
  recommendations: Recommendation[];
  fixScripts: FixScript[];
}
```

#### `async diagnoseFailure(failure: TestFailure): Promise<IssueAnalysis>`

Diagnoses an individual test failure.

**Parameters:**
- `failure` (TestFailure): Failure object from handoff

**Returns:** `Promise<IssueAnalysis>`

**IssueAnalysis Interface:**
```typescript
interface IssueAnalysis {
  failureId: string;
  testName: string;
  category: 'ELEMENT_NOT_FOUND' | 'TIMEOUT' | 'NETWORK_ERROR' | 'PERMISSION_DENIED' | 'DATABASE_ERROR' | 'UNKNOWN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rootCause: string;
  evidence: Evidence[];
  suggestedFix: string;
}
```

#### `async generateFix(issue: IssueAnalysis): Promise<FixScript | null>`

Generates an executable fix script for the diagnosed issue.

**Parameters:**
- `issue` (IssueAnalysis): Diagnosed issue

**Returns:** `Promise<FixScript | null>`

#### `analyzeError(error: string, stack: string): ErrorAnalysis`

Analyzes error messages and stack traces to categorize failures.

**Parameters:**
- `error` (string): Error message
- `stack` (string): Stack trace

**Returns:** `ErrorAnalysis`

**ErrorAnalysis Interface:**
```typescript
interface ErrorAnalysis {
  category: string;
  rootCause: string;
}
```

#### `calculateSeverity(diagnosis: IssueAnalysis): string`

Calculates severity based on test name and error category.

**Parameters:**
- `diagnosis` (IssueAnalysis): Issue diagnosis

**Returns:** `string` - Severity level ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')

---

## TestHandoff

Structured data format for passing comprehensive failure context between agents.

### Constructor

```javascript
new TestHandoff(testRunId?: string, failures?: TestFailure[])
```

**Parameters:**
- `testRunId` (string, optional): Unique test run identifier
- `failures` (TestFailure[], optional): Initial failures array

### Properties

```typescript
interface TestHandoff {
  testRunId: string;
  failures: TestFailure[];
  timestamp: string;
  context: {
    environment: string;
    browser: string;
    platform: string;
    nodeVersion: string;
  };
  artifacts: {
    screenshots: string[];
    logs: ConsoleLog[];
    har: NetworkArchive | null;
    videos: string[];
  };
  metrics: {
    startTime: number;
    endTime: number | null;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration?: number;
  };
}
```

### Methods

#### `addFailure(failure: TestFailureInput)`

Adds a failure to the handoff with automatic ID generation and timestamping.

**Parameters:**
- `failure` (TestFailureInput): Failure details

**TestFailureInput Interface:**
```typescript
interface TestFailureInput {
  testName: string;
  error: string;
  stack?: string;
  screenshot?: string;
  consoleLogs?: ConsoleLog[];
  networkLogs?: NetworkLog[];
  retries?: number;
}
```

#### `addArtifact(type: string, path: string)`

Adds test artifacts like screenshots, logs, or videos.

**Parameters:**
- `type` (string): Artifact type ('screenshots', 'logs', 'har', 'videos')
- `path` (string): Path to artifact

#### `finalize(): TestHandoff`

Finalizes the handoff by calculating duration and returning the complete object.

**Returns:** `TestHandoff`

---

## Interfaces and Types

### ConsoleLog

```typescript
interface ConsoleLog {
  type: string;        // 'log', 'error', 'warn', 'info'
  text: string;        // Log message
  timestamp: string;   // ISO timestamp
}
```

### NetworkLog

```typescript
interface NetworkLog {
  url: string;         // Request URL
  status: number;      // HTTP status code
  ok: boolean;         // Whether request was successful
  timestamp: string;   // ISO timestamp
}
```

### Evidence

```typescript
interface Evidence {
  type: 'console_errors' | 'network_failures' | 'dom_state' | 'performance';
  data: any;           // Evidence-specific data
}
```

### Recommendation

```typescript
interface Recommendation {
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: 'STABILITY' | 'PERFORMANCE' | 'SECURITY' | 'MAINTENANCE';
  recommendation: string;
  evidence: string;
}
```

### FixScript

```typescript
interface FixScript {
  id: string;               // Unique fix identifier
  type: string;             // Fix category
  description: string;      // Human-readable description
  script?: string;          // Executable script content
  path?: string;            // Path to saved script file
  autoExecutable: boolean;  // Whether safe to auto-execute
  requiresReview: boolean;  // Whether human review needed
  manualSteps?: string[];   // Manual steps if script not applicable
}
```

---

## Error Classification

The system automatically classifies errors using pattern matching:

### Pattern Definitions

```javascript
const errorPatterns = [
  { 
    regex: /not found|cannot find/i, 
    category: 'ELEMENT_NOT_FOUND', 
    rootCause: 'UI element missing or selector incorrect' 
  },
  { 
    regex: /timeout|timed out/i, 
    category: 'TIMEOUT', 
    rootCause: 'Operation exceeded time limit' 
  },
  { 
    regex: /network|fetch|xhr/i, 
    category: 'NETWORK_ERROR', 
    rootCause: 'Network request failed' 
  },
  { 
    regex: /permission|denied|unauthorized/i, 
    category: 'PERMISSION_DENIED', 
    rootCause: 'Insufficient permissions' 
  },
  { 
    regex: /database|sql|postgres/i, 
    category: 'DATABASE_ERROR', 
    rootCause: 'Database operation failed' 
  }
];
```

### Severity Calculation

```javascript
// Critical: Authentication or payment related
if (testName.includes('auth') || testName.includes('payment')) {
  return 'CRITICAL';
}

// High: Network or database errors
if (category === 'NETWORK_ERROR' || category === 'DATABASE_ERROR') {
  return 'HIGH';
}

// Low: UI element issues
if (category === 'ELEMENT_NOT_FOUND') {
  return 'LOW';
}

// Default: Medium
return 'MEDIUM';
```

---

## Fix Generation

The system includes built-in fix generators for common issues:

### Available Fix Generators

- `generateElementNotFoundFix()`: Adds missing testId attributes
- `generateApiTimeoutFix()`: Increases timeout settings
- `generateNetworkErrorFix()`: Network diagnostics checklist
- `generatePermissionFix()`: Permission review steps
- `generateDatabaseFix()`: Database connectivity diagnostics

### Custom Fix Generator

```javascript
class CustomDebuggingAgent extends EnhancedDebuggingSubAgent {
  setupFixGenerators() {
    super.setupFixGenerators();
    
    // Add custom fix generator
    this.fixGenerators['CUSTOM_ERROR'] = this.generateCustomFix.bind(this);
  }
  
  async generateCustomFix(issue) {
    return {
      id: `fix-${issue.failureId}`,
      type: 'CUSTOM_ERROR',
      description: 'Custom fix for specific issue',
      script: `console.log('Custom fix applied');`,
      autoExecutable: true,
      requiresReview: false
    };
  }
}
```

### Fix Script Template

```javascript
const fixTemplate = `#!/usr/bin/env node
/**
 * Auto-generated fix for: ${issue.failureId}
 * Issue: ${issue.category}
 * Test: ${issue.testName}
 */

async function fix() {
  console.log('🔧 Applying fix...');
  
  // Fix implementation here
  
  console.log('✅ Fix applied successfully');
}

fix().catch(console.error);
`;
```

---

## Event System

### Available Events

- `test:started` - Test execution begins
- `test:failed` - Test fails with error details
- `test:passed` - Test completes successfully
- `diagnosis:ready` - Debugging agent completes analysis
- `fix:applied` - Fix script successfully applied
- `test:retry` - Test retry requested

### Event Handlers

```javascript
coordinator.on('test:failed', async (data) => {
  // data contains: { testName, error, screenshot, ... }
  console.log(`Test failed: ${data.testName}`);
  
  // Trigger immediate diagnosis
  const diagnosis = await coordinator.debuggingAgent.diagnoseFailure(data);
  coordinator.emit('diagnosis:ready', diagnosis);
});

coordinator.on('diagnosis:ready', async (diagnosis) => {
  if (diagnosis.severity !== 'CRITICAL' && diagnosis.suggestedFix) {
    // Auto-apply non-critical fixes
    await coordinator.applyFix(diagnosis.suggestedFix);
  }
});
```

---

*Last Updated: 2025-09-04*  
*Version: 1.0.0*  
*Part of LEO Protocol v4.1.2 Enhanced Testing Framework*