#!/usr/bin/env node

/**
 * Smart Sub-Agent Detection System
 * Intelligently detects which sub-agents should run based on semantic patterns
 * Part of LEO Protocol v4.2.0 - Enhanced Validation System
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class SmartSubAgentDetector {
  constructor() {
    // Comprehensive pattern definitions for each sub-agent
    this.patterns = {
      VALIDATION: {
        name: 'Validation Sub-Agent',
        patterns: [
          /existing.{0,20}implement/i,
          /already.{0,20}(built|created|implemented|exists)/i,
          /duplicate.{0,20}(feature|function|code)/i,
          /conflict/i,
          /codebase.{0,20}(check|scan|review)/i,
          /similar.{0,20}(feature|implementation)/i
        ],
        filePatterns: [],
        contextClues: ['review existing', 'check for duplicates', 'prevent redundant'],
        confidence_threshold: 10
      },

      DESIGN: {
        name: 'Design Sub-Agent',
        patterns: [
          /\b(UI|user interface|interface|frontend|front-end)\b/i,
          /\b(UX|user experience|usability|workflow)\b/i,
          /\b(screen|page|view|component|widget|element)\b/i,
          /\b(button|form|input|modal|dialog|dropdown|menu)\b/i,
          /\b(color|theme|style|CSS|styling|styled-components)\b/i,
          /\b(responsive|mobile|desktop|tablet|breakpoint)\b/i,
          /\b(accessibility|a11y|WCAG|screen reader|aria)\b/i,
          /\b(layout|grid|flexbox|positioning|spacing)\b/i,
          /\b(navigation|sidebar|header|footer|navbar)\b/i,
          /\b(animation|transition|hover|interaction)\b/i,
          /\b(design system|component library|UI kit)\b/i,
          /\b(figma|sketch|wireframe|mockup|prototype)\b/i
        ],
        filePatterns: [
          /\.(jsx?|tsx?)$/,
          /\.(css|scss|sass|less)$/,
          /components?\//,
          /views?\//,
          /pages?\//,
          /styles?\//,
          /ui\//
        ],
        contextClues: ['user sees', 'user clicks', 'visual', 'display', 'render', 'show'],
        confidence_threshold: 15
      },

      DATABASE: {
        name: 'Database Sub-Agent',
        patterns: [
          /\b(database|db|data store|persistence)\b/i,
          /\b(table|column|field|row|record)\b/i,
          /\b(schema|migration|model|entity)\b/i,
          /\b(query|SQL|insert|update|delete|select|join)\b/i,
          /\b(postgres|mysql|mongodb|redis|sqlite)\b/i,
          /\b(index|constraint|foreign key|primary key|unique)\b/i,
          /\b(backup|restore|replicate|sync)\b/i,
          /\b(Supabase|Prisma|TypeORM|Sequelize|Knex)\b/i,
          /\b(transaction|ACID|consistency|isolation)\b/i,
          /\b(normalized|denormalized|relationship)\b/i,
          /\b(stored procedure|trigger|function)\b/i
        ],
        filePatterns: [
          /\.sql$/,
          /migrations?\//,
          /schema\//,
          /models?\//,
          /entities\//,
          /database\//,
          /db\//
        ],
        contextClues: ['save data', 'store information', 'persist', 'retrieve', 'fetch data'],
        confidence_threshold: 15
      },

      SECURITY: {
        name: 'Security Sub-Agent',
        patterns: [
          /\b(auth|authentication|authorization|login|logout|sign in|sign out)\b/i,
          /\b(password|credential|secret|key|certificate)\b/i,
          /\b(token|JWT|session|cookie|OAuth|SSO)\b/i,
          /\b(permission|role|access control|privilege|admin|RBAC)\b/i,
          /\b(encrypt|decrypt|hash|salt|bcrypt|crypto)\b/i,
          /\b(secure|vulnerability|threat|attack|exploit)\b/i,
          /\b(CORS|XSS|CSRF|injection|SQLi|sanitize)\b/i,
          /\b(private|public|sensitive|PII|GDPR|HIPAA)\b/i,
          /\b(audit|compliance|security scan|penetration test)\b/i,
          /\b(firewall|WAF|rate limit|DDoS|brute force)\b/i,
          /\b(SSL|TLS|HTTPS|certificate)\b/i,
          /\b(2FA|MFA|two-factor|multi-factor)\b/i
        ],
        filePatterns: [
          /auth\//,
          /security\//,
          /middleware\//,
          /guards?\//,
          /\.env/,
          /config\//
        ],
        contextClues: ['protect', 'secure', 'verify identity', 'check permissions', 'validate user'],
        confidence_threshold: 10
      },

      PERFORMANCE: {
        name: 'Performance Sub-Agent',
        patterns: [
          /\b(slow|fast|speed|latency|response time|performance)\b/i,
          /\b(optimize|optimization|improve|enhance|efficient)\b/i,
          /\b(cache|caching|memoize|lazy load|prefetch)\b/i,
          /\b(load|loading|spinner|skeleton|placeholder)\b/i,
          /\b(memory|CPU|resource|bandwidth|bottleneck)\b/i,
          /\b(scale|scaling|concurrent|parallel|async)\b/i,
          /\b(benchmark|metric|measure|profile|monitor)\b/i,
          /\b(bundle|chunk|split|minify|compress|gzip)\b/i,
          /\b(throttle|debounce|queue|batch)\b/i,
          /\b(CDN|edge|distributed|replicated)\b/i,
          /\b(index|query optimization|N\+1|eager loading)\b/i,
          /\b(web vitals|LCP|FID|CLS|TTI|TTFB)\b/i
        ],
        filePatterns: [
          /webpack\.config/,
          /vite\.config/,
          /performance\//,
          /optimize/,
          /worker\.js/
        ],
        contextClues: ['make faster', 'reduce time', 'improve speed', 'handle load', 'many users'],
        confidence_threshold: 20
      },

      TESTING: {
        name: 'Testing Sub-Agent',
        patterns: [
          /\b(test|testing|QA|quality assurance)\b/i,
          /\b(unit test|integration test|e2e|end-to-end)\b/i,
          /\b(spec|specification|scenario|test case)\b/i,
          /\b(coverage|code coverage|test coverage)\b/i,
          /\b(mock|stub|spy|fixture|fake)\b/i,
          /\b(assert|expect|should|verify|validate)\b/i,
          /\b(bug|defect|issue|regression|error)\b/i,
          /\b(jest|mocha|cypress|playwright|vitest)\b/i,
          /\b(TDD|BDD|test-driven|behavior-driven)\b/i,
          /\b(smoke test|sanity test|regression test)\b/i,
          /\b(test suite|test runner|test framework)\b/i,
          /\b(edge case|boundary|corner case|happy path)\b/i
        ],
        filePatterns: [
          /\.test\./,
          /\.spec\./,
          /tests?\//,
          /specs?\//,
          /__tests__\//,
          /cypress\//,
          /e2e\//
        ],
        contextClues: ['verify works', 'ensure correct', 'validate behavior', 'check output', 'test that'],
        confidence_threshold: 10
      },

      STORIES: {
        name: 'User Story Sub-Agent',
        patterns: [
          /\b(user stor|acceptance criteria|requirement)\b/i,
          /\b(as a .+, I (want|need|should))\b/i,
          /\b(given .+, when .+, then)\b/i,
          /\b(epic|feature|story point|backlog)\b/i,
          /\b(PRD|product requirement|functional requirement)\b/i,
          /\b(use case|user journey|workflow)\b/i,
          /\b(definition of done|DoD|acceptance test)\b/i,
          /\b(scrum|agile|sprint|iteration)\b/i
        ],
        filePatterns: [
          /stories?\//,
          /requirements?\//,
          /specs?\//,
          /\.md$/
        ],
        contextClues: ['user needs', 'customer wants', 'business requirement', 'feature request'],
        confidence_threshold: 15
      }
    };

    // Business rules for intelligent detection
    this.rules = [
      {
        condition: (text) => /user.{0,20}(see|interact|click|view|experience)/i.test(text),
        agents: ['DESIGN'],
        reason: 'User interface interaction detected'
      },
      {
        condition: (text) => /save|store|persist|record|track|log/i.test(text),
        agents: ['DATABASE'],
        reason: 'Data persistence requirement detected'
      },
      {
        condition: (text) => /API|endpoint|webhook|external|third.party|public/i.test(text),
        agents: ['SECURITY'],
        reason: 'External interaction detected'
      },
      {
        condition: (text) => /list|table|grid|collection|array|multiple|bulk/i.test(text),
        agents: ['PERFORMANCE'],
        reason: 'Collection handling detected'
      },
      {
        condition: (text) => /(create|build|implement|develop).{0,30}(feature|component|function)/i.test(text),
        agents: ['TESTING', 'VALIDATION'],
        reason: 'New implementation detected'
      },
      {
        condition: (text) => /PRD|product requirement|acceptance/i.test(text),
        agents: ['STORIES'],
        reason: 'Requirements documentation detected'
      }
    ];

    // Mandatory agents for specific phases
    this.mandatoryAgents = {
      'LEAD_TO_PLAN': ['VALIDATION', 'SECURITY'],
      'PLAN_TO_EXEC': ['DATABASE', 'TESTING'],
      'EXEC_TO_VERIFICATION': ['TESTING', 'PERFORMANCE', 'DESIGN'],
      'FINAL_APPROVAL': ['SECURITY']
    };
  }

  /**
   * Detect required sub-agents based on content analysis
   */
  async detectRequiredSubAgents(sdContent, prdContent, affectedFiles = [], phase = null) {
    console.log('\n🤖 SMART SUB-AGENT DETECTION');
    console.log('━'.repeat(40));

    const detectedAgents = new Map(); // agent -> confidence score
    const reasons = new Map(); // agent -> reasons array

    // Combine all text for analysis
    const fullText = `${sdContent || ''} ${prdContent || ''}`;

    // 1. Check mandatory agents for phase
    if (phase && this.mandatoryAgents[phase]) {
      for (const agent of this.mandatoryAgents[phase]) {
        detectedAgents.set(agent, 100); // Maximum confidence for mandatory
        if (!reasons.has(agent)) reasons.set(agent, []);
        reasons.get(agent).push(`Mandatory for ${phase} phase`);
      }
    }

    // 2. Pattern matching analysis
    for (const [agentCode, config] of Object.entries(this.patterns)) {
      let score = 0;
      const agentReasons = [];

      // Check text patterns
      for (const pattern of config.patterns) {
        const matches = (fullText.match(pattern) || []).length;
        if (matches > 0) {
          score += matches * 10;
          agentReasons.push(`Pattern matched: ${pattern.source}`);
        }
      }

      // Check file patterns
      for (const file of affectedFiles) {
        for (const pattern of config.filePatterns) {
          if (pattern.test(file)) {
            score += 15;
            agentReasons.push(`File pattern matched: ${file}`);
            break;
          }
        }
      }

      // Check context clues
      for (const clue of config.contextClues) {
        if (fullText.toLowerCase().includes(clue)) {
          score += 5;
          agentReasons.push(`Context clue: "${clue}"`);
        }
      }

      // Store if above threshold
      if (score >= config.confidence_threshold) {
        const currentScore = detectedAgents.get(agentCode) || 0;
        detectedAgents.set(agentCode, Math.max(currentScore, score));
        if (!reasons.has(agentCode)) reasons.set(agentCode, []);
        reasons.get(agentCode).push(...agentReasons);
      }
    }

    // 3. Apply intelligent business rules
    for (const rule of this.rules) {
      if (rule.condition(fullText)) {
        for (const agent of rule.agents) {
          const currentScore = detectedAgents.get(agent) || 0;
          detectedAgents.set(agent, currentScore + 25);
          if (!reasons.has(agent)) reasons.set(agent, []);
          reasons.get(agent).push(rule.reason);
        }
      }
    }

    // 4. Always include TESTING for any code change
    if (!detectedAgents.has('TESTING') && (sdContent || prdContent)) {
      detectedAgents.set('TESTING', 50);
      reasons.set('TESTING', ['Default - all implementations need testing']);
    }

    // Convert to result format
    const results = [];
    for (const [agent, score] of detectedAgents.entries()) {
      results.push({
        agent,
        name: this.patterns[agent]?.name || agent,
        confidence: score > 50 ? 'HIGH' : score > 20 ? 'MEDIUM' : 'LOW',
        score,
        reasons: reasons.get(agent) || [],
        shouldRun: true
      });
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Display detection results
   */
  displayResults(results) {
    console.log('\n📊 DETECTION RESULTS');
    console.log('━'.repeat(40));

    if (results.length === 0) {
      console.log('No sub-agents detected as necessary');
      return;
    }

    console.log(`Detected ${results.length} sub-agents needed:\n`);

    for (const result of results) {
      const confidenceEmoji =
        result.confidence === 'HIGH' ? '🔴' :
        result.confidence === 'MEDIUM' ? '🟡' :
        '🟢';

      console.log(`${confidenceEmoji} ${result.name} (${result.agent})`);
      console.log(`   Confidence: ${result.confidence} (Score: ${result.score})`);

      if (result.reasons.length > 0) {
        console.log(`   Reasons:`);
        for (const reason of result.reasons.slice(0, 3)) {
          console.log(`   • ${reason}`);
        }
        if (result.reasons.length > 3) {
          console.log(`   • ... and ${result.reasons.length - 3} more`);
        }
      }
      console.log();
    }
  }

  /**
   * Save detection results to database
   */
  async saveResults(sdId, prdId, results, phase) {
    try {
      // Save to mandatory validations table
      for (const result of results) {
        await supabase
          .from('leo_mandatory_validations')
          .insert({
            sd_id: sdId,
            prd_id: prdId,
            phase: phase || 'DETECTION',
            sub_agent_code: result.agent,
            status: 'pending',
            results: {
              confidence: result.confidence,
              score: result.score,
              reasons: result.reasons,
              detected_at: new Date().toISOString()
            }
          });
      }

      console.log('✅ Detection results saved to database');
    } catch (error) {
      console.error('⚠️ Failed to save detection results:', error.message);
    }
  }

  /**
   * Get affected files for a change
   */
  async getAffectedFiles(sdContent, prdContent) {
    // This is a simplified version - in production, you'd analyze git diffs
    // or use more sophisticated analysis
    const files = [];

    // Extract file references from content
    const filePattern = /[\/\w-]+\.(js|jsx|ts|tsx|css|scss|sql)/g;
    const matches = `${sdContent} ${prdContent}`.match(filePattern) || [];

    files.push(...matches);

    // Add common patterns based on content
    if (/dashboard/i.test(`${sdContent} ${prdContent}`)) {
      files.push('src/client/src/components/Dashboard.jsx');
    }

    if (/api/i.test(`${sdContent} ${prdContent}`)) {
      files.push('src/api/routes.js');
    }

    return [...new Set(files)]; // Unique files only
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let sdId = null;
  let prdId = null;
  let phase = null;
  let testMode = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sd-id' && args[i + 1]) {
      sdId = args[i + 1];
    }
    if (args[i] === '--prd-id' && args[i + 1]) {
      prdId = args[i + 1];
    }
    if (args[i] === '--phase' && args[i + 1]) {
      phase = args[i + 1];
    }
    if (args[i] === '--test') {
      testMode = true;
    }
  }

  const detector = new SmartSubAgentDetector();

  if (testMode) {
    // Test mode with sample content
    console.log('🧪 RUNNING IN TEST MODE');

    const testSD = "Create a new dashboard for monitoring system performance";
    const testPRD = "Build a user interface that displays real-time metrics, includes authentication, stores data in the database, and needs to handle high traffic loads";
    const testFiles = ['src/components/Dashboard.jsx', 'src/api/metrics.js'];

    const results = await detector.detectRequiredSubAgents(testSD, testPRD, testFiles, 'LEAD_TO_PLAN');
    detector.displayResults(results);

    console.log('\n✅ Test complete');
    return;
  }

  // Production mode - fetch from database
  if (!sdId && !prdId) {
    console.error('❌ Error: Please provide --sd-id or --prd-id (or use --test for test mode)');
    console.log('Usage: node smart-subagent-detector.js --sd-id <SD_ID> --prd-id <PRD_ID> [--phase <PHASE>]');
    console.log('   Or: node smart-subagent-detector.js --test');
    process.exit(1);
  }

  let sdContent = '';
  let prdContent = '';

  // Fetch SD content
  if (sdId) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('title, description')
      .eq('id', sdId)
      .single();

    if (sd) {
      sdContent = `${sd.title} ${sd.description}`;
    }
  }

  // Fetch PRD content
  if (prdId) {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('title, description, functional_requirements')
      .eq('id', prdId)
      .single();

    if (prd) {
      prdContent = `${prd.title} ${prd.description} ${JSON.stringify(prd.functional_requirements)}`;
    }
  }

  // Get affected files (simplified for now)
  const affectedFiles = await detector.getAffectedFiles(sdContent, prdContent);

  // Detect required sub-agents
  const results = await detector.detectRequiredSubAgents(sdContent, prdContent, affectedFiles, phase);

  // Display results
  detector.displayResults(results);

  // Save to database
  if (sdId || prdId) {
    await detector.saveResults(sdId, prdId, results, phase);
  }

  // Return exit code based on results
  const hasHighConfidence = results.some(r => r.confidence === 'HIGH');
  process.exit(hasHighConfidence ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { SmartSubAgentDetector };
export default SmartSubAgentDetector;