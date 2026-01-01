#!/usr/bin/env node
/**
 * Generate V2 Stage Shell Components
 *
 * Creates 25 stage shell files in /src/components/stages/v2/
 * Each shell uses StageShellTemplate and imports from SSOT.
 *
 * Usage: node scripts/generate-v2-stage-shells.js
 */

import fs from 'fs';
import path from 'path';

// Stage data from venture-workflow.ts SSOT
const VENTURE_STAGES = [
  { stageNumber: 1, stageName: 'Draft Idea', stageKey: 'draft-idea' },
  { stageNumber: 2, stageName: 'AI Review', stageKey: 'ai-review' },
  { stageNumber: 3, stageName: 'Comprehensive Validation', stageKey: 'comprehensive-validation' },
  { stageNumber: 4, stageName: 'Competitive Intelligence', stageKey: 'competitive-intelligence' },
  { stageNumber: 5, stageName: 'Profitability Forecasting', stageKey: 'profitability-forecasting' },
  { stageNumber: 6, stageName: 'Risk Evaluation', stageKey: 'risk-evaluation' },
  { stageNumber: 7, stageName: 'Comprehensive Planning', stageKey: 'comprehensive-planning' },
  { stageNumber: 8, stageName: 'Problem Decomposition', stageKey: 'problem-decomposition' },
  { stageNumber: 9, stageName: 'Gap Analysis', stageKey: 'gap-analysis' },
  { stageNumber: 10, stageName: 'Technical Review', stageKey: 'technical-review' },
  { stageNumber: 11, stageName: 'MVP Development', stageKey: 'mvp-development' },
  { stageNumber: 12, stageName: 'Technical Implementation', stageKey: 'technical-implementation' },
  { stageNumber: 13, stageName: 'Integration Testing', stageKey: 'integration-testing' },
  { stageNumber: 14, stageName: 'Quality Assurance', stageKey: 'quality-assurance' },
  { stageNumber: 15, stageName: 'Deployment Preparation', stageKey: 'deployment-preparation' },
  { stageNumber: 16, stageName: 'AI CEO Agent', stageKey: 'ai-ceo-agent' },
  { stageNumber: 17, stageName: 'GTM Strategy', stageKey: 'gtm-strategy' },
  { stageNumber: 18, stageName: 'Documentation Sync', stageKey: 'documentation-sync' },
  { stageNumber: 19, stageName: 'Integration Verification', stageKey: 'integration-verification' },
  { stageNumber: 20, stageName: 'Context Loading', stageKey: 'context-loading' },
  { stageNumber: 21, stageName: 'Launch Preparation', stageKey: 'launch-preparation' },
  { stageNumber: 22, stageName: 'Go-To-Market Execution', stageKey: 'go-to-market-execution' },
  { stageNumber: 23, stageName: 'Continuous Feedback Loops', stageKey: 'continuous-feedback-loops' },
  { stageNumber: 24, stageName: 'Growth Metrics Optimization', stageKey: 'growth-metrics-optimization' },
  { stageNumber: 25, stageName: 'Scale Planning', stageKey: 'scale-planning' },
];

/**
 * Convert stage name to PascalCase component name
 */
function toPascalCase(name) {
  return name
    .split(/[\s-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Pad stage number with leading zero
 */
function padStageNumber(num) {
  return num.toString().padStart(2, '0');
}

/**
 * Generate shell component content
 */
function generateShellContent(stage) {
  const paddedNum = padStageNumber(stage.stageNumber);
  const componentName = `Stage${paddedNum}${toPascalCase(stage.stageName)}`;

  return `/**
 * ${componentName} - V2 Stage Shell
 *
 * Stage ${stage.stageNumber}: ${stage.stageName}
 * This is a shell component that will be implemented in P3/P4.
 *
 * @see /src/config/venture-workflow.ts for stage metadata
 */

import { getStageByNumber } from '@/config/venture-workflow';
import { StageShellTemplate } from './StageShellTemplate';

export interface ${componentName}Props {
  ventureId?: string;
}

export function ${componentName}({ ventureId }: ${componentName}Props) {
  const stage = getStageByNumber(${stage.stageNumber});

  if (!stage) {
    return <div>Stage ${stage.stageNumber} not found in SSOT</div>;
  }

  return (
    <StageShellTemplate stage={stage}>
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-lg font-medium">${stage.stageName}</p>
        <p className="mt-2">Implementation pending (P3/P4)</p>
        {ventureId && (
          <p className="mt-1 text-sm">Venture: {ventureId}</p>
        )}
      </div>
    </StageShellTemplate>
  );
}

export default ${componentName};
`;
}

/**
 * Main execution
 */
async function main() {
  const outputDir = '/mnt/c/_EHG/EHG/src/components/stages/v2';

  console.log('\\n🔧 Generating V2 Stage Shell Components');
  console.log('='.repeat(60));
  console.log(`   Output: ${outputDir}`);
  console.log(`   Stages: ${VENTURE_STAGES.length}`);
  console.log('');

  let created = 0;
  let skipped = 0;

  for (const stage of VENTURE_STAGES) {
    const paddedNum = padStageNumber(stage.stageNumber);
    const componentName = `Stage${paddedNum}${toPascalCase(stage.stageName)}`;
    const fileName = `${componentName}.tsx`;
    const filePath = path.join(outputDir, fileName);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      console.log(`   ⚠️  ${fileName} already exists - skipping`);
      skipped++;
      continue;
    }

    const content = generateShellContent(stage);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`   ✅ Created: ${fileName}`);
    created++;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${VENTURE_STAGES.length}`);
  console.log('');
}

main().catch(console.error);
