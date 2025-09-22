/**
 * Utilities Module
 * Shared utility functions and helpers
 * Extracted from database-loader.js - NO BEHAVIOR CHANGES
 */

class DatabaseUtilities {
  /**
   * Update checklist item status
   */
  async updateChecklistItem(supabase, documentType, documentId, checklistType, itemIndex, checked) {
    try {
      const table = documentType === 'SD' ? 'strategic_directives_v2' : 'product_requirements_v2';

      // First get the current document
      const { data: doc, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq('id', documentId)
        .single();

      if (fetchError) {
        console.error('❌ Error fetching document:', fetchError.message);
        return false;
      }

      // Update the appropriate checklist
      let updatedField = null;
      let updatedValue = null;

      if (documentType === 'SD') {
        // For SDs, update the checklist string
        const checklistItems = (doc.checklist || '').split('\n').filter(item => item.trim());
        if (itemIndex >= 0 && itemIndex < checklistItems.length) {
          const item = checklistItems[itemIndex];
          const cleanText = item.replace(/^-\s*/, '').replace(/^☑\s*/, '').replace(/^☐\s*/, '');
          checklistItems[itemIndex] = checked ? `☑ ${cleanText}` : `☐ ${cleanText}`;
          updatedField = 'checklist';
          updatedValue = checklistItems.join('\n');
        }
      } else if (documentType === 'PRD') {
        // For PRDs, update the specific checklist array
        if (checklistType === 'functional' && doc.functional_requirements) {
          updatedField = 'functional_checklist';
          updatedValue = doc.functional_checklist || [];
          updatedValue[itemIndex] = checked;
        } else if (checklistType === 'test' && doc.test_scenarios) {
          updatedField = 'test_checklist';
          updatedValue = doc.test_checklist || [];
          updatedValue[itemIndex] = checked;
        } else if (checklistType === 'acceptance' && doc.acceptance_criteria) {
          updatedField = 'acceptance_checklist';
          updatedValue = doc.acceptance_checklist || [];
          updatedValue[itemIndex] = checked;
        }
      }

      if (updatedField && updatedValue !== null) {
        const { error: updateError } = await supabase
          .from(table)
          .update({
            [updatedField]: updatedValue,
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        if (updateError) {
          console.error('❌ Error updating checklist:', updateError.message);
          return false;
        }

        console.log(`✅ Updated checklist item ${itemIndex} in ${documentType} ${documentId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Failed to update checklist:', error.message);
      return false;
    }
  }

  /**
   * Calculate PRD progress based on checklist completion
   */
  calculatePRDProgress(prd) {
    let totalItems = 0;
    let checkedItems = 0;

    // Count functional requirements
    if (prd.functional_requirements?.length > 0) {
      totalItems += prd.functional_requirements.length;
      if (prd.functional_checklist) {
        checkedItems += prd.functional_checklist.filter(Boolean).length;
      }
    }

    // Count test scenarios
    if (prd.test_scenarios?.length > 0) {
      totalItems += prd.test_scenarios.length;
      if (prd.test_checklist) {
        checkedItems += prd.test_checklist.filter(Boolean).length;
      }
    }

    // Count acceptance criteria
    if (prd.acceptance_criteria?.length > 0) {
      totalItems += prd.acceptance_criteria.length;
      if (prd.acceptance_checklist) {
        checkedItems += prd.acceptance_checklist.filter(Boolean).length;
      }
    }

    return totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
  }

  /**
   * Start database watch for real-time updates
   */
  startDatabaseWatch(supabase, callback, interval = 30000) {
    // Set up polling interval
    const watchInterval = setInterval(async () => {
      try {
        // Check for updates
        const { data: sds } = await supabase
          .from('strategic_directives_v2')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1);

        const { data: prds } = await supabase
          .from('product_requirements_v2')
          .select('updated_at')
          .order('updated_at', { ascending: false })
          .limit(1);

        // Trigger callback if there are updates
        if (callback) {
          callback({ sds, prds });
        }
      } catch (error) {
        console.error('Watch error:', error.message);
      }
    }, interval);

    // Return cleanup function
    return () => clearInterval(watchInterval);
  }

  /**
   * Generate Lovable.dev sections for PRDs
   */
  generateLovableDevSections(projectType = 'web-app') {
    const sections = {
      'web-app': {
        designSystem: `
## Design System
- **Typography**: System fonts with fallbacks
- **Color Palette**: Primary, secondary, neutral, semantic colors
- **Spacing**: 8px grid system
- **Components**: Button, Input, Card, Modal, Navigation
`,
        techStack: `
## Tech Stack
- **Frontend**: React 18+ with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand or Context API
- **Backend**: Supabase (Auth, Database, Storage)
- **Deployment**: Vercel or Netlify
`,
        accessibility: `
## Accessibility Requirements
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatibility
- Focus indicators
- Color contrast ratios
`
      }
    };

    return sections[projectType] || sections['web-app'];
  }

  /**
   * Generate AI workflow checklist
   */
  generateAIWorkflowChecklist() {
    return [
      { text: '[AI] Requirements analysis complete', checked: false, category: 'ai' },
      { text: '[AI] Design mockups generated', checked: false, category: 'ai' },
      { text: '[AI] Component structure defined', checked: false, category: 'ai' },
      { text: '[AI] API endpoints documented', checked: false, category: 'ai' },
      { text: '[AI] Database schema created', checked: false, category: 'ai' },
      { text: '[AI] Test cases generated', checked: false, category: 'ai' },
      { text: '[AI] Deployment pipeline configured', checked: false, category: 'ai' }
    ];
  }

  /**
   * Generate accessibility checklist
   */
  generateAccessibilityChecklist() {
    return [
      { text: '[A11y] Semantic HTML structure', checked: false, category: 'accessibility' },
      { text: '[A11y] ARIA labels and roles', checked: false, category: 'accessibility' },
      { text: '[A11y] Keyboard navigation tested', checked: false, category: 'accessibility' },
      { text: '[A11y] Screen reader tested', checked: false, category: 'accessibility' },
      { text: '[A11y] Color contrast verified', checked: false, category: 'accessibility' },
      { text: '[A11y] Focus management implemented', checked: false, category: 'accessibility' },
      { text: '[A11y] Error messages accessible', checked: false, category: 'accessibility' }
    ];
  }
}

export default DatabaseUtilities;