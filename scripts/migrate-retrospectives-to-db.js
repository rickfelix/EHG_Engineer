#!/usr/bin/env node

/**
 * Migrate Existing Retrospectives from Markdown Files to Database
 * Parses retrospective markdown files and inserts structured data into database
 */

const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Retrospective file locations
const RETRO_LOCATIONS = [
  '/mnt/c/_EHG/EHG_Engineer', // Root folder - sprint completion reports
  '/mnt/c/_EHG/EHG_Engineer/docs/retrospectives',
  '/mnt/c/_EHG/EHG_Engineer/docs/04_features',
  '/mnt/c/_EHG/EHG_Engineer/scripts/archive/codex-integration/dual-lane-documentation/retrospectives',
  '/mnt/c/_EHG/EHG_Engineer/scripts/archive/codex-integration/dual-lane-documentation/retrospective'
];

/**
 * Parse a markdown retrospective file
 */
async function parseRetrospectiveFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const fileName = path.basename(filePath);

    const retrospective = {
      title: '',
      description: '',
      retro_type: 'SPRINT', // Default
      project_name: '',
      what_went_well: [],
      what_needs_improvement: [],
      action_items: [],
      key_learnings: [],
      success_patterns: [],
      failure_patterns: [],
      generated_by: 'MANUAL',
      status: 'PUBLISHED',
      original_file_path: filePath
    };

    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      retrospective.title = titleMatch[1].trim();
    } else {
      retrospective.title = fileName.replace('.md', '').replace(/-/g, ' ');
    }

    // Extract date from filename or content
    const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      retrospective.conducted_date = new Date(dateMatch[1]);
    }

    // Extract project/SD reference
    const projectMatch = content.match(/Project:\s*(.+)$/m) ||
                        content.match(/SD[-\s]?(\d+)/i);
    if (projectMatch) {
      retrospective.project_name = projectMatch[1].trim();
    }

    // Determine retrospective type - check filename first, then content
    if (fileName.toLowerCase().includes('sprint') && fileName.toLowerCase().includes('completion')) {
      retrospective.retro_type = 'SPRINT';
    } else if (fileName.toLowerCase().includes('final') && fileName.toLowerCase().includes('verification')) {
      retrospective.retro_type = 'SD_COMPLETION';
    } else if (fileName.toLowerCase().includes('final') && fileName.toLowerCase().includes('approval')) {
      retrospective.retro_type = 'SD_COMPLETION';
    } else if (content.toLowerCase().includes('sprint completion')) {
      retrospective.retro_type = 'SPRINT';
    } else if (content.toLowerCase().includes('sprint')) {
      retrospective.retro_type = 'SPRINT';
    } else if (content.toLowerCase().includes('incident') || content.toLowerCase().includes('post-mortem')) {
      retrospective.retro_type = 'INCIDENT';
    } else if (content.toLowerCase().includes('milestone')) {
      retrospective.retro_type = 'MILESTONE';
    } else if (content.toLowerCase().includes('release')) {
      retrospective.retro_type = 'RELEASE';
    } else if (content.match(/SD[-\s]?\d+/i)) {
      retrospective.retro_type = 'SD_COMPLETION';
    }

    // Extract SD ID if present
    const sdMatch = content.match(/SD[-\s]?(\d{3})/i);
    if (sdMatch) {
      retrospective.sd_id = `SD-${sdMatch[1]}`;
    }

    // Parse sections
    const sections = content.split(/^##\s+/m);

    sections.forEach(section => {
      const lines = section.split('\n').filter(l => l.trim());
      const sectionTitle = lines[0]?.toLowerCase() || '';

      if (sectionTitle.includes('what went well') || sectionTitle.includes('successes')) {
        retrospective.what_went_well = extractListItems(section);
      } else if (sectionTitle.includes('improvement') || sectionTitle.includes('challenges')) {
        retrospective.what_needs_improvement = extractListItems(section);
      } else if (sectionTitle.includes('action') || sectionTitle.includes('next steps')) {
        retrospective.action_items = extractListItems(section);
      } else if (sectionTitle.includes('learning') || sectionTitle.includes('insights')) {
        retrospective.key_learnings = extractListItems(section);
      } else if (sectionTitle.includes('summary') || sectionTitle.includes('executive')) {
        retrospective.description = lines.slice(1).join(' ').trim();
      }
    });

    // Extract patterns
    retrospective.success_patterns = extractPatterns(content, 'success');
    retrospective.failure_patterns = extractPatterns(content, 'failure');

    // Extract metrics if present
    const velocityMatch = content.match(/velocity[:\s]+(\d+)/i);
    if (velocityMatch) {
      retrospective.velocity_achieved = parseInt(velocityMatch[1]);
    }

    const bugsMatch = content.match(/bugs?[:\s]+(\d+)/i);
    if (bugsMatch) {
      retrospective.bugs_found = parseInt(bugsMatch[1]);
    }

    return retrospective;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

/**
 * Extract list items from markdown section
 */
function extractListItems(section) {
  const items = [];
  const lines = section.split('\n');

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./)) {
      const item = trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      if (item) {
        items.push({
          text: item,
          category: detectCategory(item)
        });
      }
    }
  });

  return items;
}

/**
 * Extract patterns from content
 */
function extractPatterns(content, type) {
  const patterns = [];
  const keywords = {
    success: ['worked well', 'successful', 'effective', 'good', 'positive'],
    failure: ['failed', 'issue', 'problem', 'challenge', 'difficult', 'blocked']
  };

  const relevantKeywords = keywords[type] || [];
  const lines = content.split('\n');

  lines.forEach(line => {
    const lower = line.toLowerCase();
    if (relevantKeywords.some(kw => lower.includes(kw))) {
      // Extract key phrases
      const phrases = line.match(/["']([^"']+)["']/g) || [];
      phrases.forEach(phrase => {
        patterns.push(phrase.replace(/["']/g, ''));
      });
    }
  });

  return [...new Set(patterns)]; // Remove duplicates
}

/**
 * Detect category of an item
 */
function detectCategory(text) {
  const lower = text.toLowerCase();

  if (lower.includes('test') || lower.includes('coverage')) return 'testing';
  if (lower.includes('security') || lower.includes('auth')) return 'security';
  if (lower.includes('performance') || lower.includes('speed')) return 'performance';
  if (lower.includes('database') || lower.includes('schema')) return 'database';
  if (lower.includes('ui') || lower.includes('ux') || lower.includes('design')) return 'design';
  if (lower.includes('process') || lower.includes('workflow')) return 'process';
  if (lower.includes('communication') || lower.includes('team')) return 'team';

  return 'general';
}

/**
 * Migrate retrospective to database
 */
async function migrateToDatabase(retrospective) {
  try {
    // Insert main retrospective
    const { data, error } = await supabase
      .from('retrospectives')
      .insert({
        title: retrospective.title,
        description: retrospective.description,
        retro_type: retrospective.retro_type,
        project_name: retrospective.project_name,
        sd_id: retrospective.sd_id,
        conducted_date: retrospective.conducted_date,
        what_went_well: retrospective.what_went_well,
        what_needs_improvement: retrospective.what_needs_improvement,
        action_items: retrospective.action_items,
        key_learnings: retrospective.key_learnings,
        success_patterns: retrospective.success_patterns,
        failure_patterns: retrospective.failure_patterns,
        velocity_achieved: retrospective.velocity_achieved,
        bugs_found: retrospective.bugs_found,
        generated_by: retrospective.generated_by,
        status: retrospective.status,
        trigger_event: 'manual_migration'
      })
      .select()
      .single();

    if (error) {
      console.error(`Failed to migrate ${retrospective.title}:`, error);
      return false;
    }

    // Extract and insert insights
    const insights = [];

    // Extract insights from learnings
    retrospective.key_learnings.forEach(learning => {
      insights.push({
        retrospective_id: data.id,
        insight_type: 'TECHNICAL_LEARNING',
        title: learning.text.substring(0, 100),
        description: learning.text,
        impact_level: 'MEDIUM',
        is_actionable: true
      });
    });

    // Extract insights from improvements needed
    retrospective.what_needs_improvement.forEach(item => {
      insights.push({
        retrospective_id: data.id,
        insight_type: 'PROCESS_IMPROVEMENT',
        title: item.text.substring(0, 100),
        description: item.text,
        impact_level: 'HIGH',
        is_actionable: true,
        affected_areas: [item.category]
      });
    });

    if (insights.length > 0) {
      const { error: insightError } = await supabase
        .from('retrospective_insights')
        .insert(insights);

      if (insightError) {
        console.warn(`Warning: Could not insert insights for ${retrospective.title}`);
      }
    }

    // Create action items
    const actionItems = retrospective.action_items.map(item => ({
      retrospective_id: data.id,
      title: item.text.substring(0, 100),
      description: item.text,
      category: item.category.toUpperCase(),
      priority: 'MEDIUM',
      status: 'PENDING'
    }));

    if (actionItems.length > 0) {
      const { error: actionError } = await supabase
        .from('retrospective_action_items')
        .insert(actionItems);

      if (actionError) {
        console.warn(`Warning: Could not insert action items for ${retrospective.title}`);
      }
    }

    return true;
  } catch (error) {
    console.error(`Migration error for ${retrospective.title}:`, error);
    return false;
  }
}

/**
 * Archive migrated files
 */
async function archiveFile(filePath) {
  const archiveDir = '/mnt/c/_EHG/EHG_Engineer/archived_retrospectives';

  try {
    // Create archive directory if it doesn't exist
    await fs.mkdir(archiveDir, { recursive: true });

    const fileName = path.basename(filePath);
    const archivePath = path.join(archiveDir, fileName);

    // Move file to archive
    await fs.rename(filePath, archivePath);
    console.log(`📦 Archived: ${fileName}`);

    return true;
  } catch (error) {
    console.error(`Could not archive ${filePath}:`, error);
    return false;
  }
}

/**
 * Main migration process
 */
async function migrateAllRetrospectives() {
  console.log('🔄 Starting Retrospective Migration to Database\n');

  let totalFiles = 0;
  let successfulMigrations = 0;
  let failedMigrations = 0;
  const allRetrospectives = [];

  // Find all retrospective files
  for (const location of RETRO_LOCATIONS) {
    try {
      const files = await fs.readdir(location);
      const mdFiles = files.filter(f => {
        if (!f.endsWith('.md')) return false;
        const lower = f.toLowerCase();
        return lower.includes('retro') ||
               lower.includes('retrospective') ||
               lower.includes('completion-report') ||
               (lower.includes('sprint') && lower.includes('completion')) ||
               (lower.includes('final') && lower.includes('verification')) ||
               (lower.includes('final') && lower.includes('approval')) ||
               lower.includes('supervisor-verification') ||
               lower.includes('system-verification');
      });

      console.log(`📁 Found ${mdFiles.length} retrospective files in ${location}`);

      for (const file of mdFiles) {
        const filePath = path.join(location, file);
        totalFiles++;

        console.log(`\n📄 Processing: ${file}`);

        const retrospective = await parseRetrospectiveFile(filePath);
        if (retrospective) {
          allRetrospectives.push({ ...retrospective, filePath });
          console.log(`  ✅ Parsed successfully`);
        } else {
          console.log(`  ❌ Failed to parse`);
          failedMigrations++;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not access location: ${location}`);
    }
  }

  // Migrate to database
  console.log(`\n📊 Migrating ${allRetrospectives.length} retrospectives to database...`);

  for (const retro of allRetrospectives) {
    const success = await migrateToDatabase(retro);
    if (success) {
      successfulMigrations++;
      console.log(`✅ Migrated: ${retro.title}`);

      // Archive the file
      if (process.argv.includes('--archive')) {
        await archiveFile(retro.filePath);
      }
    } else {
      failedMigrations++;
      console.log(`❌ Failed: ${retro.title}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total files found: ${totalFiles}`);
  console.log(`Successfully migrated: ${successfulMigrations}`);
  console.log(`Failed migrations: ${failedMigrations}`);

  if (process.argv.includes('--archive')) {
    console.log('\n✅ Original files have been archived to /archived_retrospectives');
  } else {
    console.log('\n💡 Tip: Run with --archive flag to move original files to archive');
  }

  // Link to cross-agent intelligence
  if (successfulMigrations > 0) {
    console.log('\n🔗 Linking retrospectives to cross-agent intelligence system...');
    await linkToIntelligenceSystem();
  }
}

/**
 * Link retrospectives to cross-agent intelligence
 */
async function linkToIntelligenceSystem() {
  try {
    // Get recent retrospectives
    const { data: retrospectives } = await supabase
      .from('retrospectives')
      .select('id, sd_id, success_patterns, failure_patterns')
      .not('sd_id', 'is', null)
      .limit(50);

    if (!retrospectives || retrospectives.length === 0) {
      console.log('No retrospectives with SD links found');
      return;
    }

    // Create learning links for SD-linked retrospectives
    const links = [];

    for (const retro of retrospectives) {
      // Check if learning outcome exists for this SD
      const { data: outcome } = await supabase
        .from('agent_learning_outcomes')
        .select('id')
        .eq('sd_id', retro.sd_id)
        .single();

      if (outcome) {
        links.push({
          retrospective_id: retro.id,
          learning_outcome_id: outcome.id,
          correlation_type: 'DIRECT',
          correlation_strength: 0.85,
          learning_summary: `Patterns identified: ${retro.success_patterns.length} success, ${retro.failure_patterns.length} failure`,
          impacts_agent: 'ALL'
        });
      }
    }

    if (links.length > 0) {
      const { error } = await supabase
        .from('retrospective_learning_links')
        .insert(links);

      if (error) {
        console.warn('⚠️ Could not create all learning links:', error.message);
      } else {
        console.log(`✅ Created ${links.length} links to cross-agent intelligence`);
      }
    }

  } catch (error) {
    console.error('Error linking to intelligence system:', error);
  }
}

// Execute migration
migrateAllRetrospectives().catch(console.error);