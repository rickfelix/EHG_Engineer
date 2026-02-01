/**
 * Infrastructure Consumer Check Gate
 * Part of SD-LEO-INFRA-PLAN-PHASE-COMPLETENESS-001
 *
 * GATE_INFRASTRUCTURE_CONSUMER_CHECK: Validates that infrastructure components
 * (database schema, sub-agents, APIs) have corresponding consumer code planned.
 *
 * Problem this solves:
 * - SD-LEO-SELF-IMPROVE-001J created complete database schema but no SD existed
 *   to implement the consumer logic (JUDGE agent)
 * - Infrastructure without consumers is wasted work
 * - Gaps only discovered after completion, not during PLAN phase
 *
 * Detection patterns:
 * 1. New database table/function in PRD → Require consumer code reference
 * 2. Sub-agent registration → Require implementation script reference
 * 3. API endpoint definition → Require frontend/consumer reference
 *
 * Opt-out: PRD can include explicit deferral annotation to intentionally skip
 * Format: INFRA_CONSUMER_CHECK:SKIP or INFRA_CONSUMER_CHECK:SKIP item=<name> reason=<text>
 */

/**
 * Reason codes for gate failures (FR-2, FR-3)
 */
const REASON_CODES = {
  SCHEMA_WITHOUT_CONSUMER: 'SCHEMA_WITHOUT_CONSUMER',
  SUBAGENT_WITHOUT_LOGIC: 'SUBAGENT_WITHOUT_LOGIC',
  API_WITHOUT_CONSUMER: 'API_WITHOUT_CONSUMER',
  MISSING_USAGE_STORIES: 'MISSING_USAGE_STORIES',
  PASS_WITH_OVERRIDE: 'PASS_WITH_OVERRIDE'
};

/**
 * Infrastructure patterns that require consumer code
 * FR-2: Enhanced database detection patterns
 * FR-3: Sub-agent registration patterns
 */
const INFRASTRUCTURE_PATTERNS = {
  database: {
    // FR-2: Schema detection patterns
    patterns: [
      /CREATE\s+TABLE\s+(\w+)/i,
      /ALTER\s+TABLE\s+(\w+)\s+ADD/i,
      /CREATE\s+FUNCTION\s+(\w+)/i,
      /CREATE\s+VIEW\s+(\w+)/i,
      /CREATE\s+TRIGGER\s+(\w+)/i,
      /CREATE\s+INDEX\s+(\w+)/i
    ],
    // FR-2: File path patterns for schema detection
    filePathPatterns: [
      /migrations?\//i,
      /schema\.sql/i,
      /db\/ddl\//i,
      /prisma\/schema\.prisma/i,
      /database\//i
    ],
    // FR-2: Consumer directory patterns
    consumerDirectories: [
      /api\//i,
      /services?\//i,
      /repositories?\//i,
      /agents?\//i,
      /workers?\//i,
      /lib\//i
    ],
    consumerHints: [
      /query|select|insert|update|delete/i,
      /supabase\.from/i,
      /useQuery|useMutation/i,
      /api.*endpoint/i,
      /service.*layer/i,
      /repository/i,
      /\.from\s*\(\s*['"`](\w+)['"`]\s*\)/i
    ],
    description: 'Database schema changes',
    reasonCode: REASON_CODES.SCHEMA_WITHOUT_CONSUMER
  },
  subagent: {
    // FR-3: Sub-agent registration patterns
    patterns: [
      /sub-?agent/i,
      /leo_sub_agents/i,
      /agent.*registration/i,
      /register.*agent/i,
      /new.*agent/i,
      /create.*agent/i,
      /agent_id\s*[=:]\s*['"`]?(\w+)/i,
      /agent_manifest/i,
      /routing.*table/i
    ],
    // FR-3: Agent registry file patterns
    filePathPatterns: [
      /config\/agents/i,
      /agents\/registry/i,
      /agent_manifest/i,
      /routing.*table/i
    ],
    consumerHints: [
      /script_path/i,
      /executor/i,
      /implementation.*script/i,
      /invoke.*agent/i,
      /execute.*agent/i,
      /agent.*logic/i,
      /\.claude\/agents\//i
    ],
    description: 'Sub-agent registration',
    reasonCode: REASON_CODES.SUBAGENT_WITHOUT_LOGIC
  },
  api: {
    patterns: [
      /api.*route/i,
      /endpoint.*definition/i,
      /REST.*endpoint/i,
      /GraphQL.*mutation|query/i,
      /POST|GET|PUT|DELETE.*endpoint/i,
      /router\.(get|post|put|delete)/i
    ],
    consumerHints: [
      /fetch|axios/i,
      /useQuery|useMutation/i,
      /frontend.*integration/i,
      /UI.*component/i,
      /call.*api/i
    ],
    description: 'API endpoint definition',
    reasonCode: REASON_CODES.API_WITHOUT_CONSUMER
  },
  rpc: {
    patterns: [
      /CREATE.*FUNCTION.*RETURNS/i,
      /supabase\.rpc/i,
      /rpc.*function/i,
      /stored.*procedure/i
    ],
    consumerHints: [
      /supabase\.rpc\(/i,
      /call.*function/i,
      /invoke.*rpc/i
    ],
    description: 'RPC function definition',
    reasonCode: REASON_CODES.SCHEMA_WITHOUT_CONSUMER
  }
};

/**
 * FR-5: User story patterns for existence vs usage detection
 */
const USER_STORY_PATTERNS = {
  // Stories that indicate infrastructure creation (existence)
  existence: [
    /create\s+table/i,
    /add\s+schema/i,
    /register\s+agent/i,
    /add\s+migration/i,
    /create\s+function/i,
    /add\s+column/i,
    /define\s+endpoint/i,
    /set\s+up\s+database/i
  ],
  // Stories that indicate actual usage (consumer behavior)
  usage: [
    /\buse\b/i,
    /\bquery\b/i,
    /\bexecute\b/i,
    /\bserve\b/i,
    /\bevaluate\b/i,
    /\bdecide\b/i,
    /\bcall\b.*\b(api|endpoint|function)/i,
    /\bfetch\b/i,
    /\bretrieve\b/i,
    /\bprocess\b/i,
    /workflow.*uses/i,
    /agent.*invokes/i
  ]
};

/**
 * FR-6: Opt-out annotation patterns
 * Supports both global and per-item skip
 */
const OPT_OUT_PATTERNS = {
  // Global skip pattern
  global: /INFRA_CONSUMER_CHECK\s*:\s*SKIP(?!\s+item=)/i,
  // Per-item skip pattern: INFRA_CONSUMER_CHECK:SKIP item=<name> reason=<text>
  perItem: /INFRA_CONSUMER_CHECK\s*:\s*SKIP\s+item\s*=\s*['"`]?(\w+)['"`]?\s*(?:reason\s*=\s*['"`]?([^'"`\n]+)['"`]?)?/gi,
  // Legacy patterns (backward compatibility)
  legacy: [
    /\[DEFERRED_IMPLEMENTATION\]/i,
    /\[CONSUMER_DEFERRED\]/i,
    /intentionally.*deferred/i,
    /consumer.*later.*phase/i,
    /follow-?up.*sd.*implement/i,
    /implementation.*separate.*sd/i
  ]
};

/**
 * Extract named items from content using patterns
 * FR-2: Per-item mapping with deterministic output
 *
 * @param {string} content - Content to analyze
 * @param {Object} config - Pattern configuration
 * @returns {Array} Detected items with names and evidence
 */
function extractInfrastructureItems(content, config) {
  const items = [];
  const seen = new Set();

  for (const pattern of config.patterns) {
    const matches = content.matchAll(new RegExp(pattern, 'gi'));
    for (const match of matches) {
      const itemName = match[1] || match[0];
      const normalizedName = itemName.toLowerCase().trim();

      if (!seen.has(normalizedName)) {
        seen.add(normalizedName);
        items.push({
          name: itemName,
          pattern: pattern.toString(),
          evidence: match[0].substring(0, 100),
          status: 'DETECTED'
        });
      }
    }
  }

  return items;
}

/**
 * Check if a specific item has consumer references
 * FR-2: Evidence-based consumer detection
 *
 * @param {string} itemName - Infrastructure item name
 * @param {string} content - All content to search
 * @param {Object} config - Pattern configuration
 * @returns {Object} Consumer check result with evidence
 */
function checkItemHasConsumer(itemName, content, config) {
  const evidence = [];

  // Check consumer hints
  for (const hint of config.consumerHints) {
    if (hint.test(content)) {
      // Look for the item name near the consumer hint
      const hintMatches = content.match(hint);
      if (hintMatches) {
        evidence.push({
          type: 'consumer_hint',
          pattern: hint.toString(),
          snippet: hintMatches[0].substring(0, 80)
        });
      }
    }
  }

  // Check consumer directory references
  if (config.consumerDirectories) {
    for (const dirPattern of config.consumerDirectories) {
      if (dirPattern.test(content)) {
        evidence.push({
          type: 'consumer_directory',
          pattern: dirPattern.toString()
        });
      }
    }
  }

  // Check if item name appears in consumer context
  const itemRegex = new RegExp(`(use|query|from|call|invoke|execute).*${itemName}`, 'i');
  if (itemRegex.test(content)) {
    evidence.push({
      type: 'item_usage',
      pattern: itemRegex.toString()
    });
  }

  return {
    hasConsumer: evidence.length > 0,
    evidence
  };
}

/**
 * FR-5: Validate user story completeness
 * Requires usage stories when existence stories are present
 *
 * @param {Array} userStories - User story records
 * @returns {Object} Validation result
 */
function validateUserStoryCompleteness(userStories) {
  const result = {
    existenceStories: [],
    usageStories: [],
    hasExistenceWithoutUsage: false,
    suggestedUsageStories: []
  };

  for (const story of userStories) {
    const storyContent = [
      story.title || '',
      story.user_want || '',
      story.user_benefit || '',
      story.technical_notes || ''
    ].join(' ').toLowerCase();

    // Check for existence patterns
    const isExistence = USER_STORY_PATTERNS.existence.some(p => p.test(storyContent));
    if (isExistence) {
      result.existenceStories.push({
        id: story.id,
        title: story.title,
        evidence: storyContent.substring(0, 100)
      });
    }

    // Check for usage patterns
    const isUsage = USER_STORY_PATTERNS.usage.some(p => p.test(storyContent));
    if (isUsage) {
      result.usageStories.push({
        id: story.id,
        title: story.title,
        evidence: storyContent.substring(0, 100)
      });
    }
  }

  // FR-5: If existence stories but no usage stories, flag it
  if (result.existenceStories.length > 0 && result.usageStories.length === 0) {
    result.hasExistenceWithoutUsage = true;

    // Generate suggested usage story templates
    for (const existenceStory of result.existenceStories) {
      result.suggestedUsageStories.push({
        template: `As a user/system, I want to USE the ${existenceStory.title} so that I can [achieve benefit]`,
        basedOn: existenceStory.id
      });
    }
  }

  return result;
}

/**
 * FR-6: Parse opt-out annotations
 *
 * @param {string} content - Content to check for opt-outs
 * @returns {Object} Opt-out configuration
 */
function parseOptOutAnnotations(content) {
  const result = {
    globalSkip: false,
    itemSkips: [],
    legacySkips: []
  };

  // Check for global skip
  if (OPT_OUT_PATTERNS.global.test(content)) {
    result.globalSkip = true;
  }

  // Check for per-item skips
  const itemMatches = content.matchAll(OPT_OUT_PATTERNS.perItem);
  for (const match of itemMatches) {
    result.itemSkips.push({
      item: match[1],
      reason: match[2] || 'No reason provided'
    });
  }

  // Check legacy patterns
  for (const pattern of OPT_OUT_PATTERNS.legacy) {
    if (pattern.test(content)) {
      result.legacySkips.push({
        pattern: pattern.toString(),
        found: true
      });
    }
  }

  return result;
}

/**
 * FR-2, FR-3: Analyze PRD content for infrastructure-without-consumer gaps
 * Returns deterministic per-item mapping with evidence
 *
 * @param {Object} prd - PRD record
 * @param {Array} userStories - Associated user stories
 * @returns {Object} Analysis result with gaps, warnings, and opt-outs
 */
function analyzeInfrastructureConsumerGaps(prd, userStories = []) {
  const result = {
    infrastructureItems: [],   // FR-2: Per-item mapping
    consumerReferences: [],
    gaps: [],
    optOuts: null,
    userStoryValidation: null,
    warnings: [],
    reasonCodes: []
  };

  // Combine all PRD content for analysis
  const prdContent = [
    prd.title || '',
    prd.content || '',
    JSON.stringify(prd.functional_requirements || []),
    JSON.stringify(prd.acceptance_criteria || []),
    JSON.stringify(prd.test_scenarios || []),
    prd.technical_approach || '',
    prd.implementation_details || ''
  ].join('\n');

  // Combine user story content
  const userStoryContent = userStories.map(s => [
    s.title || '',
    s.user_want || '',
    s.user_benefit || '',
    s.technical_notes || '',
    s.implementation_approach || '',
    JSON.stringify(s.acceptance_criteria || [])
  ].join('\n')).join('\n');

  const allContent = prdContent + '\n' + userStoryContent;

  // FR-6: Parse opt-out annotations first
  result.optOuts = parseOptOutAnnotations(allContent);

  // FR-5: Validate user story completeness
  result.userStoryValidation = validateUserStoryCompleteness(userStories);

  // FR-2, FR-3: Check each infrastructure category with per-item mapping
  for (const [category, config] of Object.entries(INFRASTRUCTURE_PATTERNS)) {
    const items = extractInfrastructureItems(allContent, config);

    for (const item of items) {
      // Check if this item is explicitly skipped
      const isItemSkipped = result.optOuts.itemSkips.some(
        skip => skip.item.toLowerCase() === item.name.toLowerCase()
      );

      if (isItemSkipped) {
        item.status = 'SKIPPED';
        item.skipReason = result.optOuts.itemSkips.find(
          skip => skip.item.toLowerCase() === item.name.toLowerCase()
        )?.reason;
        result.infrastructureItems.push({ ...item, category });
        continue;
      }

      // Check for consumer references
      const consumerCheck = checkItemHasConsumer(item.name, allContent, config);

      if (consumerCheck.hasConsumer) {
        item.status = 'SATISFIED';
        item.consumerEvidence = consumerCheck.evidence;
        result.consumerReferences.push({
          category,
          item: item.name,
          evidence: consumerCheck.evidence
        });
      } else if (!result.optOuts.globalSkip && result.optOuts.legacySkips.length === 0) {
        // Only report gap if no global opt-out
        item.status = 'MISSING_CONSUMER';
        result.gaps.push({
          category,
          item: item.name,
          description: config.description,
          reasonCode: config.reasonCode,
          message: `${config.description}: '${item.name}' detected but no consumer code reference found`,
          remediation: `Add implementation details showing how '${item.name}' will be consumed`,
          evidence: item.evidence
        });
        if (!result.reasonCodes.includes(config.reasonCode)) {
          result.reasonCodes.push(config.reasonCode);
        }
      }

      result.infrastructureItems.push({ ...item, category });
    }
  }

  // FR-5: Add user story gap if existence without usage
  if (result.userStoryValidation.hasExistenceWithoutUsage &&
      !result.optOuts.globalSkip &&
      result.optOuts.legacySkips.length === 0) {
    result.gaps.push({
      category: 'user_stories',
      description: 'User story completeness',
      reasonCode: REASON_CODES.MISSING_USAGE_STORIES,
      message: 'Infrastructure existence stories found but no usage stories detected',
      remediation: 'Add user stories describing how the infrastructure will be used',
      existenceStories: result.userStoryValidation.existenceStories,
      suggestedUsageStories: result.userStoryValidation.suggestedUsageStories
    });
    if (!result.reasonCodes.includes(REASON_CODES.MISSING_USAGE_STORIES)) {
      result.reasonCodes.push(REASON_CODES.MISSING_USAGE_STORIES);
    }
  }

  return result;
}

/**
 * Create the GATE_INFRASTRUCTURE_CONSUMER_CHECK gate validator
 *
 * @param {Object} prdRepo - PRD repository instance
 * @param {Object} supabase - Supabase client for user story queries
 * @returns {Object} Gate configuration
 */
export function createInfrastructureConsumerCheckGate(prdRepo, supabase) {
  return {
    name: 'GATE_INFRASTRUCTURE_CONSUMER_CHECK',
    validator: async (ctx) => {
      console.log('\n🔌 GATE: Infrastructure Consumer Check');
      console.log('-'.repeat(50));
      console.log('   Reference: SD-LEO-INFRA-PLAN-PHASE-COMPLETENESS-001');
      console.log('   Prevention: SD-LEO-SELF-IMPROVE-001J (schema without consumer)');

      try {
        // Get PRD from context or repository
        const prd = ctx._prd || await prdRepo?.getBySdId(ctx.sd?.id || ctx.sdId);

        if (!prd) {
          console.log('   ℹ️  No PRD found - skipping infrastructure consumer check');
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: ['No PRD for infrastructure consumer check - gate skipped'],
            details: { skipped: true, reason: 'No PRD' }
          };
        }

        // Get user stories for this PRD
        let userStories = [];
        if (supabase) {
          const { data, error } = await supabase
            .from('user_stories')
            .select('id, title, user_want, user_benefit, technical_notes, implementation_approach, acceptance_criteria')
            .eq('prd_id', prd.id);

          if (!error && data) {
            userStories = data;
          }
        }

        console.log(`   📋 PRD: ${prd.id}`);
        console.log(`   📝 User Stories: ${userStories.length}`);

        // Analyze for infrastructure-consumer gaps (FR-2, FR-3, FR-5, FR-6)
        const analysis = analyzeInfrastructureConsumerGaps(prd, userStories);

        console.log('\n   📊 Analysis Results:');
        console.log(`      Infrastructure items: ${analysis.infrastructureItems.length}`);
        console.log(`      Consumer references: ${analysis.consumerReferences.length}`);
        console.log(`      Gaps detected: ${analysis.gaps.length}`);
        console.log(`      Reason codes: ${analysis.reasonCodes.join(', ') || 'none'}`);

        // FR-6: Check for global opt-out
        if (analysis.optOuts.globalSkip) {
          console.log('\n   ⚠️  GLOBAL OPT-OUT: INFRA_CONSUMER_CHECK:SKIP found');

          // Log the override (FR-6)
          if (supabase) {
            await logOptOutOverride(supabase, ctx.sd, 'global', null, 'Global skip annotation');
          }

          return {
            passed: true,
            score: 80,
            max_score: 100,
            issues: [],
            warnings: [
              'Infrastructure consumer check skipped via INFRA_CONSUMER_CHECK:SKIP annotation',
              'Follow-up SD may be needed to implement consumer code'
            ],
            details: {
              infrastructureItems: analysis.infrastructureItems.length,
              optOut: 'global',
              reasonCode: REASON_CODES.PASS_WITH_OVERRIDE,
              status: 'skipped_global'
            }
          };
        }

        // FR-6: Check for legacy opt-out patterns
        if (analysis.optOuts.legacySkips.length > 0) {
          console.log('\n   ⚠️  LEGACY OPT-OUT annotation found - consumer implementation deferred');
          analysis.optOuts.legacySkips.forEach(o => console.log(`      • ${o.pattern}`));

          // Log the override (FR-6)
          if (supabase) {
            await logOptOutOverride(supabase, ctx.sd, 'legacy', null, 'Legacy skip annotation');
          }

          return {
            passed: true,
            score: 80,
            max_score: 100,
            issues: [],
            warnings: [
              'Infrastructure consumer implementation intentionally deferred (legacy annotation)',
              'Consider using INFRA_CONSUMER_CHECK:SKIP format for better auditability',
              'Follow-up SD may be needed to implement consumer code'
            ],
            details: {
              infrastructureItems: analysis.infrastructureItems.length,
              optOuts: analysis.optOuts.legacySkips,
              reasonCode: REASON_CODES.PASS_WITH_OVERRIDE,
              status: 'deferred_implementation'
            }
          };
        }

        // If no infrastructure patterns found, pass with advisory
        if (analysis.infrastructureItems.length === 0) {
          console.log('\n   ✅ No infrastructure patterns detected - gate passed');
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [],
            details: {
              infrastructureItems: 0,
              consumerReferences: 0,
              gaps: 0,
              status: 'no_infrastructure_detected'
            }
          };
        }

        // FR-5: Report user story completeness issues
        if (analysis.userStoryValidation.hasExistenceWithoutUsage) {
          console.log('\n   ⚠️  USER STORY COMPLETENESS:');
          console.log(`      Existence stories: ${analysis.userStoryValidation.existenceStories.length}`);
          console.log(`      Usage stories: ${analysis.userStoryValidation.usageStories.length}`);
          console.log('      Suggested usage story templates:');
          analysis.userStoryValidation.suggestedUsageStories.forEach(s => {
            console.log(`         → ${s.template}`);
          });
        }

        // If gaps found, report them with deterministic output (FR-2)
        if (analysis.gaps.length > 0) {
          console.log('\n   ⚠️  Infrastructure-without-consumer gaps detected:');

          // FR-2: Per-item mapping output
          console.log('\n   📋 PER-ITEM STATUS:');
          for (const item of analysis.infrastructureItems) {
            const statusIcon = item.status === 'SATISFIED' ? '✓' :
                              item.status === 'SKIPPED' ? '⊘' : '✗';
            console.log(`      ${statusIcon} [${item.category}] ${item.name}: ${item.status}`);
            if (item.consumerEvidence) {
              console.log(`         Evidence: ${item.consumerEvidence[0]?.type || 'consumer reference found'}`);
            }
            if (item.skipReason) {
              console.log(`         Skip reason: ${item.skipReason}`);
            }
          }

          // Calculate score based on gap ratio
          const satisfiedCount = analysis.infrastructureItems.filter(i => i.status === 'SATISFIED').length;
          const totalItems = analysis.infrastructureItems.length;
          const coverageRatio = satisfiedCount / (totalItems || 1);
          const score = Math.round(coverageRatio * 100);

          // FR-4: Auto-generate follow-up SD if gaps persist
          let followUpSd = null;
          if (ctx.sd && supabase) {
            followUpSd = await generateFollowUpSD(ctx.sd, analysis.gaps, supabase);
          }

          // Gaps are warnings, not blocking (allows explicit opt-out path)
          return {
            passed: true,  // Non-blocking - use warnings instead
            score: Math.max(score, 50),  // Minimum 50% if some infrastructure found
            max_score: 100,
            issues: [],
            warnings: [
              ...analysis.gaps.map(g => `GAP [${g.reasonCode}]: ${g.message}`),
              'Consider adding consumer code references or INFRA_CONSUMER_CHECK:SKIP annotation',
              followUpSd ? `Auto-generated follow-up SD: ${followUpSd.sd_key}` : 'Auto-SD generation will create follow-up directive if gaps persist'
            ],
            details: {
              infrastructureItems: analysis.infrastructureItems,
              consumerReferences: analysis.consumerReferences,
              gaps: analysis.gaps,
              reasonCodes: analysis.reasonCodes,
              coverageRatio,
              userStoryValidation: analysis.userStoryValidation,
              followUpSd: followUpSd?.sd_key || null,
              status: 'gaps_detected'
            }
          };
        }

        // All infrastructure has consumer references
        console.log('\n   ✅ All infrastructure has consumer references');
        for (const item of analysis.infrastructureItems) {
          console.log(`      ✓ [${item.category}] ${item.name}`);
        }

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: {
            infrastructureItems: analysis.infrastructureItems,
            consumerReferences: analysis.consumerReferences,
            userStoryValidation: analysis.userStoryValidation,
            status: 'fully_covered'
          }
        };

      } catch (error) {
        console.log(`\n   ⚠️  Infrastructure consumer check error: ${error.message}`);
        return {
          passed: true,  // Non-blocking on errors
          score: 50,
          max_score: 100,
          issues: [],
          warnings: [`Infrastructure consumer check error: ${error.message}`],
          details: { error: error.message }
        };
      }
    },
    required: false  // Advisory gate - warns but doesn't block
  };
}

/**
 * FR-6: Log opt-out override for auditability
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic directive
 * @param {string} type - Override type (global, per_item, legacy)
 * @param {string} item - Item name (for per_item)
 * @param {string} reason - Override reason
 */
async function logOptOutOverride(supabase, sd, type, item, reason) {
  try {
    await supabase.from('validation_audit_log').insert({
      sd_id: sd?.id,
      sd_key: sd?.sd_key,
      gate_name: 'GATE_INFRASTRUCTURE_CONSUMER_CHECK',
      action: 'OPT_OUT_OVERRIDE',
      details: {
        type,
        item,
        reason,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    // Non-blocking - just log failure
    console.log(`   ⚠️  Failed to log opt-out override: ${error.message}`);
  }
}

/**
 * FR-4: Generate a follow-up SD for infrastructure gaps
 * Called when gaps are detected and no opt-out annotation present
 * Creates exactly one follow-up SD per parent SD validation run
 *
 * @param {Object} parentSd - Parent SD record
 * @param {Array} gaps - Detected infrastructure gaps
 * @param {Object} supabase - Supabase client
 * @returns {Object} Created child SD or null
 */
export async function generateFollowUpSD(parentSd, gaps, supabase) {
  if (!gaps || gaps.length === 0 || !supabase || !parentSd) {
    return null;
  }

  // FR-4: Check if follow-up SD already exists (idempotent)
  const existingCheck = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('parent_sd_id', parentSd.id)
    .ilike('title', '%FOLLOW-UP: Implement consumers%')
    .limit(1);

  if (existingCheck.data?.length > 0) {
    console.log(`   ℹ️  Follow-up SD already exists: ${existingCheck.data[0].sd_key}`);
    return existingCheck.data[0];
  }

  // Generate unique SD key
  const timestamp = Date.now().toString(36).toUpperCase();
  const parentKey = parentSd.sd_key?.replace('SD-', '').replace(/[^A-Z0-9-]/g, '') || 'PARENT';
  const sdKey = `SD-LEO-IMPL-${parentKey.substring(0, 20)}-CONSUMER-${timestamp}`;

  // FR-4: Build checklist of tasks per missing infra item
  const taskChecklist = gaps.map(g => {
    if (g.category === 'user_stories') {
      return `Add usage user stories for infrastructure: ${g.existenceStories?.map(s => s.title).join(', ')}`;
    }
    return `Implement consumer for ${g.category}: '${g.item || g.description}'`;
  });

  const childSd = {
    sd_key: sdKey,
    // FR-4: Title prefix as specified
    title: 'FOLLOW-UP: Implement consumers for planned infrastructure',
    description: 'Follow-up SD auto-generated by INFRASTRUCTURE_CONSUMER_CHECK gate.\n\n' +
      `**Parent SD**: ${parentSd.sd_key}\n` +
      '**Trigger**: Infrastructure-without-consumer gaps detected during PLAN→EXEC handoff\n\n' +
      `**Tasks:**\n${taskChecklist.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n` +
      `**Reason Codes**: ${gaps.map(g => g.reasonCode).filter(Boolean).join(', ')}`,
    sd_type: 'feature',  // Consumer implementation is a feature
    parent_sd_id: parentSd.id,
    status: 'draft',
    current_phase: 'LEAD',
    priority: parentSd.priority || 'medium',
    target_application: parentSd.target_application,
    category: parentSd.category,
    key_changes: gaps.map(g => ({
      change: g.category === 'user_stories'
        ? 'Add usage user stories'
        : `Implement consumer for ${g.description}`
    })),
    success_criteria: [
      {
        criterion: 'All infrastructure has corresponding consumer code',
        measure: 'GATE_INFRASTRUCTURE_CONSUMER_CHECK passes with 100% coverage'
      },
      ...gaps.filter(g => g.category !== 'user_stories').map(g => ({
        criterion: `${g.item || g.description} consumer implemented`,
        measure: `Consumer code calls/uses the ${g.category} infrastructure`
      }))
    ],
    metadata: {
      auto_generated: true,
      generated_by: 'GATE_INFRASTRUCTURE_CONSUMER_CHECK',
      parent_sd_key: parentSd.sd_key,
      trigger_incident: 'SD-LEO-SELF-IMPROVE-001J',
      gaps_addressed: gaps,
      reason_codes: gaps.map(g => g.reasonCode).filter(Boolean),
      created_at: new Date().toISOString()
    }
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(childSd)
      .select('id, sd_key, title')
      .single();

    if (error) {
      console.log(`   ⚠️  Failed to create follow-up SD: ${error.message}`);
      return null;
    }

    console.log('\n   🔧 AUTO-GENERATED FOLLOW-UP SD (FR-4):');
    console.log(`      SD Key: ${data.sd_key}`);
    console.log(`      Title: ${data.title}`);
    console.log(`      Parent: ${parentSd.sd_key}`);
    console.log(`      Tasks: ${taskChecklist.length}`);

    return data;
  } catch (err) {
    console.log(`   ⚠️  Error creating follow-up SD: ${err.message}`);
    return null;
  }
}

// Export reason codes for external use
export { REASON_CODES };
