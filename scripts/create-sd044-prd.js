import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSD044PRD() {
  console.log('Creating comprehensive PRD for SD-044: New Page Consolidated...');

  const sdId = 'SD-044';

  // Create a comprehensive PRD for New Page System
  const prdContent = {
    id: `PRD-${sdId}`,
    title: 'PRD: New Page Consolidated System',
    is_consolidated: true,
    backlog_items: 5,
    priority_distribution: {
      'CRITICAL': 2,
      'HIGH': 3,
      'MEDIUM': 3,
      'LOW': 2
    },
    user_stories: [
      {
        id: `US-${sdId}-001`,
        title: 'Dynamic Page Builder and Content Management',
        description: 'As a content creator, I want a dynamic page builder to create and manage custom pages without technical knowledge',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Drag-and-drop page builder with component library',
          'Real-time preview and editing capabilities',
          'Template system with pre-built page layouts',
          'Content versioning and revision history',
          'SEO optimization tools and meta tag management',
          'Mobile-responsive design automation'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'Page Routing and Navigation System',
        description: 'As a developer, I want a flexible routing system to handle dynamic page creation and navigation',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Dynamic route generation for new pages',
          'Nested routing and sub-page support',
          'URL slug customization and management',
          'Breadcrumb navigation generation',
          'Page hierarchy and parent-child relationships',
          'Redirect management and URL handling'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'Component Library and Design System',
        description: 'As a designer, I want a comprehensive component library for consistent page creation',
        priority: 'HIGH',
        acceptance_criteria: [
          'Reusable UI components with customizable properties',
          'Design system integration with brand guidelines',
          'Component preview and documentation',
          'Theme support and color scheme management',
          'Typography and spacing consistency',
          'Accessibility compliance for all components'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'Page Analytics and Performance Monitoring',
        description: 'As a marketing manager, I want analytics and performance insights for all pages',
        priority: 'HIGH',
        acceptance_criteria: [
          'Page view tracking and user engagement metrics',
          'Performance monitoring (load times, Core Web Vitals)',
          'A/B testing framework for page variations',
          'Conversion tracking and funnel analysis',
          'Heat map integration and user behavior tracking',
          'Automated performance optimization suggestions'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'Content Personalization and Targeting',
        description: 'As a marketing specialist, I want personalized content delivery based on user segments',
        priority: 'HIGH',
        acceptance_criteria: [
          'User segmentation and audience targeting',
          'Dynamic content blocks based on user properties',
          'Geolocation-based content customization',
          'Behavioral targeting and content recommendations',
          'Integration with CRM and marketing automation',
          'Real-time content adaptation and testing'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'Multi-language and Localization Support',
        description: 'As a global business, I want multi-language support for international page content',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Multi-language content management system',
          'Translation workflow and approval process',
          'Locale-specific URL structure and routing',
          'Currency and date format localization',
          'RTL (right-to-left) language support',
          'Automated translation integration options'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Page Publishing and Workflow Management',
        description: 'As a content manager, I want controlled publishing workflows for page content',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Draft, review, and publish workflow states',
          'Role-based approval and permission system',
          'Scheduled publishing and content calendar',
          'Content staging and preview environments',
          'Bulk operations and batch publishing',
          'Audit trail and change tracking'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Search Engine Optimization (SEO) Tools',
        description: 'As an SEO specialist, I want built-in SEO tools for page optimization',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Meta tag editor with real-time preview',
          'Structured data markup generation',
          'XML sitemap automatic generation',
          'SEO audit and recommendations engine',
          'Social media preview and Open Graph tags',
          'Performance impact analysis for SEO'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Integration Hub and Third-party Connections',
        description: 'As a technical integrator, I want seamless integration with external services and APIs',
        priority: 'LOW',
        acceptance_criteria: [
          'CMS integration (Headless CMS support)',
          'E-commerce platform connectivity',
          'Social media platform integration',
          'Email marketing service connections',
          'Analytics platform integration (GA4, etc.)',
          'API webhook and event system'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Advanced Page Templates and Themes',
        description: 'As a brand manager, I want advanced templating and theming capabilities',
        priority: 'LOW',
        acceptance_criteria: [
          'Custom CSS and styling override system',
          'Template marketplace and sharing',
          'Brand guideline enforcement tools',
          'Dynamic theming based on content type',
          'Template inheritance and extension',
          'White-label and multi-brand support'
        ]
      }
    ],
    metadata: {
      implementation_notes: [
        'Foundation for dynamic page creation and content management',
        'Supports both EHG and EHG_Engineer page requirements',
        'Integrates with existing routing and navigation systems',
        'Provides scalable content management architecture',
        'Establishes framework for future page-based features'
      ],
      backlog_evidence: [
        'New page requirements from EHG backlog',
        'Content management needs identified',
        'Dynamic page creation requests from stakeholders'
      ]
    }
  };

  // Insert the PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: `PRD-${sdId}-${Date.now()}`,
      directive_id: sdId,
      title: prdContent.title,
      content: prdContent,
      status: 'approved',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (prdError) {
    console.error('Error creating PRD:', prdError);
  } else {
    console.log('✅ PRD created successfully!');
    console.log('   ID:', prd.id);
    console.log('   Title:', prdContent.title);
    console.log('   User Stories:', prdContent.user_stories.length);
    console.log('   Priority Distribution:', JSON.stringify(prdContent.priority_distribution));
  }
}

createSD044PRD().catch(console.error);