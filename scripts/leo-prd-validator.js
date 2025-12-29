#!/usr/bin/env node

/**
 * LEO Product Requirements Document (PRD) Validator
 * Validates PRDs follow LEO Protocol standards and are properly linked to SDs
 * For use by LEAD and PLAN agents when creating/reviewing PRDs
 */

import fs from 'fs';
import path from 'path';

class PRDValidator {
  constructor() {
    // Critical sections that MUST be present
    this.requiredSections = [
      { name: 'Product Requirements Document', pattern: /^#.*Product Requirements Document|^#.*PRD[-:\s]/m },
      { name: 'Executive Summary', pattern: /^#{1,3}.*Executive Summary|^\*\*Executive Summary\*\*/m },
      { name: 'Problem Statement', pattern: /^#{1,3}.*Problem Statement|^\*\*Problem Statement\*\*/m },
      { name: 'Objectives', pattern: /^#{1,3}.*Objectives|^\*\*Objectives\*\*/m },
      { name: 'User Stories', pattern: /^#{1,3}.*User Stories|^#{1,3}.*User Requirements/m },
      { name: 'Functional Requirements', pattern: /^#{1,3}.*Functional Requirements|^#{1,3}.*Features/m },
      { name: 'Non-Functional Requirements', pattern: /^#{1,3}.*Non-Functional Requirements|^#{1,3}.*NFRs/m },
      { name: 'Success Criteria', pattern: /^#{1,3}.*Success Criteria|^#{1,3}.*Success Metrics/m },
      { name: 'Acceptance Criteria', pattern: /^#{1,3}.*Acceptance Criteria|^#{1,3}.*Definition of Done/m }
    ];
    
    // Highly recommended sections
    this.recommendedSections = [
      { name: 'Related Strategic Directive', pattern: /Strategic Directive.*SD-\d{3}|Related SD:|Parent SD:/mi },
      { name: 'Scope', pattern: /^#{1,3}.*Scope|^\*\*Scope\*\*/m },
      { name: 'Out of Scope', pattern: /^#{1,3}.*Out of Scope|^#{1,3}.*Exclusions/m },
      { name: 'User Personas', pattern: /^#{1,3}.*User Personas|^#{1,3}.*Target Users/m },
      { name: 'Technical Requirements', pattern: /^#{1,3}.*Technical Requirements|^#{1,3}.*Technical Specifications/m },
      { name: 'Dependencies', pattern: /^#{1,3}.*Dependencies|^\*\*Dependencies\*\*/m },
      { name: 'Risks', pattern: /^#{1,3}.*Risks|^#{1,3}.*Risk Analysis/m },
      { name: 'Timeline', pattern: /^#{1,3}.*Timeline|^#{1,3}.*Milestones/m },
      { name: 'Testing Strategy', pattern: /^#{1,3}.*Testing Strategy|^#{1,3}.*Test Plan/m },
      { name: 'Vision QA Requirements', pattern: /Vision QA|Visual Testing|UI Testing/mi }
    ];
    
    // Optional but valuable sections
    this.optionalSections = [
      { name: 'Mockups/Wireframes', pattern: /^#{1,3}.*Mockups|^#{1,3}.*Wireframes|^#{1,3}.*Design/m },
      { name: 'API Specifications', pattern: /^#{1,3}.*API|^#{1,3}.*Endpoints/m },
      { name: 'Data Model', pattern: /^#{1,3}.*Data Model|^#{1,3}.*Database Schema/m },
      { name: 'Security Requirements', pattern: /^#{1,3}.*Security|^#{1,3}.*Privacy/m },
      { name: 'Performance Requirements', pattern: /^#{1,3}.*Performance|^#{1,3}.*Scalability/m },
      { name: 'Accessibility Requirements', pattern: /^#{1,3}.*Accessibility|WCAG|a11y/mi },
      { name: 'Rollout Plan', pattern: /^#{1,3}.*Rollout|^#{1,3}.*Deployment|^#{1,3}.*Release/m }
    ];
    
    // User story patterns
    this.userStoryPatterns = [
      /As a .+, I want .+, so that .+/,
      /As an? .+, I need .+, in order to .+/,
      /Given .+, When .+, Then .+/
    ];
    
    // Requirement ID patterns
    this.requirementIdPatterns = [
      /FR-\d{3}/,   // Functional Requirement ID
      /NFR-\d{3}/,  // Non-Functional Requirement ID
      /US-\d{3}/,   // User Story ID
      /REQ-\d{3}/,  // Generic Requirement ID
      /TC-\d{3}/    // Test Case ID
    ];
  }

  /**
   * Validate a PRD file
   */
  validateFile(filePath) {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║        PRD Validator v1.0 - LEO Protocol      ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    console.log(`📄 File: ${filePath}\n`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return false;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const results = this.validate(content, filePath);
    
    // Display results
    this.displayResults(results);
    
    // Generate recommendations
    if (results.score < 90) {
      this.generateRecommendations(results);
    }
    
    // Save validation report
    const reportPath = this.saveReport(filePath, results);
    console.log(`\n📋 Validation report saved: ${reportPath}`);
    
    return results.valid;
  }

  /**
   * Validate PRD content
   */
  validate(content, filePath = '') {
    const results = {
      valid: true,
      score: 100,
      errors: [],
      warnings: [],
      suggestions: [],
      sections: {
        required: {},
        recommended: {},
        optional: {}
      },
      metadata: {},
      quality: {
        userStories: { found: 0, wellFormed: 0 },
        requirements: { found: 0, withIds: 0 },
        testability: 0,
        completeness: 0
      }
    };
    
    // Check required sections
    this.requiredSections.forEach(section => {
      const found = section.pattern.test(content);
      results.sections.required[section.name] = found;
      
      if (!found) {
        results.errors.push(`Missing required section: ${section.name}`);
        results.valid = false;
        results.score -= 10;
      }
    });
    
    // Check recommended sections
    this.recommendedSections.forEach(section => {
      const found = section.pattern.test(content);
      results.sections.recommended[section.name] = found;
      
      if (!found) {
        results.warnings.push(`Missing recommended section: ${section.name}`);
        results.score -= 3;
      }
    });
    
    // Check optional sections
    this.optionalSections.forEach(section => {
      const found = section.pattern.test(content);
      results.sections.optional[section.name] = found;
      
      if (!found && this.shouldSuggestSection(section.name, content)) {
        results.suggestions.push(`Consider adding: ${section.name}`);
      }
    });
    
    // Validate specific content quality
    this.validateMetadata(content, results);
    this.validateUserStories(content, results);
    this.validateRequirements(content, results);
    this.validateLinkages(content, results, filePath);
    this.validateTestability(content, results);
    this.validateVisionQA(content, results);
    
    // Calculate quality score
    this.calculateQualityScore(results);
    
    // Ensure score doesn't go below 0
    results.score = Math.max(0, results.score);
    
    return results;
  }

  /**
   * Validate PRD metadata
   */
  validateMetadata(content, results) {
    // Check for PRD ID
    const prdIdMatch = content.match(/PRD[-_]([A-Z0-9-]+)/i);
    if (prdIdMatch) {
      results.metadata.prdId = prdIdMatch[0];
    } else {
      results.errors.push('No PRD ID found (expected format: PRD-XXX or PRD_XXX)');
      results.valid = false;
      results.score -= 10;
    }
    
    // Check for related SD
    const sdMatch = content.match(/SD-(\d{3,4}[A-Z]?)/);
    if (sdMatch) {
      results.metadata.relatedSD = sdMatch[0];
    } else {
      results.warnings.push('No Strategic Directive reference found');
      results.score -= 5;
    }
    
    // Check for version
    const versionMatch = content.match(/Version[:\s]+(\d+\.\d+(?:\.\d+)?)/i);
    if (versionMatch) {
      results.metadata.version = versionMatch[1];
    } else {
      results.suggestions.push('Consider adding version number');
    }
    
    // Check for author/owner
    const authorMatch = content.match(/Author[:\s]+([^\n]+)|Owner[:\s]+([^\n]+)|Created by[:\s]+([^\n]+)/i);
    if (authorMatch) {
      results.metadata.author = authorMatch[1] || authorMatch[2] || authorMatch[3];
    }
    
    // Check for dates
    const dateMatch = content.match(/Date[:\s]+(\d{4}-\d{2}-\d{2})|Created[:\s]+(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
      results.metadata.date = dateMatch[1] || dateMatch[2];
    }
    
    // Check for status
    const statusMatch = content.match(/Status[:\s]+(Draft|Review|Approved|Final|In Progress)/i);
    if (statusMatch) {
      results.metadata.status = statusMatch[1];
    } else {
      results.suggestions.push('Consider adding document status (Draft/Review/Approved)');
    }
  }

  /**
   * Validate user stories
   */
  validateUserStories(content, results) {
    // Find user stories section
    const userStoriesMatch = content.match(/#{1,3}.*User Stories[\s\S]*?(?=^#{1,3}|\z)/m);
    if (!userStoriesMatch) return;
    
    const storiesSection = userStoriesMatch[0];
    
    // Count total user stories (bullet points or numbered items)
    const storyLines = storiesSection.match(/^[\s]*[-*•]\s+.+$/gm) || [];
    results.quality.userStories.found = storyLines.length;
    
    // Check for well-formed user stories
    let wellFormedCount = 0;
    storyLines.forEach(line => {
      const isWellFormed = this.userStoryPatterns.some(pattern => pattern.test(line));
      if (isWellFormed) wellFormedCount++;
    });
    
    results.quality.userStories.wellFormed = wellFormedCount;
    
    // Validate quality
    if (results.quality.userStories.found === 0) {
      results.errors.push('No user stories found in User Stories section');
      results.score -= 10;
    } else if (wellFormedCount < results.quality.userStories.found / 2) {
      results.warnings.push(`Only ${wellFormedCount}/${results.quality.userStories.found} user stories follow standard format (As a... I want... So that...)`);
      results.score -= 5;
    }
    
    // Check for acceptance criteria in user stories
    const hasAcceptanceCriteria = /acceptance criteria|AC:|Given.*When.*Then/i.test(storiesSection);
    if (!hasAcceptanceCriteria && results.quality.userStories.found > 0) {
      results.suggestions.push('Consider adding acceptance criteria to user stories');
    }
  }

  /**
   * Validate requirements
   */
  validateRequirements(content, results) {
    // Find functional requirements
    const funcReqMatch = content.match(/#{1,3}.*Functional Requirements[\s\S]*?(?=^#{1,3}|\z)/m);
    if (funcReqMatch) {
      const reqSection = funcReqMatch[0];
      const reqLines = reqSection.match(/^[\s]*[-*•\d.]+\s+.+$/gm) || [];
      results.quality.requirements.found = reqLines.length;
      
      // Check for requirement IDs
      let withIds = 0;
      reqLines.forEach(line => {
        const hasId = this.requirementIdPatterns.some(pattern => pattern.test(line));
        if (hasId) withIds++;
      });
      results.quality.requirements.withIds = withIds;
      
      if (results.quality.requirements.found > 5 && withIds < results.quality.requirements.found / 2) {
        results.warnings.push('Most requirements lack unique IDs (FR-XXX, REQ-XXX)');
        results.score -= 3;
      }
    }
    
    // Check for measurable requirements
    const measurableKeywords = /must|shall|will|should|within \d+|less than|greater than|between \d+/gi;
    const measurableMatches = content.match(measurableKeywords) || [];
    
    if (measurableMatches.length < 5) {
      results.suggestions.push('Requirements should be more measurable (use: must, shall, within X seconds, etc.)');
    }
    
    // Check for prioritization
    const hasPriority = /Priority[:\s]|MoSCoW|P0|P1|P2|P3|High|Medium|Low/i.test(content);
    if (!hasPriority) {
      results.suggestions.push('Consider adding requirement prioritization (MoSCoW, P0/P1/P2, High/Medium/Low)');
    }
  }

  /**
   * Validate linkages to other documents
   */
  validateLinkages(content, results, _filePath) {
    // Check SD linkage
    if (results.metadata.relatedSD) {
      // Try to find the actual SD file
      const sdFileName = `${results.metadata.relatedSD}.md`;
      const possiblePaths = [
        path.join('docs', 'strategic-directives', sdFileName),
        path.join('docs', 'wbs_artefacts', 'strategic_directives', sdFileName),
        path.join('docs', 'strategic_directives', sdFileName)
      ];
      
      let sdFound = false;
      for (const sdPath of possiblePaths) {
        if (fs.existsSync(sdPath)) {
          sdFound = true;
          results.metadata.sdPath = sdPath;
          break;
        }
      }
      
      if (!sdFound) {
        results.warnings.push(`Referenced Strategic Directive ${results.metadata.relatedSD} file not found`);
        results.score -= 5;
      }
    }
    
    // Check for test plan linkage
    const hasTestPlan = /test plan|test strategy|testing approach/i.test(content);
    if (!hasTestPlan) {
      results.warnings.push('No test plan or testing strategy mentioned');
      results.score -= 3;
    }
    
    // Check for design/mockup references
    const hasUIWork = /UI|user interface|frontend|screen|page|component|button|form/i.test(content);
    const hasDesignRefs = /mockup|wireframe|design|figma|sketch|prototype/i.test(content);
    
    if (hasUIWork && !hasDesignRefs) {
      results.suggestions.push('UI work detected - consider adding mockups or design references');
    }
  }

  /**
   * Validate testability
   */
  validateTestability(content, results) {
    let testabilityScore = 0;
    const maxScore = 100;
    
    // Check for specific acceptance criteria
    const acceptanceCriteriaCount = (content.match(/acceptance criteria|AC:|Given.*When.*Then/gi) || []).length;
    if (acceptanceCriteriaCount > 0) {
      testabilityScore += Math.min(30, acceptanceCriteriaCount * 10);
    }
    
    // Check for measurable success criteria
    const measurableCount = (content.match(/\d+%|\d+ seconds|\d+ users|\d+ requests/gi) || []).length;
    if (measurableCount > 0) {
      testabilityScore += Math.min(20, measurableCount * 5);
    }
    
    // Check for test case references
    const testCaseRefs = (content.match(/TC-\d+|test case|test scenario/gi) || []).length;
    if (testCaseRefs > 0) {
      testabilityScore += Math.min(20, testCaseRefs * 5);
    }
    
    // Check for clear scope boundaries
    const hasInScope = /in scope|included/i.test(content);
    const hasOutScope = /out of scope|excluded|not included/i.test(content);
    if (hasInScope && hasOutScope) {
      testabilityScore += 15;
    }
    
    // Check for error scenarios
    const hasErrorCases = /error|exception|failure|invalid|edge case/i.test(content);
    if (hasErrorCases) {
      testabilityScore += 15;
    }
    
    results.quality.testability = Math.min(maxScore, testabilityScore);
    
    if (results.quality.testability < 50) {
      results.warnings.push(`Low testability score (${results.quality.testability}/100) - add more specific acceptance criteria`);
      results.score -= 5;
    }
  }

  /**
   * Validate Vision QA requirements for UI work
   */
  validateVisionQA(content, results) {
    const hasUIWork = /UI|user interface|frontend|screen|page|component|button|form|layout|responsive/i.test(content);
    const hasVisionQA = /Vision QA|Visual Testing|visual regression|screenshot|UI testing/i.test(content);
    
    if (hasUIWork) {
      results.metadata.hasUIWork = true;
      
      if (!hasVisionQA) {
        results.warnings.push('UI work detected but no Vision QA requirements specified');
        results.suggestions.push('Add Vision QA requirements section with test goals and configuration');
        results.score -= 5;
      } else {
        // Check for Vision QA configuration
        const vqConfigMatch = content.match(/```json[^`]*vision[^`]*```/i);
        if (vqConfigMatch) {
          results.metadata.hasVisionQAConfig = true;
        } else {
          results.suggestions.push('Consider adding Vision QA configuration JSON for UI testing');
        }
      }
    }
  }

  /**
   * Calculate overall quality score
   */
  calculateQualityScore(results) {
    let completeness = 0;
    const totalSections = Object.keys(results.sections.required).length + 
                         Object.keys(results.sections.recommended).length;
    
    const foundSections = Object.values(results.sections.required).filter(v => v).length +
                         Object.values(results.sections.recommended).filter(v => v).length;
    
    completeness = Math.round((foundSections / totalSections) * 100);
    results.quality.completeness = completeness;
    
    // Adjust score based on quality metrics
    if (results.quality.userStories.found === 0) {
      results.quality.completeness -= 10;
    }
    
    if (results.quality.requirements.found === 0) {
      results.quality.completeness -= 10;
    }
    
    results.quality.completeness = Math.max(0, results.quality.completeness);
  }

  /**
   * Determine if a section should be suggested
   */
  shouldSuggestSection(sectionName, content) {
    const suggestions = {
      'API Specifications': /API|endpoint|REST|GraphQL|webhook/i,
      'Data Model': /database|table|schema|entity|model/i,
      'Security Requirements': /auth|password|encryption|sensitive|PII|GDPR/i,
      'Performance Requirements': /performance|speed|latency|throughput|load/i,
      'Accessibility Requirements': /accessibility|screen reader|keyboard|WCAG/i,
      'Mockups/Wireframes': /UI|interface|design|layout|screen/i
    };
    
    const pattern = suggestions[sectionName];
    return pattern ? pattern.test(content) : false;
  }

  /**
   * Display validation results
   */
  displayResults(results) {
    console.log('═══════════════════════════════════════════════');
    console.log(`VALIDATION SCORE: ${results.score}/100 ${this.getGrade(results.score)}`);
    console.log(`STATUS: ${results.valid ? '✅ VALID' : '❌ INVALID'}`);
    console.log('═══════════════════════════════════════════════\n');
    
    // Metadata
    if (Object.keys(results.metadata).length > 0) {
      console.log('📌 Document Metadata:');
      if (results.metadata.prdId) console.log(`   PRD ID: ${results.metadata.prdId}`);
      if (results.metadata.relatedSD) console.log(`   Related SD: ${results.metadata.relatedSD}`);
      if (results.metadata.version) console.log(`   Version: ${results.metadata.version}`);
      if (results.metadata.status) console.log(`   Status: ${results.metadata.status}`);
      if (results.metadata.author) console.log(`   Author: ${results.metadata.author}`);
      console.log();
    }
    
    // Required sections
    console.log('📋 Required Sections:');
    Object.entries(results.sections.required).forEach(([section, found]) => {
      console.log(`   ${found ? '✅' : '❌'} ${section}`);
    });
    
    // Recommended sections
    console.log('\n📝 Recommended Sections:');
    Object.entries(results.sections.recommended).forEach(([section, found]) => {
      console.log(`   ${found ? '✅' : '⚠️'} ${section}`);
    });
    
    // Optional sections (only show present ones)
    const presentOptional = Object.entries(results.sections.optional).filter(([_, found]) => found);
    if (presentOptional.length > 0) {
      console.log('\n📎 Optional Sections Present:');
      presentOptional.forEach(([section]) => {
        console.log(`   ✅ ${section}`);
      });
    }
    
    // Quality metrics
    console.log('\n📊 Quality Metrics:');
    console.log(`   User Stories: ${results.quality.userStories.wellFormed}/${results.quality.userStories.found} well-formed`);
    console.log(`   Requirements: ${results.quality.requirements.withIds}/${results.quality.requirements.found} with IDs`);
    console.log(`   Testability: ${results.quality.testability}/100`);
    console.log(`   Completeness: ${results.quality.completeness}%`);
    
    // Errors
    if (results.errors.length > 0) {
      console.log('\n❌ Errors (must fix):');
      results.errors.forEach(error => {
        console.log(`   • ${error}`);
      });
    }
    
    // Warnings
    if (results.warnings.length > 0) {
      console.log('\n⚠️ Warnings (should fix):');
      results.warnings.forEach(warning => {
        console.log(`   • ${warning}`);
      });
    }
    
    // Suggestions
    if (results.suggestions.length > 0) {
      console.log('\n💡 Suggestions (nice to have):');
      results.suggestions.forEach(suggestion => {
        console.log(`   • ${suggestion}`);
      });
    }
  }

  /**
   * Generate specific recommendations
   */
  generateRecommendations(results) {
    console.log('\n📚 Recommendations for Improvement:');
    console.log('─'.repeat(47));
    
    if (results.quality.userStories.wellFormed < results.quality.userStories.found) {
      console.log(`
📝 User Story Format:
   Use: "As a [role], I want [feature], so that [benefit]"
   Example: "As a user, I want to reset my password, so that I can regain access to my account"`);
    }
    
    if (results.quality.requirements.withIds < results.quality.requirements.found / 2) {
      console.log(`
🏷️ Requirement IDs:
   Use consistent IDs like:
   - FR-001: Functional Requirement
   - NFR-001: Non-Functional Requirement
   - US-001: User Story`);
    }
    
    if (results.quality.testability < 50) {
      console.log(`
🧪 Improve Testability:
   - Add specific acceptance criteria for each user story
   - Use measurable metrics (e.g., "within 2 seconds")
   - Include error scenarios and edge cases
   - Define clear success/failure conditions`);
    }
    
    if (!results.metadata.relatedSD) {
      console.log(`
🔗 Link to Strategic Directive:
   Add: "Related Strategic Directive: SD-XXX"
   This ensures PRD aligns with strategic goals`);
    }
    
    if (results.metadata.hasUIWork && !results.metadata.hasVisionQAConfig) {
      console.log(`
👁️ Vision QA Configuration:
   Since this PRD includes UI work, add:
   \`\`\`json
   {
     "visionQA": {
       "status": "REQUIRED",
       "testGoals": ["List specific UI test goals"],
       "maxIterations": 30,
       "costLimit": 2.00
     }
   }
   \`\`\``);
    }
  }

  /**
   * Get letter grade
   */
  getGrade(score) {
    if (score >= 95) return '🌟 A+';
    if (score >= 90) return '⭐ A';
    if (score >= 85) return '✨ B+';
    if (score >= 80) return '✓ B';
    if (score >= 75) return '⚡ C+';
    if (score >= 70) return '🔸 C';
    if (score >= 60) return '⚠️ D';
    return '❌ F';
  }

  /**
   * Save validation report
   */
  saveReport(filePath, results) {
    const reportDir = path.join('docs', 'validation-reports', 'prd');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const basename = path.basename(filePath, '.md');
    const reportPath = path.join(reportDir, `${basename}-validation-${timestamp}.json`);
    
    const report = {
      file: filePath,
      timestamp: new Date().toISOString(),
      results,
      recommendations: this.generateRecommendationsJSON(results)
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  }

  /**
   * Generate recommendations as JSON
   */
  generateRecommendationsJSON(results) {
    const recommendations = [];
    
    results.errors.forEach(error => {
      recommendations.push({
        type: 'error',
        priority: 'critical',
        message: error,
        action: 'Must fix before approval'
      });
    });
    
    results.warnings.forEach(warning => {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        message: warning,
        action: 'Should fix for quality'
      });
    });
    
    results.suggestions.forEach(suggestion => {
      recommendations.push({
        type: 'suggestion',
        priority: 'medium',
        message: suggestion,
        action: 'Consider for completeness'
      });
    });
    
    return recommendations;
  }

  /**
   * Auto-fix common issues
   */
  autoFix(filePath) {
    console.log('\n🔧 Attempting auto-fix...\n');
    
    let content = fs.readFileSync(filePath, 'utf8');
    let fixed = false;
    const fixes = [];
    
    // Add PRD ID if missing
    if (!content.match(/PRD[-_][A-Z0-9-]+/i)) {
      const timestamp = Date.now().toString().slice(-6);
      const prdId = `PRD-${timestamp}`;
      content = `# Product Requirements Document: ${prdId}\n\n${content}`;
      fixes.push(`Added PRD ID: ${prdId}`);
      fixed = true;
    }
    
    // Add metadata section if missing
    if (!content.includes('## Metadata') && !content.includes('## Document Information')) {
      const metadataSection = `## Document Information\n\n- **PRD ID**: ${content.match(/PRD[-_][A-Z0-9-]+/i)?.[0] || 'PRD-DRAFT'}\n- **Version**: 1.0.0\n- **Status**: Draft\n- **Created**: ${new Date().toISOString().split('T')[0]}\n- **Author**: [To be filled]\n\n`;
      
      // Insert after title
      const titleEnd = content.indexOf('\n\n');
      if (titleEnd > -1) {
        content = content.slice(0, titleEnd + 2) + metadataSection + content.slice(titleEnd + 2);
        fixes.push('Added Document Information section');
        fixed = true;
      }
    }
    
    // Add Vision QA section for UI work
    const hasUIWork = /UI|interface|frontend|component/i.test(content);
    const hasVisionQA = /Vision QA/i.test(content);
    
    if (hasUIWork && !hasVisionQA) {
      const vqSection = '\n## Vision QA Requirements\n\n**Status**: REQUIRED\n\n**Test Goals**:\n- [ ] All UI components render correctly\n- [ ] Forms validate properly\n- [ ] Responsive design works on mobile/tablet/desktop\n- [ ] Accessibility standards met (WCAG 2.1 AA)\n\n**Configuration**:\n```json\n{\n  "appId": "APP-001",\n  "maxIterations": 30,\n  "costLimit": 2.00,\n  "viewports": ["desktop", "mobile"],\n  "checkAccessibility": true\n}\n```\n';
      
      // Add before success criteria or at end
      const successIndex = content.search(/##.*Success Criteria/i);
      if (successIndex > -1) {
        content = content.slice(0, successIndex) + vqSection + '\n' + content.slice(successIndex);
      } else {
        content += vqSection;
      }
      fixes.push('Added Vision QA Requirements section');
      fixed = true;
    }
    
    // Add template for missing required sections
    const requiredTemplates = {
      'Executive Summary': '\n## Executive Summary\n\n[Provide a brief overview of the product/feature being specified]\n\n',
      'Problem Statement': '\n## Problem Statement\n\n[Describe the problem this product/feature solves]\n\n',
      'User Stories': '\n## User Stories\n\n- As a [user type], I want [feature], so that [benefit]\n- As a [user type], I want [feature], so that [benefit]\n\n',
      'Success Criteria': '\n## Success Criteria\n\n- [ ] [Measurable success metric]\n- [ ] [Measurable success metric]\n\n'
    };
    
    this.requiredSections.forEach(section => {
      if (!section.pattern.test(content) && requiredTemplates[section.name]) {
        content += requiredTemplates[section.name];
        fixes.push(`Added template for: ${section.name}`);
        fixed = true;
      }
    });
    
    if (fixed) {
      // Create backup
      const backupPath = filePath.replace('.md', '.backup.md');
      fs.copyFileSync(filePath, backupPath);
      
      // Save fixed content
      fs.writeFileSync(filePath, content);
      
      console.log('✅ Auto-fix completed!');
      console.log('\n📝 Fixes applied:');
      fixes.forEach(fix => console.log(`   • ${fix}`));
      console.log(`\n📄 Backup saved: ${backupPath}`);
      
      return true;
    } else {
      console.log('ℹ️ No auto-fixable issues found');
      return false;
    }
  }

  /**
   * Generate PRD template
   */
  static generateTemplate(outputPath) {
    const template = `# Product Requirements Document: PRD-XXX

## Document Information

- **PRD ID**: PRD-XXX
- **Related SD**: SD-XXX
- **Version**: 1.0.0
- **Status**: Draft
- **Created**: ${new Date().toISOString().split('T')[0]}
- **Author**: [Your Name/Role]
- **Last Updated**: ${new Date().toISOString().split('T')[0]}

## Executive Summary

[Provide a concise overview of the product/feature, its purpose, and expected impact]

## Problem Statement

[Clearly describe the problem this product/feature addresses]
- What is the current situation?
- What are the pain points?
- Who is affected?
- What is the impact of not solving this?

## Objectives

[List the key objectives this PRD aims to achieve]
- Primary Objective: [Main goal]
- Secondary Objectives:
  - [Additional goal 1]
  - [Additional goal 2]

## Scope

### In Scope
- [Feature/functionality included]
- [Feature/functionality included]

### Out of Scope
- [Feature/functionality excluded]
- [Feature/functionality excluded]

## User Personas

### Primary Users
- **Persona Name**: [Description]
  - Goals: [What they want to achieve]
  - Pain Points: [Current frustrations]
  - Technical Proficiency: [Low/Medium/High]

### Secondary Users
- **Persona Name**: [Description]

## User Stories

### Epic: [Epic Name]

#### US-001: [User Story Title]
**As a** [user type]  
**I want** [feature/capability]  
**So that** [benefit/value]

**Acceptance Criteria:**
- [ ] Given [context], When [action], Then [outcome]
- [ ] Given [context], When [action], Then [outcome]

**Priority**: P0/P1/P2
**Estimated Effort**: S/M/L/XL

## Functional Requirements

### FR-001: [Requirement Name]
**Description**: [Detailed description]  
**Priority**: Must Have / Should Have / Could Have / Won't Have  
**Dependencies**: [List any dependencies]

### FR-002: [Requirement Name]
**Description**: [Detailed description]

## Non-Functional Requirements

### NFR-001: Performance
- Page load time < 2 seconds
- API response time < 200ms for 95% of requests
- Support 1000 concurrent users

### NFR-002: Security
- All data encrypted in transit (TLS 1.3)
- Authentication via OAuth 2.0
- Role-based access control (RBAC)

### NFR-003: Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatibility

## Technical Requirements

### Architecture
[Describe technical architecture, components, services]

### Technology Stack
- Frontend: [Technologies]
- Backend: [Technologies]
- Database: [Technologies]
- Infrastructure: [Technologies]

### API Specifications
[List key APIs, endpoints, data formats]

### Data Model
[Describe key entities, relationships, schemas]

## Vision QA Requirements

**Status**: REQUIRED/RECOMMENDED/OPTIONAL

**Test Goals**:
- [ ] All UI components render correctly across browsers
- [ ] Forms validate and submit properly
- [ ] Responsive design works on all viewports
- [ ] Accessibility standards met

**Configuration**:
\`\`\`json
{
  "appId": "APP-XXX",
  "maxIterations": 30,
  "costLimit": 2.00,
  "viewports": ["desktop", "tablet", "mobile"],
  "checkAccessibility": true,
  "consensusRuns": 1
}
\`\`\`

## Testing Strategy

### Unit Testing
- Coverage target: 80%
- Key components to test: [List]

### Integration Testing
- API contract testing
- Database integration tests

### E2E Testing
- Critical user flows
- Vision QA automated testing

### Performance Testing
- Load testing scenarios
- Stress testing thresholds

## Success Criteria

### Quantitative Metrics
- [ ] [Metric with specific target]
- [ ] [Metric with specific target]

### Qualitative Metrics
- [ ] User satisfaction score > X
- [ ] Usability testing success rate > Y%

## Acceptance Criteria

### Definition of Done
- [ ] All functional requirements implemented
- [ ] All tests passing (unit, integration, E2E)
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Vision QA validation passed
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Accessibility audit passed

## Dependencies

### Internal Dependencies
- [Team/System]: [What is needed]

### External Dependencies
- [Service/API]: [What is needed]

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk description] | Low/Med/High | Low/Med/High | [Mitigation strategy] |

## Timeline and Milestones

| Milestone | Target Date | Deliverables |
|-----------|------------|--------------|
| Design Complete | YYYY-MM-DD | Mockups, Design System Updates |
| Alpha Release | YYYY-MM-DD | Core Features |
| Beta Release | YYYY-MM-DD | All Features, Testing |
| GA Release | YYYY-MM-DD | Production Ready |

## Rollout Plan

### Phase 1: Internal Testing
- Target: Internal team
- Duration: X weeks
- Success Criteria: [Metrics]

### Phase 2: Beta Users
- Target: X% of users
- Duration: X weeks
- Success Criteria: [Metrics]

### Phase 3: General Availability
- Target: All users
- Success Criteria: [Metrics]

## Appendices

### A. Mockups/Wireframes
[Links or embedded images]

### B. Research Data
[User research, market analysis, competitive analysis]

### C. Technical Specifications
[Detailed technical documentation links]

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | YYYY-MM-DD | [Name] | Initial draft |
`;

    fs.writeFileSync(outputPath, template);
    console.log(`✅ PRD template generated: ${outputPath}`);
    return template;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 1 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: leo-prd-validator <file.md> [options]

Options:
  --fix          Attempt to auto-fix common issues
  --strict       Use strict validation (fail on warnings)
  --template     Generate a PRD template file

Examples:
  node scripts/leo-prd-validator.js docs/product-requirements/PRD-001.md
  node scripts/leo-prd-validator.js PRD-001.md --fix
  node scripts/leo-prd-validator.js --template docs/templates/PRD-template.md

PRD Validation Checks:
  ✓ All required sections present
  ✓ Proper user story format
  ✓ Requirements have IDs
  ✓ Links to Strategic Directive
  ✓ Vision QA for UI work
  ✓ Testability score
  ✓ Completeness score
`);
    process.exit(0);
  }
  
  // Generate template mode
  if (args[0] === '--template') {
    const outputPath = args[1] || 'PRD-template.md';
    PRDValidator.generateTemplate(outputPath);
    process.exit(0);
  }
  
  const validator = new PRDValidator();
  const filePath = args[0];
  const autoFix = args.includes('--fix');
  const strict = args.includes('--strict');
  
  if (autoFix) {
    validator.autoFix(filePath);
    console.log('\n─'.repeat(50));
    console.log('Validating fixed document...\n');
  }
  
  const valid = validator.validateFile(filePath);
  
  if (!valid || (strict && validator.validate(fs.readFileSync(filePath, 'utf8')).warnings.length > 0)) {
    process.exit(1);
  }
}

export default PRDValidator;