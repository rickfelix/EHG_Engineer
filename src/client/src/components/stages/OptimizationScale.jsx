/**
 * OptimizationScale Component - Stage 25
 * Optimization & Scale for Exit
 *
 * SD: SD-IND-D-STAGES-22-25 (Block D: Infrastructure & Exit)
 * Phase: LAUNCH & LEARN (Final)
 */

import React, { useState } from 'react';
import { TrendingUp, Target, DollarSign, Users, Zap, ChevronRight, ChevronLeft, Award, ArrowUpRight, CheckCircle, LineChart, Scale, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const SCALE_METRICS = [
  { label: 'Monthly Revenue', current: '$125K', target: '$500K', progress: 25, color: 'bg-green-500' },
  { label: 'Active Users', current: '12.5K', target: '100K', progress: 12.5, color: 'bg-blue-500' },
  { label: 'Team Size', current: '8', target: '25', progress: 32, color: 'bg-purple-500' },
  { label: 'Market Share', current: '2%', target: '15%', progress: 13, color: 'bg-amber-500' }
];

const EXIT_SCENARIOS = [
  { type: 'Acquisition', probability: '45%', valuation: '$5-8M', timeline: '18-24 months', buyer: 'Strategic Acquirer' },
  { type: 'Series A', probability: '35%', valuation: '$12-15M', timeline: '12-18 months', buyer: 'VC Firm' },
  { type: 'Bootstrap', probability: '20%', valuation: 'N/A', timeline: 'Ongoing', buyer: 'Self-funded' }
];

const OPTIMIZATION_AREAS = [
  { area: 'Infrastructure', score: 85, items: ['Auto-scaling configured', 'CDN optimized', 'Database indexed'] },
  { area: 'Cost Efficiency', score: 72, items: ['Cloud spend optimized', 'Vendor contracts reviewed', 'Unused resources cleaned'] },
  { area: 'Team Efficiency', score: 90, items: ['Processes documented', 'Onboarding streamlined', 'Tools consolidated'] },
  { area: 'Product-Market Fit', score: 78, items: ['NPS > 50', 'Retention > 80%', 'Word-of-mouth active'] }
];

const ASSUMPTIONS_REALITY = [
  { assumption: 'Users will pay $99/mo for premium', reality: 'Avg revenue $72/user', status: 'partial' },
  { assumption: 'CAC will be under $50', reality: 'Actual CAC: $38', status: 'validated' },
  { assumption: '5% conversion rate', reality: 'Actual: 4.2%', status: 'partial' },
  { assumption: '20% monthly churn', reality: 'Actual: 8%', status: 'exceeded' }
];

const DEFAULT_SCALE_DATA = { scaleMetrics: SCALE_METRICS, exitScenarios: EXIT_SCENARIOS, optimizationAreas: OPTIMIZATION_AREAS, assumptionsReality: ASSUMPTIONS_REALITY };

export default function OptimizationScale({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: scaleData,
    setData: setScaleData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 25, 'assumptions_vs_reality_report', DEFAULT_SCALE_DATA);

  const [activeTab, setActiveTab] = useState('scale');

  const handleSave = async () => {
    await saveArtifact(scaleData || DEFAULT_SCALE_DATA, 'Assumptions vs Reality Report');
  };

  const handleComplete = async () => {
    await saveArtifact(scaleData || DEFAULT_SCALE_DATA, 'Assumptions vs Reality Report');
    onStageComplete?.();
  };

  const overallScore = Math.round(OPTIMIZATION_AREAS.reduce((sum, a) => sum + a.score, 0) / OPTIMIZATION_AREAS.length);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading optimization metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-gradient-to-br from-red-100 to-amber-100 dark:from-red-900/30 dark:to-amber-900/30">
              <Scale className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 25: Optimization & Scale</h2>
              <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-gradient-to-r from-red-100 to-amber-100 text-red-800 dark:from-red-900/30 dark:to-amber-900/30 dark:text-red-300">
                FINAL STAGE
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{overallScore}%</div>
              <div className="text-xs text-gray-500">Exit Readiness</div>
            </div>
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Award className="w-8 h-8 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['scale', 'exit', 'optimization', 'validation'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'scale' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              {SCALE_METRICS.map((metric, idx) => (
                <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-500">{metric.label}</span>
                    <ArrowUpRight className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="flex items-end gap-2 mb-3">
                    <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{metric.current}</span>
                    <span className="text-sm text-gray-400 mb-1">/ {metric.target}</span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${metric.color}`} style={{ width: `${metric.progress}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{metric.progress}% of target</div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <LineChart className="w-4 h-4 text-red-500" /> Growth Trajectory
              </h4>
              <div className="h-32 flex items-end gap-1">
                {[15, 22, 28, 35, 42, 48, 55, 65, 72, 80, 88, 100].map((val, idx) => (
                  <div key={idx} className="flex-1 bg-gradient-to-t from-red-500 to-amber-400 rounded-t" style={{ height: `${val}%` }} />
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>Jan</span>
                <span>Mar</span>
                <span>Jun</span>
                <span>Sep</span>
                <span>Dec</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'exit' && (
          <div className="space-y-4">
            {EXIT_SCENARIOS.map((scenario, idx) => (
              <div key={idx} className={`p-4 rounded-lg border-2 ${
                idx === 0 ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <DollarSign className={`w-5 h-5 ${idx === 0 ? 'text-green-600' : 'text-gray-400'}`} />
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">{scenario.type}</h4>
                    {idx === 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Most Likely</span>}
                  </div>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{scenario.valuation}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Probability</span>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{scenario.probability}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Timeline</span>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{scenario.timeline}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Likely Buyer</span>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{scenario.buyer}</div>
                  </div>
                </div>
              </div>
            ))}

            <div className="p-4 border border-amber-200 bg-amber-50 dark:bg-amber-900/20 rounded-lg mt-6">
              <div className="flex items-center gap-2 text-amber-700">
                <Target className="w-4 h-4" />
                <span className="text-sm font-medium">Exit preparation in progress - continue optimizing for maximum valuation</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'optimization' && (
          <div className="space-y-4">
            {OPTIMIZATION_AREAS.map((area, idx) => (
              <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{area.area}</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full ${area.score >= 80 ? 'bg-green-500' : area.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${area.score}%` }} />
                    </div>
                    <span className={`text-sm font-medium ${area.score >= 80 ? 'text-green-600' : area.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {area.score}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {area.items.map((item, itemIdx) => (
                    <span key={itemIdx} className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'validation' && (
          <div className="space-y-6">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">Assumptions vs Reality</h4>
            <div className="space-y-3">
              {ASSUMPTIONS_REALITY.map((item, idx) => (
                <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                  item.status === 'validated' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' :
                  item.status === 'exceeded' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' :
                  'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-gray-500">Assumption:</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{item.assumption}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      item.status === 'validated' ? 'bg-green-100 text-green-700' :
                      item.status === 'exceeded' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Reality:</span> {item.reality}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3">
                <Award className="w-8 h-8 text-green-600" />
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Venture Journey Complete</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    You've validated your assumptions and are on track for a successful exit.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onPrevious} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <div className="flex items-center gap-3">
          {lastSaved && <span className="text-xs text-gray-400">Last saved: {lastSaved.toLocaleTimeString()}</span>}
          <button onClick={handleSave} disabled={saving || loading} className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
        <button onClick={handleComplete} disabled={saving || loading} className="flex items-center gap-2 px-6 py-2 text-sm bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 font-medium disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Award className="w-4 h-4" /> Complete Journey</>}
        </button>
      </div>
    </div>
  );
}
