#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Migrate LEO Protocols from Files to Database
 * Transforms file-based protocols into database-first architecture
 */

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class LEOProtocolMigrator {
  constructor() {
    this.protocolsPath = path.join(__dirname, '../docs/03_protocols_and_standards');
    this.protocols = new Map();
    this.subAgentDocs = [];
  }

  async migrate() {
    console.log('🚀 Starting LEO Protocol Migration to Database\n');
    
    try {
      // Step 1: Scan and parse all protocol files
      await this.scanProtocolFiles();
      
      // Step 2: Migrate protocols to database
      await this.migrateProtocols();
      
      // Step 3: Set up sub-agent documentation
      await this.migrateSubAgentDocs();
      
      // Step 4: Create handoff templates
      await this.createHandoffTemplates();
      
      // Step 5: Set active version
      await this.setActiveVersion();
      
      // Step 6: Create validation rules
      await this.createValidationRules();
      
      console.log('\n✅ Migration Complete!');
      console.log('📊 Summary:');
      console.log(`   - Protocols migrated: ${this.protocols.size}`);
      console.log(`   - Sub-agent docs: ${this.subAgentDocs.length}`);
      console.log('   - Active version: v4.1.2_database_first');
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }

  async scanProtocolFiles() {
    console.log('📁 Scanning protocol files...');
    
    const files = fs.readdirSync(this.protocolsPath);
    const protocolFiles = files.filter(f => f.match(/leo_protocol_v[\d\._]+\.md$/i));
    
    for (const file of protocolFiles) {
      const filePath = path.join(this.protocolsPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Extract version from filename
      const versionMatch = file.match(/leo_protocol_v([\d\._\w]+)\.md$/i);
      if (!versionMatch) continue;
      
      const version = versionMatch[1];
      
      // Parse protocol metadata from content
      const metadata = this.parseProtocolMetadata(content, version);
      
      this.protocols.set(version, {
        file,
        version,
        content,
        metadata
      });
      
      console.log(`   ✓ Found protocol v${version}`);
    }
    
    // Also scan for sub-agent documentation
    const subAgentFiles = files.filter(f => f.match(/LEO.*SUB.*AGENT/i));
    for (const file of subAgentFiles) {
      const filePath = path.join(this.protocolsPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      this.subAgentDocs.push({ file, content });
      console.log(`   ✓ Found sub-agent doc: ${file}`);
    }
  }

  parseProtocolMetadata(content, version) {
    const metadata = {
      title: '',
      status: 'superseded',
      description: '',
      superseded_by: null,
      sections: []
    };
    
    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      metadata.title = titleMatch[1];
    }
    
    // Check if superseded
    if (content.includes('SUPERSEDED') || content.includes('Status: Superseded')) {
      metadata.status = 'superseded';
      
      // Find what superseded it
      const supersededMatch = content.match(/SUPERSEDED BY.*?v([\d\._\w]+)/i);
      if (supersededMatch) {
        metadata.superseded_by = supersededMatch[1];
      }
    } else if (version === '4.1.2_database_first') {
      metadata.status = 'active';
    }
    
    // Extract major sections
    const sectionMatches = content.matchAll(/^##\s+(.+)$/gm);
    for (const match of sectionMatches) {
      metadata.sections.push(match[1]);
    }
    
    // Extract description (first paragraph after title)
    const descMatch = content.match(/^#[^#].*?\n\n(.+?)(?:\n\n|$)/s);
    if (descMatch) {
      metadata.description = descMatch[1].replace(/\n/g, ' ').substring(0, 500);
    }
    
    return metadata;
  }

  async migrateProtocols() {
    console.log('\n📤 Migrating protocols to database...');
    
    for (const [version, protocol] of this.protocols) {
      const protocolId = `leo-v${version.replace(/\./g, '-')}`;
      
      // Insert main protocol
      const { error } = await supabase
        .from('leo_protocols')
        .upsert({
          id: protocolId,
          version: version,
          status: protocol.metadata.status,
          title: protocol.metadata.title || `LEO Protocol v${version}`,
          description: protocol.metadata.description,
          content: protocol.content,
          created_by: 'migration',
          superseded_by: protocol.metadata.superseded_by ? 
            `leo-v${protocol.metadata.superseded_by.replace(/\./g, '-')}` : null,
          metadata: {
            source_file: protocol.file,
            migrated_at: new Date().toISOString(),
            sections: protocol.metadata.sections
          }
        })
        .select()
        .single();
      
      if (error) {
        console.warn(`   ⚠️ Error migrating v${version}:`, error.message);
      } else {
        console.log(`   ✓ Migrated v${version}`);
        
        // Insert sections
        await this.migrateProtocolSections(protocolId, protocol);
      }
    }
  }

  async migrateProtocolSections(protocolId, protocol) {
    const sections = this.extractSections(protocol.content);
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      
      await supabase
        .from('leo_protocol_sections')
        .upsert({
          protocol_id: protocolId,
          section_type: this.categorizeSectionType(section.title),
          title: section.title,
          content: section.content,
          order_index: i
        });
    }
  }

  extractSections(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = null;
    let currentContent = [];
    
    for (const line of lines) {
      if (line.match(/^##\s+(.+)$/)) {
        if (currentSection) {
          sections.push({
            title: currentSection,
            content: currentContent.join('\n').trim()
          });
        }
        currentSection = line.replace(/^##\s+/, '');
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }
    
    if (currentSection) {
      sections.push({
        title: currentSection,
        content: currentContent.join('\n').trim()
      });
    }
    
    return sections;
  }

  categorizeSectionType(title) {
    const lower = title.toLowerCase();
    if (lower.includes('agent')) return 'agents';
    if (lower.includes('handoff')) return 'handoffs';
    if (lower.includes('sub-agent') || lower.includes('subagent')) return 'subagents';
    if (lower.includes('verif')) return 'verification';
    if (lower.includes('deploy')) return 'deployment';
    if (lower.includes('progress')) return 'progress';
    if (lower.includes('workflow')) return 'workflow';
    return 'general';
  }

  async migrateSubAgentDocs() {
    console.log('\n📤 Migrating sub-agent documentation...');
    
    // Extract and store sub-agent handoff templates
    for (const doc of this.subAgentDocs) {
      if (doc.file.includes('HANDOFF')) {
        await this.extractHandoffTemplates(doc.content);
      }
    }
  }

  async extractHandoffTemplates(content) {
    // Extract the 7-element handoff template
    const templateMatch = content.match(/Template:.*?```markdown([\s\S]+?)```/);
    if (templateMatch) {
      const template = templateMatch[1];
      
      await supabase
        .from('leo_sub_agent_handoffs')
        .upsert({
          sub_agent_id: 'generic-sub',
          handoff_template: {
            structure: template,
            elements: [
              'Executive Summary',
              'Scope & Requirements',
              'Context Package',
              'Deliverables Manifest',
              'Success Criteria & Validation',
              'Resource Allocation',
              'Handoff Requirements'
            ]
          },
          validation_rules: ['All 7 elements required', 'Executive summary ≤200 tokens'],
          required_outputs: ['Analysis results', 'Recommendations', 'Risk assessment']
        });
      
      console.log('   ✓ Extracted handoff template');
    }
  }

  async createHandoffTemplates() {
    console.log('\n📤 Creating handoff templates...');
    
    const handoffs = [
      {
        from_agent: 'LEAD',
        to_agent: 'PLAN',
        handoff_type: 'strategic_to_technical',
        template_structure: {
          sections: [
            'Executive Summary',
            'Completeness Report',
            'Deliverables Manifest',
            'Key Decisions & Rationale',
            'Known Issues & Risks',
            'Resource Utilization',
            'Action Items for Receiver'
          ]
        },
        required_elements: ['SD created', 'Objectives defined', 'Priority set']
      },
      {
        from_agent: 'PLAN',
        to_agent: 'EXEC',
        handoff_type: 'technical_to_implementation',
        template_structure: {
          sections: [
            'Executive Summary',
            'Completeness Report',
            'Deliverables Manifest',
            'Key Decisions & Rationale',
            'Known Issues & Risks',
            'Resource Utilization',
            'Action Items for Receiver'
          ]
        },
        required_elements: ['PRD complete', 'Technical specs defined', 'Sub-agents identified']
      },
      {
        from_agent: 'EXEC',
        to_agent: 'PLAN',
        handoff_type: 'implementation_to_verification',
        template_structure: {
          sections: [
            'Executive Summary',
            'Completeness Report',
            'Deliverables Manifest',
            'Key Decisions & Rationale',
            'Known Issues & Risks',
            'Resource Utilization',
            'Action Items for Receiver'
          ]
        },
        required_elements: ['Implementation complete', 'Tests passing', 'Documentation updated']
      }
    ];
    
    for (const handoff of handoffs) {
      await supabase
        .from('leo_handoff_templates')
        .upsert(handoff);
      
      console.log(`   ✓ Created ${handoff.from_agent} → ${handoff.to_agent} template`);
    }
  }

  async setActiveVersion() {
    console.log('\n🎯 Setting active version...');
    
    // Ensure only v4.1.2_database_first is active
    await supabase
      .from('leo_protocols')
      .update({ status: 'superseded' })
      .neq('version', '4.1.2_database_first');
    
    await supabase
      .from('leo_protocols')
      .update({ status: 'active' })
      .eq('version', '4.1.2_database_first');
    
    console.log('   ✓ Set v4.1.2_database_first as active');
  }

  async createValidationRules() {
    console.log('\n📋 Creating validation rules...');
    
    const rules = [
      {
        protocol_id: 'leo-v4-1-2_database_first',
        rule_type: 'handoff',
        rule_name: 'seven_elements_required',
        rule_definition: {
          check: 'all_elements_present',
          elements: 7,
          severity: 'error'
        },
        severity: 'error'
      },
      {
        protocol_id: 'leo-v4-1-2_database_first',
        rule_type: 'sub_agent',
        rule_name: 'automatic_activation',
        rule_definition: {
          check: 'trigger_phrase_match',
          action: 'activate_sub_agent',
          severity: 'warning'
        },
        severity: 'warning'
      },
      {
        protocol_id: 'leo-v4-1-2_database_first',
        rule_type: 'progress',
        rule_name: 'phase_percentages',
        rule_definition: {
          LEAD: { planning: 20, approval: 15 },
          PLAN: { design: 20, verification: 15 },
          EXEC: { implementation: 30 }
        },
        severity: 'info'
      }
    ];
    
    for (const rule of rules) {
      await supabase
        .from('leo_validation_rules')
        .upsert(rule);
    }
    
    console.log(`   ✓ Created ${rules.length} validation rules`);
  }
}

// Run migration
async function main() {
  const migrator = new LEOProtocolMigrator();
  await migrator.migrate();
}

main().catch(console.error);
