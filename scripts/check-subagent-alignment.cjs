const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Mapping of sub-agent codes to their expected section_types
const SUB_AGENT_TO_SECTION_MAP = {
  'DOCMON': 'information_architecture_lead',
  'UAT': 'uat_test_executor',
  'GITHUB': 'devops_platform_architect',
  'RETRO': 'continuous_improvement_coach',
  'DESIGN': 'senior_design_subagent',
  'RESEARCH': 'research_agent',
  'STORIES': 'product_requirements_expert',
  'FINANCIAL_ANALYTICS': 'senior_financial_analytics_engineer',
  'SECURITY': 'chief_security_architect',
  'DATABASE': 'principal_database_architect',
  'TESTING': 'qa_engineering_enhanced',
  'PERFORMANCE': 'performance_engineering_lead',
  'VALIDATION': 'principal_systems_analyst'
};

async function checkAlignment() {
  console.log('🔍 Checking alignment between leo_sub_agents and leo_protocol_sections...\n');

  try {
    // Get all active sub-agents
    const { data: subAgents, error: subAgentError } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .eq('active', true)
      .order('priority', { ascending: false });

    if (subAgentError) {
      console.error('❌ Error fetching sub-agents:', subAgentError);
      process.exit(1);
    }

    // Get all protocol sections
    const { data: sections, error: sectionError } = await supabase
      .from('leo_protocol_sections')
      .select('*')
      .order('order_index');

    if (sectionError) {
      console.error('❌ Error fetching protocol sections:', sectionError);
      process.exit(1);
    }

    console.log(`📊 Found ${subAgents.length} active sub-agents and ${sections.length} protocol sections\n`);

    const issues = [];
    const alignedSubAgents = [];

    // Check each sub-agent
    for (const subAgent of subAgents) {
      const expectedSectionType = SUB_AGENT_TO_SECTION_MAP[subAgent.code];

      if (!expectedSectionType) {
        issues.push({
          type: 'UNMAPPED',
          subAgent: subAgent.code,
          message: `No section_type mapping defined for sub-agent ${subAgent.code}`
        });
        continue;
      }

      // Find corresponding section
      const matchingSection = sections.find(s => s.section_type === expectedSectionType);

      if (!matchingSection) {
        issues.push({
          type: 'MISSING_SECTION',
          subAgent: subAgent.code,
          name: subAgent.name,
          expectedSectionType: expectedSectionType,
          message: `Sub-agent ${subAgent.code} (${subAgent.name}) has no corresponding section in leo_protocol_sections`
        });
        continue;
      }

      // Compare metadata versions
      const subAgentVersion = subAgent.metadata?.version;
      const sectionVersion = matchingSection.metadata?.version;

      if (subAgentVersion !== sectionVersion) {
        issues.push({
          type: 'VERSION_MISMATCH',
          subAgent: subAgent.code,
          name: subAgent.name,
          subAgentVersion: subAgentVersion || 'not set',
          sectionVersion: sectionVersion || 'not set',
          message: `Version mismatch for ${subAgent.code}: sub-agent=${subAgentVersion || 'not set'}, section=${sectionVersion || 'not set'}`
        });
      }

      // Check for content length mismatches (indication of different content)
      const descriptionLength = subAgent.description?.length || 0;
      const contentLength = matchingSection.content?.length || 0;
      const lengthDifference = Math.abs(descriptionLength - contentLength);
      const lengthDifferencePercent = lengthDifference / Math.max(descriptionLength, contentLength) * 100;

      if (lengthDifferencePercent > 10) {
        issues.push({
          type: 'CONTENT_LENGTH_MISMATCH',
          subAgent: subAgent.code,
          name: subAgent.name,
          descriptionLength: descriptionLength,
          contentLength: contentLength,
          difference: lengthDifference,
          differencePercent: lengthDifferencePercent.toFixed(1),
          message: `Content length differs by ${lengthDifferencePercent.toFixed(1)}% for ${subAgent.code} (sub-agent: ${descriptionLength} chars, section: ${contentLength} chars)`
        });
      }

      // Check for specific patterns that indicate outdated content
      const subAgentDesc = subAgent.description?.toLowerCase() || '';
      const sectionContent = matchingSection.content?.toLowerCase() || '';

      // Check for conditional E2E testing (should be MANDATORY)
      if (subAgent.code === 'TESTING') {
        const subAgentHasMandatory = subAgentDesc.includes('mandatory') && subAgentDesc.includes('e2e');
        const sectionHasMandatory = sectionContent.includes('mandatory') && sectionContent.includes('e2e');

        if (subAgentHasMandatory !== sectionHasMandatory) {
          issues.push({
            type: 'CONTENT_PATTERN_MISMATCH',
            subAgent: subAgent.code,
            name: subAgent.name,
            pattern: 'MANDATORY E2E testing',
            subAgentHasPattern: subAgentHasMandatory,
            sectionHasPattern: sectionHasMandatory,
            message: `Testing requirement mismatch: sub-agent has mandatory E2E=${subAgentHasMandatory}, section has mandatory E2E=${sectionHasMandatory}`
          });
        }
      }

      alignedSubAgents.push({
        code: subAgent.code,
        name: subAgent.name,
        sectionType: expectedSectionType,
        sectionId: matchingSection.id
      });
    }

    // Summary
    console.log('=' .repeat(80));
    console.log('📋 ALIGNMENT CHECK SUMMARY');
    console.log('=' .repeat(80));
    console.log('');

    if (issues.length === 0) {
      console.log('✅ All sub-agents are properly aligned with protocol sections!\n');
    } else {
      console.log(`⚠️ Found ${issues.length} alignment issue(s):\n`);

      // Group issues by type
      const issuesByType = {};
      issues.forEach(issue => {
        if (!issuesByType[issue.type]) {
          issuesByType[issue.type] = [];
        }
        issuesByType[issue.type].push(issue);
      });

      // Report issues by type
      Object.keys(issuesByType).forEach(type => {
        const typeIssues = issuesByType[type];
        console.log(`\n🔸 ${type} (${typeIssues.length} issue(s)):`);
        console.log('-' .repeat(80));
        typeIssues.forEach(issue => {
          console.log(`\n   Sub-Agent: ${issue.subAgent} - ${issue.name || 'N/A'}`);
          console.log(`   Issue: ${issue.message}`);
          if (issue.type === 'VERSION_MISMATCH') {
            console.log(`   → Sub-agent version: ${issue.subAgentVersion}`);
            console.log(`   → Section version: ${issue.sectionVersion}`);
            console.log(`   → Action: Sync versions between tables`);
          }
          if (issue.type === 'CONTENT_LENGTH_MISMATCH') {
            console.log(`   → Sub-agent description: ${issue.descriptionLength} chars`);
            console.log(`   → Section content: ${issue.contentLength} chars`);
            console.log(`   → Difference: ${issue.difference} chars (${issue.differencePercent}%)`);
            console.log(`   → Action: Review content and ensure both tables have same information`);
          }
          if (issue.type === 'MISSING_SECTION') {
            console.log(`   → Expected section_type: ${issue.expectedSectionType}`);
            console.log(`   → Action: Create corresponding section in leo_protocol_sections`);
          }
          if (issue.type === 'CONTENT_PATTERN_MISMATCH') {
            console.log(`   → Pattern: ${issue.pattern}`);
            console.log(`   → Sub-agent has pattern: ${issue.subAgentHasPattern}`);
            console.log(`   → Section has pattern: ${issue.sectionHasPattern}`);
            console.log(`   → Action: Update content to match pattern requirements`);
          }
        });
      });

      console.log('\n');
      console.log('=' .repeat(80));
      console.log('📝 RECOMMENDED ACTIONS');
      console.log('=' .repeat(80));
      console.log('');
      console.log('1. Review each issue above');
      console.log('2. For VERSION_MISMATCH: Update metadata.version in both tables to match');
      console.log('3. For CONTENT_LENGTH_MISMATCH: Compare actual content and sync');
      console.log('4. For MISSING_SECTION: Create new section in leo_protocol_sections');
      console.log('5. For CONTENT_PATTERN_MISMATCH: Update content to match requirements');
      console.log('6. After fixes, regenerate CLAUDE.md: node scripts/generate-claude-md-from-db.js');
      console.log('');
    }

    // Show aligned sub-agents
    console.log('=' .repeat(80));
    console.log('✅ PROPERLY ALIGNED SUB-AGENTS');
    console.log('=' .repeat(80));
    console.log('');
    const alignedWithoutIssues = alignedSubAgents.filter(a =>
      !issues.some(i => i.subAgent === a.code)
    );
    if (alignedWithoutIssues.length > 0) {
      alignedWithoutIssues.forEach(a => {
        console.log(`   ✅ ${a.code.padEnd(15)} - ${a.name}`);
      });
    } else {
      console.log('   (none - all sub-agents have issues)');
    }
    console.log('');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

checkAlignment();
