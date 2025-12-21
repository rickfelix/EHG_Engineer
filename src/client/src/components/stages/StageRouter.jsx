/**
 * StageRouter Component
 * Dynamically routes ventures to their appropriate stage view
 *
 * SD: SD-INDUSTRIAL-2025-001 (Sovereign Industrial Expansion)
 * Block A: Stages 7-11 (GTM & Persona Fit)
 * Block B: Stages 12-16 (Sales & Operational Flow)
 * Block C: Stages 17-21 (MVP Feedback Loop)
 * Block D: Stages 22-25 (Infrastructure & Exit)
 *
 * This component provides:
 * 1. Stage-specific views for all 25 stages
 * 2. Phase-aware navigation
 * 3. Golden Nugget artifact display
 * 4. Stage transition controls
 */

import React from 'react';
import {
  FileText,
  Brain,
  Target,
  Users,
  DollarSign,
  AlertTriangle,
  Tag,
  LayoutGrid,
  LogOut,
  Palette,
  Megaphone,
  Users2,
  Cpu,
  Database,
  FileCode,
  Code,
  Settings,
  Hammer,
  Plug,
  Shield,
  TestTube,
  Cloud,
  Rocket,
  BarChart,
  TrendingUp
} from 'lucide-react';

// Block A Stage Components (Stages 7-11)
import PricingStrategy from './PricingStrategy';
import BusinessModelCanvas from './BusinessModelCanvas';
import ExitOrientedDesign from './ExitOrientedDesign';
import StrategicNaming from './StrategicNaming';
import GoToMarketStrategy from './GoToMarketStrategy';

// Block B Stage Components (Stages 12-16)
import SalesSuccessLogic from './SalesSuccessLogic';
import TechStackInterrogation from './TechStackInterrogation';
import DataModelArchitecture from './DataModelArchitecture';
import EpicUserStoryBreakdown from './EpicUserStoryBreakdown';
import SpecDrivenSchemaGen from './SpecDrivenSchemaGen';

// Block C Stage Components (Stages 17-21)
import EnvironmentAgentConfig from './EnvironmentAgentConfig';
import MVPDevelopmentLoop from './MVPDevelopmentLoop';
import IntegrationAPILayer from './IntegrationAPILayer';
import SecurityPerformance from './SecurityPerformance';
import QAandUAT from './QAandUAT';

// Block D Stage Components (Stages 22-25)
import DeploymentInfrastructure from './DeploymentInfrastructure';
import ProductionLaunch from './ProductionLaunch';
import AnalyticsFeedback from './AnalyticsFeedback';
import OptimizationScale from './OptimizationScale';

// Stage configurations from stages_v2.yaml
const STAGE_CONFIG = {
  // Phase 1: THE TRUTH (Stages 1-5)
  1: { title: 'Draft Idea & Chairman Review', phase: 'THE TRUTH', icon: FileText, color: 'blue' },
  2: { title: 'AI Multi-Model Critique', phase: 'THE TRUTH', icon: Brain, color: 'blue' },
  3: { title: 'Market Validation & RAT', phase: 'THE TRUTH', icon: Target, color: 'blue' },
  4: { title: 'Competitive Intelligence', phase: 'THE TRUTH', icon: Users, color: 'blue' },
  5: { title: 'Profitability Forecasting', phase: 'THE TRUTH', icon: DollarSign, color: 'blue' },

  // Phase 2: THE ENGINE (Stages 6-9)
  6: { title: 'Risk Evaluation Matrix', phase: 'THE ENGINE', icon: AlertTriangle, color: 'amber' },
  7: { title: 'Pricing Strategy', phase: 'THE ENGINE', icon: Tag, color: 'amber' },
  8: { title: 'Business Model Canvas', phase: 'THE ENGINE', icon: LayoutGrid, color: 'amber' },
  9: { title: 'Exit-Oriented Design', phase: 'THE ENGINE', icon: LogOut, color: 'amber' },

  // Phase 3: THE IDENTITY (Stages 10-12)
  10: { title: 'Strategic Naming', phase: 'THE IDENTITY', icon: Palette, color: 'purple' },
  11: { title: 'Go-to-Market Strategy', phase: 'THE IDENTITY', icon: Megaphone, color: 'purple' },
  12: { title: 'Sales & Success Logic', phase: 'THE IDENTITY', icon: Users2, color: 'purple' },

  // Phase 4: THE BLUEPRINT (Stages 13-16)
  13: { title: 'Tech Stack Interrogation', phase: 'THE BLUEPRINT', icon: Cpu, color: 'green' },
  14: { title: 'Data Model & Architecture', phase: 'THE BLUEPRINT', icon: Database, color: 'green' },
  15: { title: 'Epic & User Story Breakdown', phase: 'THE BLUEPRINT', icon: FileCode, color: 'green' },
  16: { title: 'Spec-Driven Schema Generation', phase: 'THE BLUEPRINT', icon: Code, color: 'green' },

  // Phase 5: THE BUILD LOOP (Stages 17-20)
  17: { title: 'Environment & Agent Config', phase: 'THE BUILD LOOP', icon: Settings, color: 'orange' },
  18: { title: 'MVP Development Loop', phase: 'THE BUILD LOOP', icon: Hammer, color: 'orange' },
  19: { title: 'Integration & API Layer', phase: 'THE BUILD LOOP', icon: Plug, color: 'orange' },
  20: { title: 'Security & Performance', phase: 'THE BUILD LOOP', icon: Shield, color: 'orange' },

  // Phase 6: LAUNCH & LEARN (Stages 21-25)
  21: { title: 'QA & UAT', phase: 'LAUNCH & LEARN', icon: TestTube, color: 'red' },
  22: { title: 'Deployment & Infrastructure', phase: 'LAUNCH & LEARN', icon: Cloud, color: 'red' },
  23: { title: 'Production Launch', phase: 'LAUNCH & LEARN', icon: Rocket, color: 'red' },
  24: { title: 'Analytics & Feedback', phase: 'LAUNCH & LEARN', icon: BarChart, color: 'red' },
  25: { title: 'Optimization & Scale', phase: 'LAUNCH & LEARN', icon: TrendingUp, color: 'red' }
};

// Phase color mapping
const PHASE_COLORS = {
  'THE TRUTH': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'THE ENGINE': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'THE IDENTITY': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'THE BLUEPRINT': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'THE BUILD LOOP': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'LAUNCH & LEARN': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
};

/**
 * Generic Stage View Component
 * Used for stages 1-6 (Genesis phase - already has UI in VenturesManager)
 */
function GenericStageView({ venture, stage, stageConfig, artifacts }) {
  const Icon = stageConfig.icon;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      {/* Stage Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`p-3 rounded-lg bg-${stageConfig.color}-100 dark:bg-${stageConfig.color}-900/30`}>
          <Icon className={`w-8 h-8 text-${stageConfig.color}-600 dark:text-${stageConfig.color}-400`} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Stage {stage}: {stageConfig.title}
          </h2>
          <span className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${PHASE_COLORS[stageConfig.phase]}`}>
            {stageConfig.phase}
          </span>
        </div>
      </div>

      {/* Venture Context */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Venture</h3>
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {venture?.name || 'Unknown Venture'}
        </p>
        {venture?.problem_statement && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {venture.problem_statement}
          </p>
        )}
      </div>

      {/* Artifacts Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
          Golden Nugget Artifacts
        </h3>
        {artifacts && artifacts.length > 0 ? (
          <div className="grid gap-3">
            {artifacts.map((artifact, idx) => (
              <div
                key={idx}
                className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg
                  hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {artifact.type}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    Validated
                  </span>
                </div>
                {artifact.summary && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {artifact.summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No artifacts yet. Complete this stage to generate Golden Nuggets.
            </p>
          </div>
        )}
      </div>

      {/* Stage Status */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Stage {stage} of 25
        </div>
        <div className="flex gap-2">
          {stage > 1 && (
            <button className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600
              rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              Previous Stage
            </button>
          )}
          {stage < 25 && (
            <button className="px-3 py-1.5 text-sm bg-blue-600 text-white
              rounded-lg hover:bg-blue-700 transition-colors">
              Next Stage
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * StageRouter Main Component
 * Routes to the appropriate stage view based on venture stage
 */
export default function StageRouter({ venture, artifacts = [], onStageChange }) {
  const currentStage = venture?.stage || 1;
  const stageConfig = STAGE_CONFIG[currentStage];

  if (!stageConfig) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <p className="text-red-600 dark:text-red-400">
          Invalid stage: {currentStage}. Expected 1-25.
        </p>
      </div>
    );
  }

  // Stage transition handlers
  const handleStageComplete = () => {
    if (onStageChange && currentStage < 25) {
      onStageChange(currentStage + 1);
    }
  };

  const handlePrevious = () => {
    if (onStageChange && currentStage > 1) {
      onStageChange(currentStage - 1);
    }
  };

  // Props passed to all stage components
  const stageProps = {
    venture,
    artifacts,
    onStageComplete: handleStageComplete,
    onPrevious: handlePrevious
  };

  // Route to stage-specific components
  switch (currentStage) {
    // Block A: Stages 7-11 (GTM & Persona Fit)
    case 7:
      return <PricingStrategy {...stageProps} />;
    case 8:
      return <BusinessModelCanvas {...stageProps} />;
    case 9:
      return <ExitOrientedDesign {...stageProps} />;
    case 10:
      return <StrategicNaming {...stageProps} />;
    case 11:
      return <GoToMarketStrategy {...stageProps} />;

    // Block B: Stages 12-16 (Sales & Operational Flow)
    case 12:
      return <SalesSuccessLogic {...stageProps} />;
    case 13:
      return <TechStackInterrogation {...stageProps} />;
    case 14:
      return <DataModelArchitecture {...stageProps} />;
    case 15:
      return <EpicUserStoryBreakdown {...stageProps} />;
    case 16:
      return <SpecDrivenSchemaGen {...stageProps} />;

    // Block C: Stages 17-21 (MVP Feedback Loop)
    case 17:
      return <EnvironmentAgentConfig {...stageProps} />;
    case 18:
      return <MVPDevelopmentLoop {...stageProps} />;
    case 19:
      return <IntegrationAPILayer {...stageProps} />;
    case 20:
      return <SecurityPerformance {...stageProps} />;
    case 21:
      return <QAandUAT {...stageProps} />;

    // Block D: Stages 22-25 (Infrastructure & Exit)
    case 22:
      return <DeploymentInfrastructure {...stageProps} />;
    case 23:
      return <ProductionLaunch {...stageProps} />;
    case 24:
      return <AnalyticsFeedback {...stageProps} />;
    case 25:
      return <OptimizationScale {...stageProps} />;

    // Stages 1-6: Genesis Phase (use generic view, already handled by VenturesManager)
    default:
      return (
        <GenericStageView
          venture={venture}
          stage={currentStage}
          stageConfig={stageConfig}
          artifacts={artifacts}
        />
      );
  }
}

// Export stage config for use by other components
export { STAGE_CONFIG, PHASE_COLORS };
