#!/usr/bin/env node

/**
 * LEO Protocol v4.2 - Enhanced PRD Creation with Playwright Integration
 * Creates PRDs with built-in Playwright test specifications
 * PLAN Agent - Technical Requirements with Test Verification
 */

import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { createPRDLink } from '../lib/sd-helpers.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createEnhancedPRD() {
  console.log('📋 PLAN Phase: Creating Enhanced PRD with Playwright Integration');
  console.log('🎯 Following LEO Protocol v4.2 - Test Verification Enhancement');
  
  // Example: Enhanced SDIP PRD with Playwright specifications
  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdData = {
    // Core PRD fields
    id: `PRD-ENHANCED-${Date.now()}`,
    ...await createPRDLink('SD-2025-0904-SDIP-V2'),
    title: 'Strategic Directive Initiation Protocol (SDIP) - Enhanced with Playwright',
    version: '2.0',
    status: 'draft',
    priority: 'critical',
    category: 'feature',
    created_by: 'PLAN',
    
    // Executive summary
    executive_summary: 'Transform Chairman feedback into validated Strategic Directives with comprehensive Playwright test coverage ensuring every requirement is verifiable.',
    business_context: 'Enhanced SDIP implementation with automated test verification at every step, ensuring quality and traceability.',
    technical_context: 'Full-stack implementation with Playwright E2E tests generated from requirements, enabling continuous verification.',
    
    // Enhanced functional requirements with Playwright specs
    functional_requirements: [
      {
        id: 'SDIP-001',
        name: 'Feedback Submission',
        description: 'Capture Chairman feedback with optional screenshot',
        acceptance_criteria: [
          'Text input for feedback (required, min 10 chars)',
          'Screenshot upload (optional, max 5MB)',
          'Auto-save to database on input change',
          'Generate unique submission ID',
          'Display success confirmation'
        ],
        playwright_test_specs: {
          selectors: {
            feedbackInput: '[data-testid="feedback-input"]',
            screenshotUpload: '[data-testid="screenshot-upload"]',
            submitButton: '[data-testid="submit-feedback"]',
            successMessage: '[data-testid="success-message"]',
            submissionId: '[data-testid="submission-id"]'
          },
          test_scenarios: [
            {
              name: 'Submit feedback with text only',
              steps: [
                'Navigate to /directive-lab',
                'Enter feedback text "Chairman requires dashboard improvements"',
                'Click submit button',
                'Verify success message appears',
                'Verify submission ID is displayed'
              ],
              assertions: [
                'Feedback input should accept text',
                'Submit button should be enabled after 10 chars',
                'Success message should contain submission ID',
                'Database should contain new submission'
              ]
            },
            {
              name: 'Submit feedback with screenshot',
              steps: [
                'Navigate to /directive-lab',
                'Enter feedback text',
                'Upload screenshot file',
                'Verify preview appears',
                'Click submit',
                'Verify both text and image saved'
              ],
              assertions: [
                'File upload should accept images',
                'Preview should show uploaded image',
                'Success response includes image URL'
              ]
            },
            {
              name: 'Validation - minimum character requirement',
              steps: [
                'Enter less than 10 characters',
                'Attempt to submit',
                'Verify error message'
              ],
              assertions: [
                'Submit button disabled for <10 chars',
                'Error message shows minimum requirement'
              ]
            }
          ],
          api_validations: [
            {
              endpoint: '/api/sdip/submissions',
              method: 'POST',
              expectedStatus: 201,
              responseSchema: {
                id: 'string',
                feedback: 'string',
                screenshot_url: 'string?',
                created_at: 'timestamp'
              }
            }
          ]
        }
      },
      {
        id: 'SDIP-002',
        name: 'PACER Analysis',
        description: 'Backend-only PACER categorization',
        acceptance_criteria: [
          'Analyze feedback into 5 PACER categories',
          'Store in pacer_analysis JSONB field',
          'Never display in UI',
          'Complete within 2 seconds',
          'Log analysis for audit'
        ],
        playwright_test_specs: {
          selectors: {
            // No UI selectors - backend only
          },
          test_scenarios: [
            {
              name: 'PACER analysis triggers on submission',
              steps: [
                'Submit feedback via API',
                'Wait for processing',
                'Query database for PACER results'
              ],
              assertions: [
                'PACER analysis completes within 2s',
                'Database contains 5 category scores',
                'UI does not show PACER data',
                'Audit log contains analysis record'
              ]
            }
          ],
          api_validations: [
            {
              endpoint: '/api/sdip/analyze',
              method: 'POST',
              expectedStatus: 200,
              maxResponseTime: 2000,
              validateDatabase: true
            }
          ]
        }
      },
      {
        id: 'SDIP-003',
        name: 'Critical Intent Extraction',
        description: 'Extract and validate intent summary',
        acceptance_criteria: [
          'Generate AI-powered intent summary',
          'Display for user confirmation',
          'Allow user to edit summary',
          'Save both original and edited versions',
          'Update validation gate status'
        ],
        playwright_test_specs: {
          selectors: {
            intentSummary: '[data-testid="intent-summary"]',
            editButton: '[data-testid="edit-intent"]',
            confirmButton: '[data-testid="confirm-intent"]',
            intentEditor: '[data-testid="intent-editor"]',
            gateStatus: '[data-testid="gate-2-status"]'
          },
          test_scenarios: [
            {
              name: 'Auto-generate and confirm intent',
              steps: [
                'Complete step 1 (feedback submission)',
                'Wait for intent generation',
                'Verify intent summary displays',
                'Click confirm button',
                'Verify gate 2 marked complete'
              ],
              assertions: [
                'Intent summary auto-populates',
                'Summary is editable',
                'Gate status updates to complete',
                'Progress bar advances'
              ]
            },
            {
              name: 'Edit and save intent',
              steps: [
                'Click edit button on intent',
                'Modify intent text',
                'Save changes',
                'Verify both versions stored'
              ],
              assertions: [
                'Edit mode enables text editing',
                'Save stores modified version',
                'Original version preserved',
                'UI shows edited version'
              ]
            }
          ],
          visual_tests: [
            {
              name: 'Intent summary visual regression',
              viewports: ['desktop', 'mobile'],
              elements: ['intent-summary', 'gate-status']
            }
          ]
        }
      },
      {
        id: 'SDIP-004',
        name: 'Strategic/Tactical Classification',
        description: 'Classify feedback as strategic or tactical',
        acceptance_criteria: [
          'Calculate percentage split (0-100%)',
          'Display visual breakdown chart',
          'Allow manual override with slider',
          'Store final classification',
          'Validate reasonable split (not 0% or 100%)'
        ],
        playwright_test_specs: {
          selectors: {
            classificationChart: '[data-testid="classification-chart"]',
            strategySlider: '[data-testid="strategy-slider"]',
            tacticalSlider: '[data-testid="tactical-slider"]',
            percentageDisplay: '[data-testid="percentage-display"]',
            confirmClassification: '[data-testid="confirm-classification"]'
          },
          test_scenarios: [
            {
              name: 'Auto-classification display',
              steps: [
                'Complete steps 1-2',
                'Navigate to step 3',
                'Verify chart displays',
                'Check percentage values'
              ],
              assertions: [
                'Chart renders with data',
                'Percentages sum to 100%',
                'Visual proportions match percentages'
              ]
            },
            {
              name: 'Manual classification adjustment',
              steps: [
                'Drag strategy slider to 70%',
                'Verify tactical updates to 30%',
                'Confirm classification',
                'Verify saved values'
              ],
              assertions: [
                'Sliders are interactive',
                'Values stay synchronized',
                'Total always equals 100%',
                'Database stores user override'
              ]
            },
            {
              name: 'Edge case - extreme values',
              steps: [
                'Try to set 100% strategic',
                'Verify validation message',
                'Set to 95% maximum',
                'Confirm saves correctly'
              ],
              assertions: [
                'System prevents 0% or 100%',
                'Warning shown for extreme values',
                'Reasonable limits enforced'
              ]
            }
          ],
          accessibility_tests: [
            {
              name: 'Slider keyboard navigation',
              interactions: ['arrow keys', 'tab navigation'],
              wcag_level: 'AA'
            }
          ]
        }
      },
      {
        id: 'SDIP-005',
        name: 'Synthesis Generation',
        description: 'Generate aligned/required/recommended items',
        acceptance_criteria: [
          'Create categorized action items',
          'Assign change policy badges',
          'Display with expandable accordion',
          'Allow item-level editing',
          'Support badge enhancement'
        ],
        playwright_test_specs: {
          selectors: {
            synthesisAccordion: '[data-testid="synthesis-accordion"]',
            alignedSection: '[data-testid="aligned-items"]',
            requiredSection: '[data-testid="required-items"]',
            recommendedSection: '[data-testid="recommended-items"]',
            itemBadge: '[data-testid="change-badge"]',
            addItemButton: '[data-testid="add-synthesis-item"]'
          },
          test_scenarios: [
            {
              name: 'Synthesis accordion interaction',
              steps: [
                'Complete steps 1-3',
                'Navigate to synthesis step',
                'Expand aligned section',
                'Expand required section',
                'Verify items display'
              ],
              assertions: [
                'Accordion sections expand/collapse',
                'Items display with badges',
                'Each section shows count',
                'Items are editable'
              ]
            },
            {
              name: 'Add custom synthesis item',
              steps: [
                'Click add item button',
                'Enter item details',
                'Select category (aligned/required/recommended)',
                'Assign change policy badge',
                'Save item'
              ],
              assertions: [
                'New item appears in correct section',
                'Badge displays correctly',
                'Item count updates',
                'Database contains new item'
              ]
            }
          ],
          performance_tests: [
            {
              name: 'Synthesis generation speed',
              maxDuration: 3000,
              metrics: ['time-to-interactive', 'first-contentful-paint']
            }
          ]
        }
      },
      {
        id: 'SDIP-006',
        name: 'Validation Gate Enforcement',
        description: 'Enforce mandatory 6-step validation workflow',
        acceptance_criteria: [
          'Prevent skipping any validation step',
          'Show clear progress indicators',
          'Block SD creation until all gates passed',
          'Display gate status in real-time',
          'Maintain gate state across sessions'
        ],
        playwright_test_specs: {
          selectors: {
            progressBar: '[data-testid="validation-progress"]',
            gateIndicators: '[data-testid^="gate-"][data-testid$="-indicator"]',
            nextStepButton: '[data-testid="next-step"]',
            createSDButton: '[data-testid="create-sd"]',
            skipWarning: '[data-testid="skip-warning"]'
          },
          test_scenarios: [
            {
              name: 'Gate enforcement - cannot skip',
              steps: [
                'Complete step 1',
                'Try to navigate to step 3',
                'Verify blocked with message',
                'Complete step 2',
                'Verify step 3 now accessible'
              ],
              assertions: [
                'Direct navigation to future steps blocked',
                'Warning message explains requirement',
                'Sequential completion enforced',
                'Progress saves between sessions'
              ]
            },
            {
              name: 'SD creation blocked until complete',
              steps: [
                'Complete steps 1-5',
                'Try to create SD',
                'Verify blocked message',
                'Complete step 6',
                'Create SD successfully'
              ],
              assertions: [
                'Create button disabled until step 6',
                'Clear message about remaining steps',
                'Button enables after all gates',
                'SD creation succeeds when complete'
              ]
            },
            {
              name: 'Progress persistence',
              steps: [
                'Complete steps 1-3',
                'Refresh page',
                'Verify progress retained',
                'Continue from step 4'
              ],
              assertions: [
                'Progress saves to database',
                'UI restores to correct step',
                'Completed gates remain marked',
                'Can continue from last position'
              ]
            }
          ],
          integration_tests: [
            {
              name: 'Full workflow E2E',
              steps: 'Complete all 6 steps sequentially',
              duration: '2-3 minutes',
              checkpoints: ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6', 'sd-created']
            }
          ]
        }
      }
    ],
    
    // Test scenarios summary
    test_scenarios: [
      {
        id: 'E2E-MAIN',
        name: 'Complete SDIP Workflow',
        type: 'end-to-end',
        priority: 'critical',
        steps: 18,
        assertions: 24,
        estimated_duration: '3 minutes'
      },
      {
        id: 'VALIDATION-GATES',
        name: 'Gate Enforcement Tests',
        type: 'integration',
        priority: 'high',
        steps: 12,
        assertions: 15,
        estimated_duration: '2 minutes'
      },
      {
        id: 'API-VALIDATION',
        name: 'API Endpoint Tests',
        type: 'api',
        priority: 'high',
        endpoints: 8,
        assertions: 20,
        estimated_duration: '1 minute'
      },
      {
        id: 'VISUAL-REGRESSION',
        name: 'Visual Regression Suite',
        type: 'visual',
        priority: 'medium',
        screenshots: 15,
        viewports: 3,
        estimated_duration: '2 minutes'
      },
      {
        id: 'ACCESSIBILITY',
        name: 'WCAG Compliance Tests',
        type: 'accessibility',
        priority: 'high',
        wcag_level: 'AA',
        components: 10,
        estimated_duration: '1 minute'
      }
    ],
    
    // Acceptance criteria with Playwright verification
    acceptance_criteria: [
      'All 6 validation gates enforce sequential completion - verified by Playwright E2E test',
      'PACER analysis completes in under 2 seconds - verified by performance test',
      'Critical analysis provides actionable intent - verified by content validation',
      'No user can skip validation steps - verified by negative testing',
      'SD creation only after all gates - verified by integration test',
      'WCAG 2.1 AA compliance - verified by accessibility test',
      'Mobile responsive design - verified by viewport testing',
      'API responses within 500ms - verified by API performance test'
    ],
    
    // Performance requirements with test thresholds
    performance_requirements: {
      response_times: {
        page_load: { target: '<1s', test_threshold: 1500 },
        step_transitions: { target: '<200ms', test_threshold: 300 },
        api_responses: { target: '<500ms', test_threshold: 700 },
        pacer_analysis: { target: '<2s', test_threshold: 2500 }
      },
      visual_stability: {
        layout_shift: { target: '<0.1', test_threshold: 0.15 },
        first_contentful_paint: { target: '<1s', test_threshold: 1200 },
        time_to_interactive: { target: '<2s', test_threshold: 2500 }
      }
    },
    
    // Sub-agent activation with test requirements
    non_functional_requirements: [
      {
        agent: 'Testing',
        reason: 'Comprehensive Playwright test coverage required',
        tasks: [
          'Generate Playwright tests from PRD specs',
          'Create page object models',
          'Set up test data fixtures',
          'Implement visual regression tests',
          'Configure CI/CD test pipeline',
          'Create test documentation'
        ],
        test_coverage_target: 85,
        test_types: ['e2e', 'integration', 'api', 'visual', 'accessibility', 'performance']
      },
      {
        agent: 'Database',
        reason: 'Schema for test result tracking',
        tasks: [
          'Create prd_playwright_* tables',
          'Set up test result storage',
          'Configure test mapping relationships',
          'Enable real-time test monitoring'
        ]
      },
      {
        agent: 'Design',
        reason: 'UI components with testability',
        tasks: [
          'Add data-testid attributes to all interactive elements',
          'Create consistent selector patterns',
          'Design for test stability',
          'Document component test requirements'
        ]
      }
    ],
    
    // Metadata
    metadata: {
      created_via: 'LEO Protocol v4.2',
      test_integration: 'Playwright',
      test_generation: 'Automated from PRD',
      estimated_test_count: 45,
      estimated_test_duration: '10 minutes',
      coverage_target: 85
    }
  };
  
  // Create Playwright specifications
  const playwrightSpecs = {
    prd_id: prdData.id,
    specification_version: '1.0',
    base_url: 'http://localhost:3000',
    test_timeout_ms: 30000,
    viewport_sizes: [
      { name: 'desktop', width: 1920, height: 1080 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 667 }
    ],
    browsers: ['chromium', 'firefox', 'webkit'],
    page_objects: generatePageObjects(prdData),
    shared_selectors: generateSharedSelectors(),
    test_data_fixtures: generateTestFixtures(prdData),
    api_endpoints: extractAPIEndpoints(prdData),
    visual_regression_enabled: true,
    screenshot_baseline_path: 'tests/baselines',
    visual_threshold: 0.2,
    created_by: 'PLAN'
  };
  
  try {
    // Insert PRD
    const { data: prdResult, error: prdError } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select()
      .single();
    
    if (prdError) {
      console.error('❌ Error creating PRD:', prdError);
      return;
    }
    
    console.log('✅ Enhanced PRD created successfully!');
    console.log('📄 PRD ID:', prdResult.id);
    
    // Insert Playwright specifications
    const { data: specResult, error: specError } = await supabase
      .from('prd_playwright_specifications')
      .insert(playwrightSpecs)
      .select()
      .single();
    
    if (specError) {
      console.error('⚠️ Warning: Could not create Playwright specs:', specError);
    } else {
      console.log('✅ Playwright specifications created!');
    }
    
    // Generate test scenarios from requirements
    const scenarios = await generateTestScenarios(prdData);
    
    if (scenarios.length > 0) {
      const { error: scenarioError } = await supabase
        .from('prd_playwright_scenarios')
        .insert(scenarios);
      
      if (scenarioError) {
        console.error('⚠️ Warning: Could not create test scenarios:', scenarioError);
      } else {
        console.log(`✅ Generated ${scenarios.length} test scenarios!`);
      }
    }
    
    // Output summary
    console.log('\n📊 PRD Enhancement Summary:');
    console.log('  - Functional Requirements:', prdData.functional_requirements.length);
    console.log('  - Test Scenarios:', countTestScenarios(prdData));
    console.log('  - API Validations:', countAPIValidations(prdData));
    console.log('  - Visual Tests:', countVisualTests(prdData));
    console.log('  - Accessibility Tests:', countAccessibilityTests(prdData));
    console.log('  - Total Assertions:', countAssertions(prdData));
    
    console.log('\n🎭 Playwright Integration:');
    console.log('  - Page Objects Generated: ✅');
    console.log('  - Test Data Fixtures: ✅');
    console.log('  - Selectors Defined: ✅');
    console.log('  - API Endpoints Mapped: ✅');
    console.log('  - Visual Regression Ready: ✅');
    
    console.log('\n🚀 Next Steps:');
    console.log('  1. Run: node lib/testing/prd-playwright-generator.js', prdResult.id);
    console.log('  2. Review generated tests in tests/e2e/generated/');
    console.log('  3. Execute: npm run test:e2e');
    console.log('  4. View results: node lib/dashboard/prd-test-mapper.js map', prdResult.id);
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

// Helper functions

function generatePageObjects(prd) {
  const pageObjects = {};
  
  for (const req of prd.functional_requirements) {
    if (req.playwright_test_specs?.selectors) {
      const pageName = toPascalCase(req.id) + 'Page';
      pageObjects[pageName] = {
        selectors: req.playwright_test_specs.selectors,
        actions: ['navigate', 'fill', 'click', 'submit', 'verify'],
        url: determineUrl(req)
      };
    }
  }
  
  return pageObjects;
}

function generateSharedSelectors() {
  return {
    navigation: {
      header: '[data-testid="header"]',
      nav: '[data-testid="navigation"]',
      footer: '[data-testid="footer"]'
    },
    validation: {
      progressBar: '[data-testid="validation-progress"]',
      gateIndicators: '[data-testid^="gate-"]',
      errorMessage: '[data-testid="error-message"]',
      successMessage: '[data-testid="success-message"]'
    },
    common: {
      loader: '[data-testid="loader"]',
      modal: '[data-testid="modal"]',
      tooltip: '[data-testid="tooltip"]',
      dropdown: '[data-testid="dropdown"]'
    }
  };
}

function generateTestFixtures(prd) {
  return {
    users: {
      chairman: {
        role: 'chairman',
        email: 'chairman@example.com',
        permissions: ['create_sd', 'override_validation']
      },
      standard: {
        role: 'user',
        email: 'user@example.com',
        permissions: ['create_submission']
      }
    },
    feedbackSamples: {
      strategic: 'We need to pivot our entire business model to focus on AI-driven solutions',
      tactical: 'The submit button color should be blue instead of green',
      mixed: 'Improve dashboard performance and consider new market opportunities',
      minimal: 'Fix this',
      extensive: 'Lorem ipsum...'.repeat(100)
    },
    testImages: {
      screenshot: 'test-data/screenshot.png',
      largeImage: 'test-data/large-image.jpg',
      invalidFile: 'test-data/document.pdf'
    }
  };
}

function extractAPIEndpoints(prd) {
  return [
    { method: 'GET', path: '/api/sdip/submissions', expectedStatus: 200 },
    { method: 'POST', path: '/api/sdip/submissions', expectedStatus: 201 },
    { method: 'GET', path: '/api/sdip/submissions/:id', expectedStatus: 200 },
    { method: 'PUT', path: '/api/sdip/submissions/:id/step/:step', expectedStatus: 200 },
    { method: 'POST', path: '/api/sdip/analyze', expectedStatus: 200 },
    { method: 'POST', path: '/api/sdip/strategic-directive', expectedStatus: 201 }
  ];
}

async function generateTestScenarios(prd) {
  const scenarios = [];
  
  for (const req of prd.functional_requirements) {
    if (req.playwright_test_specs?.test_scenarios) {
      for (const scenario of req.playwright_test_specs.test_scenarios) {
        scenarios.push({
          prd_id: prd.id,
          requirement_id: req.id,
          scenario_id: `${req.id}-${scenario.name.replace(/\s+/g, '-').toUpperCase()}`,
          scenario_name: scenario.name,
          scenario_description: `Test for ${req.name}: ${scenario.name}`,
          priority: prd.priority,
          test_type: 'e2e',
          test_steps: scenario.steps.map((step, index) => ({
            step: index + 1,
            action: extractAction(step),
            target: extractTarget(step),
            data: extractData(step),
            assertion: extractAssertion(step)
          })),
          expected_results: scenario.assertions,
          assertions: scenario.assertions.map(a => ({
            type: determineAssertionType(a),
            description: a
          })),
          auto_generated: true
        });
      }
    }
  }
  
  return scenarios;
}

function countTestScenarios(prd) {
  return prd.functional_requirements.reduce((count, req) => 
    count + (req.playwright_test_specs?.test_scenarios?.length || 0), 0);
}

function countAPIValidations(prd) {
  return prd.functional_requirements.reduce((count, req) => 
    count + (req.playwright_test_specs?.api_validations?.length || 0), 0);
}

function countVisualTests(prd) {
  return prd.functional_requirements.reduce((count, req) => 
    count + (req.playwright_test_specs?.visual_tests?.length || 0), 0);
}

function countAccessibilityTests(prd) {
  return prd.functional_requirements.reduce((count, req) => 
    count + (req.playwright_test_specs?.accessibility_tests?.length || 0), 0);
}

function countAssertions(prd) {
  return prd.functional_requirements.reduce((count, req) => {
    const scenarios = req.playwright_test_specs?.test_scenarios || [];
    return count + scenarios.reduce((sCount, s) => sCount + (s.assertions?.length || 0), 0);
  }, 0);
}

function toPascalCase(str) {
  return str
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function determineUrl(requirement) {
  if (requirement.id.includes('SDIP')) return '/directive-lab';
  return '/';
}

function extractAction(step) {
  const stepLower = step.toLowerCase();
  if (stepLower.includes('navigate')) return 'navigate';
  if (stepLower.includes('click')) return 'click';
  if (stepLower.includes('enter') || stepLower.includes('fill')) return 'fill';
  if (stepLower.includes('wait')) return 'wait';
  if (stepLower.includes('verify')) return 'assert';
  return 'custom';
}

function extractTarget(step) {
  // Try to extract selector from step text
  const match = step.match(/\[data-testid="([^"]+)"\]/);
  if (match) return match[0];
  return 'element';
}

function extractData(step) {
  const match = step.match(/"([^"]+)"/);
  if (match) return match[1];
  return null;
}

function extractAssertion(step) {
  if (step.toLowerCase().includes('verify')) {
    return { type: 'visible', expected: true };
  }
  return null;
}

function determineAssertionType(assertion) {
  const assertionLower = assertion.toLowerCase();
  if (assertionLower.includes('visible') || assertionLower.includes('display')) return 'toBeVisible';
  if (assertionLower.includes('text') || assertionLower.includes('contain')) return 'toHaveText';
  if (assertionLower.includes('enabled') || assertionLower.includes('disabled')) return 'toBeEnabled';
  if (assertionLower.includes('value')) return 'toHaveValue';
  return 'custom';
}

// Execute
createEnhancedPRD();