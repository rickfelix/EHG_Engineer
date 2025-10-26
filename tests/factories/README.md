# Test Data Factories

**Version**: 1.0.0
**Task**: B1.2 - Test Data Factory
**Phase**: Phase 1, Week 1 (Testing Infrastructure & Coverage)

## Overview

Test Data Factories provide a fluent API for creating realistic test data with minimal boilerplate. Built on the builder pattern, factories enable clean, maintainable test data creation with automatic cleanup.

## Benefits

1. **Fluent API**: Readable, chainable method calls
2. **Realistic Data**: Pre-configured realistic defaults
3. **Automatic Cleanup**: Track and clean up created records
4. **Relationship Management**: Automatically create related objects
5. **Flexible**: Override any attribute, use traits, or create custom scenarios
6. **Type-Safe**: Clear method names and return types

## Files

### Core Factories

#### base-factory.js
- `BaseFactory`: Foundation class with common patterns
- `Sequence`: Generate unique sequential values
- `TraitManager`: Reusable attribute sets
- `DataGenerators`: Realistic data generation

#### directive-factory.js
- `DirectiveFactory`: Create strategic directives
- `DirectiveTraits`: Common directive scenarios

#### prd-factory.js
- `PRDFactory`: Create product requirements
- `PRDTraits`: Common PRD scenarios

#### user-story-factory.js
- `UserStoryFactory`: Create user stories
- `UserStoryTraits`: Common story scenarios

#### fixtures.js
- `Fixtures`: Pre-configured complete scenarios
- `FixtureCleanup`: Helper for cleaning up fixtures

## Quick Start

### Basic Usage

```javascript
import { DirectiveFactory } from '../factories/directive-factory.js';

test('create directive', async () => {
  const factory = DirectiveFactory.create();

  const directive = await factory
    .withTitle('My Test Directive')
    .inPlanPhase()
    .withHighPriority()
    .build();

  // Use directive in test
  expect(directive.title).toBe('My Test Directive');
  expect(directive.phase).toBe('PLAN');

  // Cleanup
  await factory.cleanup();
});
```

### Using Fixtures

```javascript
import { Fixtures, FixtureCleanup } from '../factories/fixtures.js';

test('complete workflow', async () => {
  const cleanup = new FixtureCleanup();

  try {
    const data = await Fixtures.completeWorkflow();
    cleanup.track(data);

    // Test has directive + PRD + 5 user stories ready
    expect(data.prd).toBeDefined();
    expect(data.user_stories).toHaveLength(5);
  } finally {
    await cleanup.cleanup();
  }
});
```

## Factory Examples

### DirectiveFactory

```javascript
import { DirectiveFactory } from '../factories/directive-factory.js';

// Simple directive
const directive = await DirectiveFactory.create()
  .withTitle('Simple Directive')
  .inLeadPhase()
  .build();

// Directive with PRD
const { directive, prd } = await DirectiveFactory.create()
  .withTitle('Directive with PRD')
  .inPlanPhase()
  .withPRD({
    title: 'Custom PRD Title',
    objectives: ['Objective 1', 'Objective 2'],
  });

// Directive with user stories
const { directive, user_stories } = await DirectiveFactory.create()
  .withTitle('Directive with Stories')
  .withUserStories(5, { priority: 'high' });

// Complete workflow
const data = await DirectiveFactory.create()
  .withTitle('Complete Workflow')
  .withCompleteWorkflow({
    storyCount: 3,
    prdAttributes: { title: 'PRD Title' },
    storyAttributes: { priority: 'medium' },
  });

// Multiple directives
const directives = await DirectiveFactory.create()
  .withTitle('Batch Directive')
  .buildMany(10);

// Cleanup all
await factory.cleanup();
```

### PRDFactory

```javascript
import { PRDFactory } from '../factories/prd-factory.js';

// Basic PRD
const prd = await PRDFactory.create()
  .forDirective(directiveId)
  .withTitle('My PRD')
  .withObjective('Improve performance')
  .withObjective('Enhance security')
  .build();

// Minimal PRD
const minimalPRD = await PRDFactory.create()
  .forDirective(directiveId)
  .minimal()
  .build();

// Comprehensive PRD
const comprehensivePRD = await PRDFactory.create()
  .forDirective(directiveId)
  .comprehensive()
  .build();

// Custom technical requirements
const prd = await PRDFactory.create()
  .forDirective(directiveId)
  .withTechnicalRequirements({
    frontend: { framework: 'React', version: '18.x' },
    backend: { language: 'Node.js', database: 'PostgreSQL' },
  })
  .withSuccessCriteria([
    'All tests pass',
    'Performance benchmarks met',
  ])
  .build();
```

### UserStoryFactory

```javascript
import { UserStoryFactory } from '../factories/user-story-factory.js';

// Simple story
const story = await UserStoryFactory.create()
  .forDirective(directiveId)
  .withTitle('As a user, I want...')
  .withStoryPoints(5)
  .withHighPriority()
  .build();

// Story with Given-When-Then
const story = await UserStoryFactory.create()
  .forDirective(directiveId)
  .withGivenWhenThen(
    'I am on the dashboard',
    'I click the export button',
    'I receive a CSV file'
  )
  .build();

// Multiple stories
const stories = await UserStoryFactory.create()
  .forDirective(directiveId)
  .withTitle('Batch Story')
  .buildMany(5);

// Stories with different sizes
const smallStory = await UserStoryFactory.create()
  .forDirective(directiveId)
  .small() // 1-3 points
  .build();

const mediumStory = await UserStoryFactory.create()
  .forDirective(directiveId)
  .medium() // 5-8 points
  .build();

const largeStory = await UserStoryFactory.create()
  .forDirective(directiveId)
  .large() // 13 points
  .build();
```

## Fixtures

Pre-configured scenarios for common use cases:

```javascript
import { Fixtures } from '../factories/fixtures.js';

// Draft directive
const directive = await Fixtures.draftDirective();

// Active directive with PRD
const data = await Fixtures.activeDirectiveWithPRD();

// Complete workflow (directive + PRD + stories)
const workflow = await Fixtures.completeWorkflow();

// Directive with mixed priority stories
const mixed = await Fixtures.directiveWithMixedStories();

// Directives at all LEO phases
const [lead, plan, exec, verify] = await Fixtures.directivesAtAllPhases();

// Sprint-sized workload (~20 story points)
const sprint = await Fixtures.sprintWorkload();

// Performance-focused PRD
const perfPRD = await Fixtures.performancePRD(directiveId);

// Security-focused PRD
const secPRD = await Fixtures.securityPRD(directiveId);

// User journey stories
const journeyStories = await Fixtures.userJourneyStories(directiveId);

// Blocked directive scenario
const blocked = await Fixtures.blockedDirective();

// Minimal test data
const minimal = await Fixtures.minimalData();

// Comprehensive test data (all fields)
const comprehensive = await Fixtures.comprehensiveData();
```

## Traits

Reusable attribute sets for common scenarios:

```javascript
import { DirectiveFactory, DirectiveTraits } from '../factories/directive-factory.js';
import { TraitManager } from '../factories/base-factory.js';

const traits = new TraitManager();

// Define custom trait
traits.define('urgent', {
  priority: 'critical',
  status: 'active',
  metadata: { urgent: true },
});

// Apply trait to factory
const factory = DirectiveFactory.create();
traits.apply(factory, 'urgent');

const directive = await factory.build();

// Built-in traits
// DirectiveTraits: activeExec, leadDraft, verifyCompleted, critical, archived
// PRDTraits: minimal, performance, security, design
// UserStoryTraits: quickWin, criticalBugFix, epic, enhancement, technicalDebt, blocked
```

## Cleanup Strategies

### Strategy 1: Factory Cleanup

```javascript
const factory = DirectiveFactory.create();

try {
  const directive = await factory.build();
  // Run test
} finally {
  await factory.cleanup(); // Cleans up all created records
}
```

### Strategy 2: Fixture Cleanup

```javascript
import { FixtureCleanup } from '../factories/fixtures.js';

const cleanup = new FixtureCleanup();

try {
  const data1 = await Fixtures.completeWorkflow();
  const data2 = await Fixtures.sprintWorkload();

  cleanup.track(data1);
  cleanup.track(data2);

  // Run tests
} finally {
  await cleanup.cleanup();
}
```

### Strategy 3: Test Prefix Cleanup

```javascript
import { cleanupTestData } from '../helpers/database-helpers.js';

// At end of test suite
await cleanupTestData('Test'); // Removes all records with 'Test' prefix
```

## Advanced Patterns

### Custom Factory Extension

```javascript
import { BaseFactory } from '../factories/base-factory.js';

class VentureFactory extends BaseFactory {
  constructor() {
    super();
    this.attributes = {
      name: DataGenerators.title('Venture'),
      description: DataGenerators.description(),
      status: 'draft',
    };
  }

  withName(name) {
    return this.set('name', name);
  }

  async build() {
    const { data, error } = await this.supabase
      .from('ventures')
      .insert([this.attributes])
      .select()
      .single();

    if (error) throw new Error(`Failed to create venture: ${error.message}`);

    this.trackRecord('ventures', data.id);
    return data;
  }

  static create() {
    return new VentureFactory();
  }
}
```

### Sequences

```javascript
import { Sequence } from '../factories/base-factory.js';

const titleSeq = new Sequence('Directive', 1);

titleSeq.next(); // "Directive-1"
titleSeq.next(); // "Directive-2"
titleSeq.next(); // "Directive-3"

titleSeq.reset(); // Back to 1
```

### Data Generators

```javascript
import { DataGenerators } from '../factories/base-factory.js';

const title = DataGenerators.title('Feature');
// "Feature: User Management"

const description = DataGenerators.description(3);
// 3 sentences of description

const email = DataGenerators.email('testuser');
// "testuser.abc123@example.com"

const name = DataGenerators.name();
// "Alex Smith"

const markdown = DataGenerators.markdown(2);
// 2 paragraphs of markdown

const config = DataGenerators.jsonObject('config');
// { enabled: true, timeout: 30000, ... }
```

## Best Practices

### 1. Always Clean Up

```javascript
test('my test', async () => {
  const factory = DirectiveFactory.create();

  try {
    const directive = await factory.build();
    // Test code
  } finally {
    await factory.cleanup(); // ALWAYS cleanup
  }
});
```

### 2. Use Fixtures for Complex Scenarios

```javascript
// DON'T: Manually create related objects
const directive = await DirectiveFactory.create().build();
const prd = await PRDFactory.create().forDirective(directive.id).build();
const story1 = await UserStoryFactory.create().forDirective(directive.id).build();
const story2 = await UserStoryFactory.create().forDirective(directive.id).build();

// DO: Use fixture
const data = await Fixtures.completeWorkflow();
```

### 3. Use Meaningful Test Data

```javascript
// DON'T: Generic data
const directive = await DirectiveFactory.create().build();

// DO: Descriptive data
const directive = await DirectiveFactory.create()
  .withTitle('Test: User Authentication')
  .withDescription('Testing user auth flow')
  .build();
```

### 4. Clone Factories for Variations

```javascript
const baseFactory = DirectiveFactory.create()
  .inPlanPhase()
  .withHighPriority();

const factory1 = baseFactory.clone().withTitle('Directive 1');
const factory2 = baseFactory.clone().withTitle('Directive 2');

const directive1 = await factory1.build();
const directive2 = await factory2.build();
```

### 5. Use Traits for Common Patterns

```javascript
// DON'T: Repeat common attributes
const dir1 = await DirectiveFactory.create()
  .withStatus('active')
  .inExecPhase()
  .withHighPriority()
  .build();

const dir2 = await DirectiveFactory.create()
  .withStatus('active')
  .inExecPhase()
  .withHighPriority()
  .build();

// DO: Use trait
const traits = new TraitManager();
traits.define('activeExec', {
  status: 'active',
  phase: 'EXEC',
  priority: 'high',
});

const factory = DirectiveFactory.create();
traits.apply(factory, 'activeExec');

const dir1 = await factory.build();
const dir2 = await factory.clone().build();
```

## Testing the Factories

```javascript
// Example test using factories
import { test, expect } from '@playwright/test';
import { DirectiveFactory } from '../factories/directive-factory.js';
import { waitForNetworkIdle } from '../helpers/test-utils.js';

test('view directive details', async ({ page }) => {
  const factory = DirectiveFactory.create();

  try {
    // Create test data
    const directive = await factory
      .withTitle('Test Directive for E2E')
      .inPlanPhase()
      .asActive()
      .withPRD({ title: 'Test PRD' });

    // Navigate to directive
    await page.goto(`/directives/${directive.id}`);
    await waitForNetworkIdle(page);

    // Assert
    await expect(page.locator('h1')).toHaveText('Test Directive for E2E');
    await expect(page.locator('.prd-title')).toHaveText('Test PRD');

  } finally {
    await factory.cleanup();
  }
});
```

## Performance

- **Lazy Loading**: Supabase client is created once and reused
- **Batch Creation**: `buildMany()` is optimized for multiple records
- **Tracked Cleanup**: Only created records are deleted
- **Efficient Queries**: Uses single queries with `.single()` where possible

## Troubleshooting

### Error: "Must be associated with a directive"

```javascript
// Wrong
const prd = await PRDFactory.create().build();

// Correct
const prd = await PRDFactory.create()
  .forDirective(directiveId)
  .build();
```

### Error: "Failed to cleanup"

- Check database foreign key constraints
- Cleanup happens in reverse order
- Warnings are logged but don't throw errors

### Slow Tests

- Use `buildMany()` instead of loops
- Batch cleanup with `FixtureCleanup`
- Consider using fixtures for complex scenarios

---

**Version**: 1.0.0
**Created**: 2025-10-26
**Part of**: Phase 1 Testing Infrastructure Enhancement
**Next**: Use factories in E2E tests (B1.4)
