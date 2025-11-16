#!/usr/bin/env node

/**
 * UAT to Strategic Directive AI Converter
 *
 * Automatically converts UAT test failures into well-formed Strategic Directives
 * using AI to analyze failures, determine strategic importance, and generate
 * comprehensive SD documentation.
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class UATToSDConverter {
  constructor() {
    this.conversionId = `UAT-SD-${Date.now()}`;
    this.model = 'gpt-5.1-chat-latest';
  }

  /**
   * Main conversion pipeline
   */
  async convertTestFailureToSD(testResult, options = {}) {
    console.log(chalk.cyan.bold('\n🤖 UAT to Strategic Directive AI Conversion\n'));
    console.log(chalk.gray('═'.repeat(60)));

    try {
      // Step 1: Analyze the failure
      console.log(chalk.yellow('📊 Analyzing test failure...'));
      const analysis = await this.analyzeFailure(testResult);

      // Step 2: Generate SD components
      console.log(chalk.yellow('📝 Generating Strategic Directive components...'));
      const sdComponents = await this.generateSDComponents(analysis, testResult);

      // Step 3: Validate quality
      console.log(chalk.yellow('✅ Validating SD quality...'));
      const validatedComponents = await this.validateSDQuality(sdComponents);

      // Step 4: Create directive submission
      console.log(chalk.yellow('💾 Creating directive submission...'));
      const submission = await this.createDirectiveSubmission(validatedComponents, testResult);

      // Step 5: Create actual Strategic Directive
      console.log(chalk.yellow('🎯 Creating Strategic Directive entry...'));
      const strategicDirective = await this.createStrategicDirective(validatedComponents, testResult, submission);

      // Step 6: Update submission with SD link
      console.log(chalk.yellow('🔗 Linking submission to SD...'));
      await this.linkSubmissionToSD(submission, strategicDirective);

      // Step 7: Link to UAT results
      console.log(chalk.yellow('📊 Linking to UAT results...'));
      await this.linkToUATResults(submission, testResult);

      console.log(chalk.green.bold('\n✨ Strategic Directive created successfully!'));
      console.log(chalk.white(`📋 Submission ID: ${submission.submission_id}`));
      console.log(chalk.white(`🎯 SD Key: ${strategicDirective.sd_key}`));
      console.log(chalk.white(`📊 Priority: ${strategicDirective.priority}`));
      console.log(chalk.white(`🤖 AI Confidence: ${(validatedComponents.confidence_score * 100).toFixed(1)}%`));

      return { ...submission, sd_key: strategicDirective.sd_key };

    } catch (error) {
      console.error(chalk.red('❌ Conversion failed:'), error.message);
      throw error;
    }
  }

  /**
   * Analyze the test failure using AI
   */
  async analyzeFailure(testResult) {
    const response = await openai.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: `You are a strategic business analyst converting UAT findings into strategic directives.
        Analyze test failures to determine their strategic importance and business impact.`
      }, {
        role: 'user',
        content: `Analyze this UAT test failure:

Test Case ID: ${testResult.case_id || testResult.id}
Test Title: ${testResult.title}
Section: ${testResult.section}
Priority: ${testResult.priority}
Status: ${testResult.status || 'FAIL'}

Test Description:
${testResult.description || 'No description provided'}

Failure Details:
- Expected Behavior: ${testResult.expected || 'Test should pass'}
- Actual Behavior: ${testResult.actual || 'Test failed'}
- Notes/Observations: ${testResult.notes || 'No additional notes'}

Please determine:
1. Business Impact (critical/high/medium/low) with justification
2. User Experience Impact (1-10 scale) with explanation
3. Strategic Importance (1-10 scale) with rationale
4. Recommended Priority for the Strategic Directive
5. Key stakeholders who should be involved
6. Estimated complexity to resolve (simple/moderate/complex)
7. Potential risks if not addressed

Provide your analysis in JSON format.`
      }],
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Generate Strategic Directive components
   */
  async generateSDComponents(analysis, testResult) {
    const response = await openai.chat.completions.create({
      model: this.model,
      temperature: 0.4,
      messages: [{
        role: 'system',
        content: `You are creating a Strategic Directive from a UAT test failure.
        Generate comprehensive documentation that follows the organization's SD format.
        Focus on clarity, actionability, and strategic alignment.`
      }, {
        role: 'user',
        content: `Based on this analysis and test failure, generate a complete Strategic Directive:

Analysis: ${JSON.stringify(analysis, null, 2)}
Test Result: ${JSON.stringify(testResult, null, 2)}

Generate the following components:

1. chairman_feedback: Write from the perspective of a user/chairman experiencing this issue
2. intent_summary: Clear, concise summary of what needs to be fixed/improved
3. problem_definition: Detailed technical and business problem description
4. scope: Define what components, features, and systems are affected
5. success_criteria: Specific, measurable criteria to know when this is resolved
6. title: A clear, actionable title for the Strategic Directive
7. category: Choose from (Infrastructure, Feature, Bug Fix, Performance, Security, UX/UI, Process)
8. rationale: Business justification for prioritizing this work
9. priority_justification: Why this priority level is appropriate
10. confidence_score: Your confidence in this SD (0-1 scale)

Format as JSON with these exact field names.`
      }],
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Validate SD quality before submission
   */
  async validateSDQuality(sdComponents) {
    const response = await openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [{
        role: 'system',
        content: `You are a quality assurance specialist validating Strategic Directives.
        Ensure completeness, clarity, and actionability.`
      }, {
        role: 'user',
        content: `Validate this Strategic Directive for quality:

${JSON.stringify(sdComponents, null, 2)}

Check for:
1. Completeness - Are all required fields present and detailed?
2. Clarity - Is the language clear and unambiguous?
3. Actionability - Can a team immediately understand what needs to be done?
4. Measurability - Are success criteria specific and measurable?
5. Consistency - Do all components align with each other?

If quality is below 0.8, provide specific feedback for improvement.
Return JSON with:
- quality_score (0-1)
- is_valid (boolean)
- feedback (array of improvement suggestions)
- improved_components (if quality < 0.8, provide improved versions)`
      }],
      response_format: { type: 'json_object' }
    });

    const validation = JSON.parse(response.choices[0].message.content);

    if (validation.quality_score < 0.8 && validation.improved_components) {
      // Use the improved components
      return {
        ...validation.improved_components,
        confidence_score: validation.quality_score
      };
    }

    return {
      ...sdComponents,
      confidence_score: validation.quality_score
    };
  }

  /**
   * Create directive submission in database
   */
  async createDirectiveSubmission(sdComponents, testResult) {
    // Generate unique submission ID
    const submissionId = `SDIP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const submission = {
      submission_id: submissionId,
      chairman_input: `UAT Test Failure: ${testResult.title}\n\nTest ID: ${testResult.case_id || testResult.id}\nSection: ${testResult.section}\nPriority: ${testResult.priority}\n\nDescription: ${testResult.description || 'No description provided'}`,
      intent_summary: sdComponents.intent_summary,
      screenshot_url: testResult.screenshot_url || testResult.evidence_url,
      status: 'completed',
      current_step: 7,
      completed_steps: [1, 2, 3, 4, 5, 6, 7],

      // Store all AI-generated data in synthesis_data (JSONB)
      synthesis_data: {
        sd_components: sdComponents,
        test_result: testResult,
        metadata: {
          source: 'uat_testing',
          uat_test_id: testResult.case_id || testResult.id,
          uat_run_id: testResult.run_id,
          uat_section: testResult.section,
          uat_priority: testResult.priority,
          auto_generated: true,
          ai_model: this.model,
          ai_confidence: sdComponents.confidence_score,
          conversion_id: this.conversionId
        },
        priority: this.mapPriority(testResult.priority, sdComponents.priority_justification)
      },

      // Gate status
      gate_status: {
        step1_complete: true,
        step2_complete: true,
        step3_complete: true,
        step4_complete: true,
        step5_complete: true,
        step6_complete: true,
        step7_complete: true,
        all_gates_passed: true,
        resulting_sd_id: null // Will be set when SD is created
      },

      // Final summary combining everything
      final_summary: `Strategic Directive: ${sdComponents.title}\n\nCategory: ${sdComponents.category}\nPriority: ${this.mapPriority(testResult.priority, sdComponents.priority_justification)}\n\nProblem:\n${sdComponents.problem_definition}\n\nScope:\n${sdComponents.scope}\n\nSuccess Criteria:\n${sdComponents.success_criteria}\n\nGenerated from UAT test failure (${testResult.case_id || testResult.id})`
    };

    // Insert into database
    const { data, error } = await supabase
      .from('directive_submissions')
      .insert(submission)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create directive submission: ${error.message}`);
    }

    return data;
  }

  /**
   * Create Strategic Directive entry in strategic_directives_v2
   */
  async createStrategicDirective(sdComponents, testResult, submission) {
    // Generate SD key
    const sdKey = await this.generateUATSDKey();

    // Get the highest sequence_rank to assign next value
    const { data: maxRankData } = await supabase
      .from('strategic_directives_v2')
      .select('sequence_rank')
      .order('sequence_rank', { ascending: false, nullsLast: true })
      .limit(1)
      .single();

    const nextSequenceRank = (maxRankData?.sequence_rank || 0) + 1;

    const strategicDirective = {
      id: crypto.randomUUID(),
      sd_key: sdKey,
      title: sdComponents.title,
      description: sdComponents.problem_definition,
      rationale: sdComponents.rationale,
      scope: sdComponents.scope,
      success_criteria: sdComponents.success_criteria,
      priority: this.mapPriority(testResult.priority, sdComponents.priority_justification),
      status: 'draft',
      category: testResult.section, // Use UAT section value directly
      target_application: 'EHG', // Specify the target application
      sequence_rank: nextSequenceRank, // Add sequence rank for proper ordering
      metadata: {
        source: 'uat_testing',
        uat_test_id: testResult.case_id || testResult.id,
        uat_run_id: testResult.run_id,
        uat_section: testResult.section,
        uat_priority: testResult.priority,
        auto_generated: true,
        ai_model: this.model,
        ai_confidence: sdComponents.confidence_score,
        submission_id: submission.submission_id
      }
    };

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(strategicDirective)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create strategic directive: ${error.message}`);
    }

    return data;
  }

  /**
   * Link submission to created SD
   */
  async linkSubmissionToSD(submission, strategicDirective) {
    const { error } = await supabase
      .from('directive_submissions')
      .update({
        gate_status: {
          ...submission.gate_status,
          resulting_sd_id: strategicDirective.sd_key
        }
      })
      .eq('id', submission.id);

    if (error) {
      console.error('Warning: Failed to link submission to SD:', error.message);
    }
  }

  /**
   * Generate unique SD key for UAT-generated directives
   * Checks BOTH sd_key and id fields to avoid conflicts
   */
  async generateUATSDKey() {
    // Get all records with UAT pattern in EITHER sd_key OR id field
    // This prevents collision with legacy records that used "SD-UAT-001" as their ID
    const { data: conflicts, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, id')
      .or('sd_key.ilike.SD-UAT-%,id.ilike.SD-UAT-%')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error checking for UAT SD conflicts:', error);
    }

    // Extract all used numbers from BOTH sd_key and id fields
    const usedNumbers = new Set();
    conflicts?.forEach(record => {
      // Check both fields for SD-UAT pattern
      [record.sd_key, record.id].forEach(value => {
        if (value) {
          const match = value.match(/SD-UAT-(\d+)/);
          if (match) {
            usedNumbers.add(parseInt(match[1]));
          }
        }
      });
    });

    // Find the first available number
    let nextNum = 1;
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }

    const proposedKey = `SD-UAT-${String(nextNum).padStart(3, '0')}`;

    // Final validation: ensure this key doesn't exist anywhere
    await this.validateSDKeyAvailability(proposedKey);

    return proposedKey;
  }

  /**
   * Validate that a proposed SD key is available (not used in sd_key OR id)
   */
  async validateSDKeyAvailability(proposedKey) {
    const { data: existingRecords, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status')
      .or(`sd_key.eq.${proposedKey},id.eq.${proposedKey}`)
      .limit(1);

    if (error) {
      console.error('Error validating SD key availability:', error);
      throw new Error(`Failed to validate SD key availability: ${error.message}`);
    }

    if (existingRecords && existingRecords.length > 0) {
      const conflict = existingRecords[0];
      throw new Error(
        `SD key "${proposedKey}" conflicts with existing record:\n` +
        `  Database ID: ${conflict.id}\n` +
        `  SD Key: ${conflict.sd_key || '(null)'}\n` +
        `  Title: ${conflict.title}\n` +
        `  Status: ${conflict.status}\n` +
        'Please use a different key or resolve the conflict.'
      );
    }

    return true;
  }

  /**
   * Link SD to UAT results
   */
  async linkToUATResults(submission, testResult) {
    const linkData = {
      id: crypto.randomUUID(),
      uat_result_id: testResult.result_id,
      uat_case_id: testResult.case_id || testResult.id,
      uat_run_id: testResult.run_id,
      directive_submission_id: submission.id,
      action_type: 'strategic_directive',
      action_id: submission.submission_id,
      created_by: 'ai_converter',
      created_at: new Date().toISOString(),
      metadata: {
        ai_confidence: submission.synthesis_data?.metadata?.ai_confidence || 0.85,
        conversion_id: this.conversionId,
        submission_id: submission.submission_id
      }
    };

    // Create linking table if it doesn't exist
    const { error } = await supabase
      .from('uat_finding_actions')
      .insert(linkData);

    if (error && error.code === '42P01') {
      // Table doesn't exist, create it
      console.log(chalk.yellow('Creating uat_finding_actions table...'));
      await this.createLinkingTable();

      // Retry insert
      const { error: retryError } = await supabase
        .from('uat_finding_actions')
        .insert(linkData);

      if (retryError) {
        console.error(chalk.yellow('Warning: Could not link to UAT results:'), retryError.message);
      }
    } else if (error) {
      console.error(chalk.yellow('Warning: Could not link to UAT results:'), error.message);
    }
  }

  /**
   * Generate unique SD ID
   */
  async generateSDId() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Get count of SDs created today
    const { data: existingSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .like('id', `SD-${year}-${month}-${day}-%`);

    const count = (existingSDs?.length || 0) + 1;
    const letter = String.fromCharCode(64 + count); // A, B, C, etc.

    return `SD-${year}-${month}-${day}-UAT-${letter}`;
  }

  /**
   * Map test priority to SD priority
   */
  mapPriority(testPriority, justification) {
    // Map UAT priority to SD priority (as strings)
    // Strategic directives only support: 'critical' and 'high'
    const priorityMap = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'high',  // Map medium to high
      'low': 'high'       // Map low to high
    };

    let sdPriority = priorityMap[testPriority?.toLowerCase()] || 'high';

    // Upgrade to critical if AI justification indicates urgency
    if (justification?.includes('urgent') || justification?.includes('blocking') || justification?.includes('critical')) {
      sdPriority = 'critical';
    }

    return sdPriority;
  }

  /**
   * Extract components from scope description
   */
  extractComponents(scope) {
    if (!scope) return [];

    const components = [];
    const patterns = [
      /component[s]?:\s*([^,\n]+)/gi,
      /affect[s]?:\s*([^,\n]+)/gi,
      /module[s]?:\s*([^,\n]+)/gi
    ];

    patterns.forEach(pattern => {
      const matches = scope.matchAll(pattern);
      for (const match of matches) {
        components.push(match[1].trim());
      }
    });

    return components;
  }

  /**
   * Parse success criteria into structured format
   */
  parseSuccessCriteria(criteria) {
    if (!criteria) return [];

    const lines = criteria.split('\n').filter(line => line.trim());
    return lines.map((line, index) => ({
      id: index + 1,
      description: line.replace(/^[-*•]\s*/, '').trim(),
      measurable: line.includes('should') || line.includes('must') || line.includes('will')
    }));
  }

  /**
   * Create linking table in database
   */
  async createLinkingTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS uat_finding_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        uat_result_id UUID,
        uat_case_id TEXT,
        uat_run_id UUID,
        directive_submission_id UUID REFERENCES directive_submissions(id),
        action_type VARCHAR(50),
        action_id TEXT,
        created_by VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_uat_finding_actions_result
        ON uat_finding_actions(uat_result_id);
      CREATE INDEX IF NOT EXISTS idx_uat_finding_actions_submission
        ON uat_finding_actions(directive_submission_id);
    `;

    // Note: This would need to be executed via a database migration
    console.log(chalk.yellow('Note: uat_finding_actions table needs to be created via database migration'));
  }
}

// CLI Usage
async function main() {
  const converter = new UATToSDConverter();

  // Example test result (can be passed from command line or API)
  const testResult = {
    case_id: process.argv[2] || 'MANUAL-AUTH-001',
    title: process.argv[3] || 'Login with remember me checked - Verify functionality',
    section: 'authentication',
    priority: 'critical',
    status: 'FAIL',
    description: 'Navigate to login page, check "Remember Me" checkbox, enter valid credentials, login. Close browser completely, reopen, navigate to app URL. Verify auto-login or pre-filled credentials.',
    expected: 'User should remain logged in after browser restart when Remember Me is checked',
    actual: 'User is logged out after browser restart, Remember Me functionality not working',
    notes: 'Critical authentication issue affecting user experience. Remember Me checkbox appears to have no effect.',
    run_id: process.argv[4] || null
  };

  try {
    const submission = await converter.convertTestFailureToSD(testResult);

    console.log(chalk.cyan('\n═'.repeat(60)));
    console.log(chalk.green('🎉 Conversion complete!'));
    console.log(chalk.yellow('\n📋 Next Steps:'));
    console.log(chalk.white('1. Review the submission in the dashboard'));
    console.log(chalk.white('2. Approve or edit as needed'));
    console.log(chalk.white('3. The SD will enter the standard workflow'));
    console.log(chalk.cyan('═'.repeat(60) + '\n'));

    process.exit(0);
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { UATToSDConverter };