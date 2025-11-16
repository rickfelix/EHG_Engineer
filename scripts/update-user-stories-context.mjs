#!/usr/bin/env node

/**
 * Update User Stories with Implementation Context
 * Enriches user stories with technical context from stories-agent
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const SD_ID = 'SD-STAGE4-UI-RESTRUCTURE-001';

// Implementation context from stories-agent
const userStoriesContext = {
  'US-001': {
    title: 'Move Manual Competitor Entry to Advanced Settings Accordion',
    implementation_context: {
      architecture_references: [
        '/mnt/c/_EHG/ehg/src/components/competitive-intelligence/CompetitiveIntelligenceView.tsx',
        '/mnt/c/_EHG/ehg/src/components/competitive-intelligence/ManualCompetitorEntry.tsx',
        '/mnt/c/_EHG/ehg/src/components/ui/accordion.tsx'
      ],
      technical_requirements: {
        components_to_modify: ['CompetitiveIntelligenceView.tsx'],
        new_components: [],
        dependencies: ['@radix-ui/react-accordion'],
        state_management: 'useState for accordion open/closed state',
        data_flow: 'Keep existing manual entry logic, just relocate UI'
      },
      implementation_steps: [
        'Import Accordion components from shadcn/ui',
        'Wrap manual competitor entry in AccordionItem',
        'Set default state to collapsed',
        'Add visual indicator for advanced users',
        'Preserve all existing functionality'
      ],
      testing_scenarios: [
        'Accordion starts collapsed by default',
        'Manual entry form still submits correctly when in accordion',
        'Form validation still works',
        'Accordion state persists during session',
        'Mobile responsive behavior'
      ],
      edge_cases: [
        'User has partially filled form when accordion collapses',
        'Form errors should expand accordion automatically',
        'Deep linking to manual entry should expand accordion'
      ],
      success_criteria: 'Manual entry hidden by default, accessible via accordion, no functionality lost'
    }
  },
  'US-002': {
    title: 'Create AIProgressCard Component',
    implementation_context: {
      architecture_references: [
        '/mnt/c/_EHG/ehg/src/components/competitive-intelligence/AIProgressCard.tsx',
        '/mnt/c/_EHG/ehg/src/hooks/useAgentExecution.ts',
        '/mnt/c/_EHG/ehg/src/lib/api/agent-execution.ts'
      ],
      technical_requirements: {
        components_to_modify: [],
        new_components: ['AIProgressCard.tsx'],
        dependencies: ['framer-motion', 'lucide-react'],
        state_management: 'useAgentExecutionStatus custom hook',
        data_flow: 'WebSocket subscription to agent execution updates'
      },
      implementation_steps: [
        'Create AIProgressCard component with TypeScript',
        'Implement progress bar with percentage',
        'Add status message display with typewriter effect',
        'Create loading spinner animation',
        'Integrate real-time updates via WebSocket'
      ],
      testing_scenarios: [
        'Component renders with initial state',
        'Progress updates smoothly from 0-100%',
        'Status messages update in real-time',
        'Handles connection loss gracefully',
        'Completion state shows success message'
      ],
      edge_cases: [
        'WebSocket connection drops mid-execution',
        'Agent execution fails with error',
        'Multiple status updates arrive simultaneously',
        'User navigates away during execution',
        'Browser refresh during active execution'
      ],
      code_patterns: `
// AIProgressCard.tsx structure
interface AIProgressCardProps {
  executionId: string;
  onComplete?: (results: any) => void;
  onError?: (error: Error) => void;
}

export function AIProgressCard({ executionId, onComplete, onError }: AIProgressCardProps) {
  const { status, progress, message, error } = useAgentExecutionStatus(executionId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Research in Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={progress} />
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}`,
      success_criteria: 'Real-time progress display with smooth animations and clear status messages'
    }
  },
  'US-003': {
    title: 'Implement Navigation Blocking Logic',
    implementation_context: {
      architecture_references: [
        '/mnt/c/_EHG/ehg/src/components/competitive-intelligence/CompetitiveIntelligenceView.tsx',
        '/mnt/c/_EHG/ehg/src/hooks/useNavigationBlock.ts',
        '/mnt/c/_EHG/ehg/src/components/ui/alert-dialog.tsx'
      ],
      technical_requirements: {
        components_to_modify: ['CompetitiveIntelligenceView.tsx'],
        new_components: ['NavigationBlockDialog.tsx'],
        dependencies: ['react-router-dom', '@radix-ui/react-alert-dialog'],
        state_management: 'useNavigationBlock custom hook',
        data_flow: 'Router beforeunload and navigation events'
      },
      implementation_steps: [
        'Create useNavigationBlock hook',
        'Add beforeunload event listener',
        'Implement router navigation guard',
        'Create confirmation dialog component',
        'Wire up to agent execution state'
      ],
      testing_scenarios: [
        'Navigation blocked during active execution',
        'Browser refresh shows warning',
        'Cancel keeps user on page',
        'Confirm allows navigation',
        'No blocking when execution complete'
      ],
      edge_cases: [
        'Multiple rapid navigation attempts',
        'Browser back button during execution',
        'Force refresh (Ctrl+F5)',
        'Browser close attempt',
        'Session timeout during execution'
      ],
      code_patterns: `
// useNavigationBlock.ts
export function useNavigationBlock(isBlocking: boolean) {
  useEffect(() => {
    if (!isBlocking) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isBlocking]);
}`,
      success_criteria: 'Users cannot accidentally lose AI research progress, clear warnings provided'
    }
  },
  'US-004': {
    title: 'Integrate Agent Execution Status Updates',
    implementation_context: {
      architecture_references: [
        '/mnt/c/_EHG/ehg/src/hooks/useAgentExecutionStatus.ts',
        '/mnt/c/_EHG/ehg/src/lib/api/agent-execution.ts',
        '/mnt/c/_EHG/ehg/src/services/websocket.ts'
      ],
      technical_requirements: {
        components_to_modify: ['CompetitiveIntelligenceView.tsx'],
        new_components: ['useAgentExecutionStatus.ts'],
        dependencies: ['@supabase/supabase-js'],
        state_management: 'Custom hook with useState and useEffect',
        data_flow: 'Supabase Realtime subscriptions'
      },
      implementation_steps: [
        'Create useAgentExecutionStatus hook',
        'Set up Supabase Realtime channel',
        'Subscribe to agent_execution_logs table',
        'Parse and transform status updates',
        'Expose status, progress, and message states'
      ],
      testing_scenarios: [
        'Initial connection establishes successfully',
        'Updates received and processed correctly',
        'Progress increments smoothly',
        'Error states handled gracefully',
        'Cleanup on unmount works properly'
      ],
      edge_cases: [
        'Duplicate status updates received',
        'Out-of-order message delivery',
        'Connection drops and reconnects',
        'Invalid message format received',
        'Subscription limit exceeded'
      ],
      code_patterns: `
// useAgentExecutionStatus.ts
export function useAgentExecutionStatus(executionId: string) {
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const channel = supabase
      .channel(\`execution-\${executionId}\`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_execution_logs',
        filter: \`execution_id=eq.\${executionId}\`
      }, (payload) => {
        const { progress_percentage, message, log_level } = payload.new;
        if (progress_percentage) setProgress(progress_percentage);
        if (message) setMessage(message);
        if (log_level === 'error') setStatus('error');
        if (progress_percentage === 100) setStatus('completed');
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [executionId]);

  return { status, progress, message };
}`,
      success_criteria: 'Real-time status updates flow seamlessly from backend to UI'
    }
  }
};

async function updateUserStories() {
  let client;

  try {
    console.log('🔄 Updating user stories with implementation context...\n');

    // Connect to database
    client = await createDatabaseClient('engineer', { verify: false });

    // Update each user story
    for (const [storyId, context] of Object.entries(userStoriesContext)) {
      console.log(`📝 Updating ${storyId}: ${context.title}`);

      const updateQuery = `
        UPDATE user_stories_v2
        SET
          implementation_context = $1,
          technical_notes = $2,
          updated_at = NOW()
        WHERE sd_id = $3 AND id = $4
        RETURNING id, title
      `;

      const technicalNotes = `
        Components: ${context.implementation_context.technical_requirements.new_components.join(', ') || 'None'}
        Dependencies: ${context.implementation_context.technical_requirements.dependencies.join(', ')}
        State: ${context.implementation_context.technical_requirements.state_management}
        Testing: ${context.implementation_context.testing_scenarios.length} test scenarios defined
      `.trim();

      const result = await client.query(updateQuery, [
        JSON.stringify(context.implementation_context),
        technicalNotes,
        SD_ID,
        storyId
      ]);

      if (result.rows.length > 0) {
        console.log(`   ✅ Updated successfully`);
      } else {
        console.log(`   ⚠️  Story not found, may need to create it first`);
      }
    }

    // Verify coverage
    console.log('\n📊 Verifying context engineering coverage...');

    const coverageQuery = `
      SELECT
        id,
        title,
        implementation_context IS NOT NULL as has_context,
        technical_notes
      FROM user_stories_v2
      WHERE sd_id = $1
      ORDER BY id
    `;

    const coverageResult = await client.query(coverageQuery, [SD_ID]);

    const totalStories = coverageResult.rows.length;
    const storiesWithContext = coverageResult.rows.filter(r => r.has_context).length;
    const coveragePercentage = totalStories > 0 ? (storiesWithContext / totalStories * 100) : 0;

    console.log(`\n📈 Coverage Statistics:`);
    console.log(`   Total Stories: ${totalStories}`);
    console.log(`   With Context: ${storiesWithContext}`);
    console.log(`   Coverage: ${coveragePercentage.toFixed(1)}%`);

    if (coveragePercentage >= 80) {
      console.log(`   Status: ✅ Ready for PLAN→EXEC handoff (≥80% required)`);
    } else {
      console.log(`   Status: ⚠️  Below threshold for handoff (80% required)`);
    }

    console.log('\n📋 User Stories Status:');
    coverageResult.rows.forEach((story, idx) => {
      const contextIcon = story.has_context ? '✅' : '❌';
      console.log(`   ${idx + 1}. ${story.id}: ${story.title} ${contextIcon}`);
    });

    console.log('\n✨ Context engineering complete!');
    console.log('Next step: Create PLAN→EXEC handoff using unified-handoff-system.js');

  } catch (error) {
    console.error('❌ Error updating user stories:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run the update
updateUserStories().catch(console.error);