# Vision-Based QA System Documentation

## Overview

The Vision QA System is an autonomous testing framework that combines Playwright browser automation with multimodal Large Language Models (LLMs) to perform intelligent UI testing. The system implements an **Observe → Think → Act** loop that allows it to navigate applications, identify bugs, and achieve test goals without explicit step-by-step instructions.

## Architecture

### Core Components

1. **Vision QA Agent** (`lib/testing/vision-qa-agent.js`)
   - Main orchestrator implementing the Observe-Think-Act loop
   - Manages test sessions and application context
   - Integrates with multi-application management system
   - Stores results in database

2. **Multimodal AI Client** (`lib/ai/multimodal-client.js`)
   - Supports multiple AI providers (OpenAI GPT-5/GPT-4V, Anthropic Claude 3, local models)
   - Handles image encoding and API communication
   - Implements cost tracking and retry logic
   - Configurable temperature and token limits

3. **Playwright Bridge** (`lib/testing/playwright-bridge.js`)
   - Translates AI decisions into Playwright actions
   - Smart selector resolution strategies
   - Retry logic and error handling
   - Support for complex interactions (hover, upload, keyboard)

4. **Vision Analyzer** (`lib/testing/vision-analyzer.js`)
   - Bug pattern detection
   - Accessibility checking
   - Confidence scoring
   - Consensus analysis for multiple runs

5. **Test Reporter** (`lib/testing/test-reporter.js`)
   - Generates narrative reports in Markdown/HTML/JSON
   - Timeline visualization
   - Cost breakdown analysis
   - Comparison reports for consensus testing

## Key Features

### 1. Autonomous Navigation
The system can understand high-level goals and determine the necessary actions to achieve them:
```javascript
// Example: Simple goal-based testing
await agent.testApplication(
  'APP-001',
  'Submit the contact form with test data and verify success message'
);
```

### 2. Visual Bug Detection
Automatically identifies common UI issues:
- Overlapping elements
- Cut-off text or images
- Misaligned components
- Missing images or icons
- Broken responsive layouts
- Poor color contrast
- Stuck loading indicators

### 3. Consensus Testing
Run multiple test iterations to ensure reliability:
```javascript
const result = await agent.runWithConsensus(appId, testGoal);
// Returns agreement rate and consensus outcome
```

### 4. Cost Management
- Tracks API costs per iteration
- Configurable cost limits
- Automatic stop when limit reached
- Cost breakdown by provider

### 5. Automatic Model Selection
The system automatically selects the most appropriate model based on your test goal and configuration:
- **No manual model selection required** - the system analyzes your test goal and picks the best model
- **Cost-optimized** - Uses cheaper models for simple tests, premium models only when needed
- **Context-aware** - Detects CI/CD environments, consensus runs, and budget constraints

#### Current Model Portfolio:
- **OpenAI**: GPT-5 (flagship), GPT-5-Mini (balanced), GPT-5-Nano (budget), GPT-4.1, GPT-4o
- **Anthropic**: Claude Sonnet 4, Sonnet 3.7, Opus 4, Haiku 3
- **Local Models**: LLaVA, BLIP, CogVLM (placeholder)

#### Auto-Selection Logic:
- **Accessibility testing** → Claude Sonnet 3.7
- **Critical/Payment/Security** → GPT-5
- **Performance/Speed tests** → GPT-5-Nano
- **Smoke/Basic tests** → GPT-5-Nano
- **CI/CD environments** → GPT-5-Mini
- **Default (most cases)** → GPT-5-Mini

## Configuration

### Environment Variables
```bash
# AI Provider Configuration
AI_PROVIDER=openai              # 'openai', 'anthropic', 'local'
AI_MODEL=auto                   # 'auto' for automatic selection (recommended)
OPENAI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here

# Database Configuration
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
```

### Test Configuration Options
```javascript
const config = {
  // Iteration limits
  maxIterations: 50,           // Maximum actions to attempt
  
  // Cost management
  costLimit: 5.00,             // USD limit
  
  // Screenshot strategy
  screenshotInterval: 'smart',  // 'always', 'smart', 'error'
  
  // Confidence thresholds
  confidenceThreshold: 0.85,    // Minimum confidence to act
  consensusThreshold: 0.66,     // Agreement needed for consensus
  
  // Bug detection
  bugDetectionSensitivity: 'medium', // 'low', 'medium', 'high'
  visualCheckThreshold: 0.8,    // Visual similarity threshold
  
  // AI settings
  temperature: 0,              // 0 for deterministic, higher for creativity
  retryAttempts: 3,            // Retry failed API calls
  
  // Browser settings
  headless: false,             // Show browser window
  viewport: { width: 1280, height: 720 }
};
```

## Usage Examples

### Basic Test (Model Auto-Selected)
```javascript
const VisionQAAgent = require('./lib/testing/vision-qa-agent');

const agent = new VisionQAAgent({
  maxIterations: 30,
  costLimit: 2.00
  // No model specified - will auto-select based on goal
});

const report = await agent.testApplication(
  'APP-001',
  'Complete user registration flow'  // Will use gpt-5-mini
);
```

### Override Auto-Selection (Optional)
```javascript
const agent = new VisionQAAgent({
  model: 'gpt-5',  // Force specific model if needed
  maxIterations: 30,
  costLimit: 10.00
});
```

### Consensus Testing
```javascript
// Run the same test 3 times for reliability
const agent = new VisionQAAgent({
  consensusRuns: 3
});

const result = await agent.runWithConsensus(
  'APP-001',
  'Add item to cart and checkout'
);

console.log(`Agreement: ${result.consensus.agreement * 100}%`);
console.log(`Reliable: ${result.consensus.isReliable}`);
```

### Custom Bug Detection
```javascript
const agent = new VisionQAAgent({
  bugDetectionSensitivity: 'high',
  screenshotInterval: 'always'
});

const report = await agent.testApplication(
  'APP-001',
  'Navigate all pages and identify visual bugs'
);

// Access detected bugs
report.bugs.forEach(bug => {
  console.log(`${bug.severity}: ${bug.description}`);
});
```

## Database Schema

The system stores all test data in PostgreSQL:

### Tables
- `vision_qa_sessions` - Test session metadata and results
- `vision_qa_bugs` - Detected bugs with severity and context
- `vision_qa_actions` - All actions taken during testing
- `vision_qa_observations` - Page states and AI analysis
- `vision_qa_consensus` - Consensus test results
- `vision_qa_templates` - Reusable test scenarios

### Key Views
- `vision_qa_session_summaries` - Aggregated session data
- `vision_qa_bug_stats` - Bug statistics by application

## Test Scenarios

Pre-built scenarios in `examples/vision-qa-scenarios.js`:

1. **Basic Form Submission** - Simple form interaction
2. **E-commerce Checkout** - Complex multi-step flow
3. **Authentication Flow** - Register, logout, login
4. **Bug Hunting** - Comprehensive bug detection
5. **Mobile Responsive** - Mobile viewport testing
6. **Accessibility Audit** - Keyboard navigation and ARIA
7. **Performance Test** - Load testing and timing
8. **Internationalization** - Multi-language support
9. **Search Feature** - Search and filter testing
10. **File Upload** - Various file type handling

## Running Tests

### Interactive Mode
```bash
node examples/vision-qa-scenarios.js
# Follow prompts to select scenarios
```

### Command Line
```bash
# Run specific scenario
node examples/vision-qa-scenarios.js basicFormSubmission

# Run consensus test
node examples/vision-qa-scenarios.js consensus ecommerceCheckout

# Run all scenarios
node examples/vision-qa-scenarios.js all
```

### Programmatic
```javascript
const { runTestScenario } = require('./examples/vision-qa-scenarios');

const report = await runTestScenario('authenticationFlow');
```

## Reports

### Report Formats

1. **Markdown** (Default)
   - Human-readable narrative format
   - Timeline visualization
   - Action sequences with outcomes
   - Bug listings with severity

2. **HTML**
   - Styled presentation
   - Interactive elements
   - Suitable for sharing

3. **JSON**
   - Structured data
   - Programmatic analysis
   - Integration with other tools

### Report Sections

- **Executive Summary** - Pass/fail, duration, cost, bugs
- **Timeline** - Chronological event sequence
- **Bug Analysis** - Categories, severity, patterns
- **Action Sequence** - Step-by-step actions taken
- **Cost Breakdown** - Per iteration, per provider
- **Recommendations** - Improvements based on findings

## Best Practices

### 1. Goal Definition
- Be specific but not prescriptive
- Focus on outcomes, not steps
- Include success criteria

Good: "Register a new user and verify welcome email"
Bad: "Click the register button then fill the form..."

### 2. Cost Optimization
- Use consensus testing sparingly
- Start with lower-cost models (GPT-4 Turbo, Claude Haiku)
- Use 'smart' screenshot mode to reduce API calls

### 3. Reliability
- Run consensus tests for critical flows
- Set appropriate confidence thresholds
- Review and update selectors periodically

### 4. Bug Detection
- Adjust sensitivity based on application maturity
- Review false positives and tune patterns
- Combine with traditional assertions

## Troubleshooting

### Common Issues

1. **High API Costs**
   - Reduce `maxIterations`
   - Use cheaper models
   - Enable `headless: true`
   - Use 'smart' screenshot mode

2. **Low Confidence Actions**
   - Improve page structure (clear labels, ARIA)
   - Add data-testid attributes
   - Reduce ambiguous UI elements

3. **Consensus Disagreement**
   - Check for timing-dependent elements
   - Ensure deterministic test data
   - Review confidence thresholds

4. **Failed Element Selection**
   - Add explicit selectors to key elements
   - Use semantic HTML
   - Implement proper ARIA labels

## Integration with LEO Protocol

The Vision QA system integrates seamlessly with the LEO Protocol multi-agent architecture:

1. **Application Context** - Tests are scoped to registered applications
2. **Strategic Directives** - Test goals can align with SDs
3. **Compliance Tracking** - Results feed into compliance metrics
4. **Multi-App Support** - Switch between applications easily

Example with LEO context:
```javascript
// Test specific SD implementation
await agent.testApplication(
  'APP-VENTURE-001',
  'Verify SD-012 growth features are functional',
  {
    metadata: {
      strategicDirective: 'SD-012',
      prdId: 'SD-012-PRD-growth'
    }
  }
);
```

## Performance Considerations

### Resource Usage
- Browser instances: ~200-300MB RAM per instance
- API calls: 1-3 per iteration (screenshot + analysis)
- Database writes: Batched every 5 iterations
- Disk space: Screenshots ~100KB each

### Optimization Tips
1. Use headless mode for CI/CD
2. Implement screenshot caching
3. Batch database operations
4. Reuse browser contexts when possible
5. Implement connection pooling

## Security Considerations

1. **API Keys** - Store in environment variables
2. **Test Data** - Use non-production data
3. **Screenshots** - May contain sensitive information
4. **Database** - Implement proper access controls
5. **Reports** - Sanitize before sharing

## Future Enhancements

Planned improvements:
1. Visual regression testing with pixel comparison
2. Performance metrics collection
3. Network traffic analysis
4. Integration with CI/CD pipelines
5. Custom training for domain-specific patterns
6. Real-time test monitoring dashboard
7. Automated test generation from user stories
8. Cross-browser testing support

## Conclusion

The Vision QA System represents a paradigm shift in automated testing, moving from brittle selector-based tests to intelligent, goal-oriented testing. By combining the flexibility of LLMs with the reliability of browser automation, it provides a robust solution for modern web application testing.