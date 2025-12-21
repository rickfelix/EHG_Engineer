/**
 * ExitOrientedDesign Component - Stage 9
 * Exit Strategy and Valuation Planning Interface
 *
 * SD: SD-IND-A-STAGES-7-11 (Block A: GTM & Persona Fit)
 * Phase: THE ENGINE
 *
 * Features:
 * - Exit scenario modeling (acquisition, IPO, etc.)
 * - Valuation multiple calculator
 * - Milestone timeline planning
 * - Golden Nugget artifact display
 */

import React, { useState } from 'react';
import {
  LogOut,
  TrendingUp,
  Building2,
  Globe,
  Users,
  DollarSign,
  Target,
  Calendar,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle,
  Save,
  Loader2
} from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

// Exit types configuration
const EXIT_TYPES = [
  {
    id: 'strategic_acquisition',
    title: 'Strategic Acquisition',
    icon: Building2,
    description: 'Sale to a larger company in your industry',
    typicalMultiple: '3-8x revenue',
    timeline: '3-7 years',
    pros: ['Higher valuations', 'Industry synergies', 'Faster process'],
    cons: ['Integration challenges', 'Culture clash', 'Limited buyers']
  },
  {
    id: 'private_equity',
    title: 'Private Equity',
    icon: DollarSign,
    description: 'Sale to a financial buyer or PE firm',
    typicalMultiple: '2-5x EBITDA',
    timeline: '5-10 years',
    pros: ['Management stays', 'Growth capital', 'Professionalization'],
    cons: ['Debt-heavy', 'Performance pressure', 'Secondary exit needed']
  },
  {
    id: 'ipo',
    title: 'IPO',
    icon: Globe,
    description: 'Initial Public Offering on stock exchange',
    typicalMultiple: '10-30x revenue',
    timeline: '7-10+ years',
    pros: ['Highest valuations', 'Liquidity', 'Brand prestige'],
    cons: ['Regulatory burden', 'Public scrutiny', 'Long timeline']
  },
  {
    id: 'acquihire',
    title: 'Acqui-hire',
    icon: Users,
    description: 'Acquisition primarily for team/talent',
    typicalMultiple: '$1-3M per engineer',
    timeline: '1-3 years',
    pros: ['Fast exit', 'Team lands softly', 'Minimal traction needed'],
    cons: ['Lower valuations', 'Product may die', 'Golden handcuffs']
  }
];

// Valuation benchmarks by stage
const VALUATION_BENCHMARKS = {
  pre_seed: { arr_multiple: 20, description: '$0-500K ARR' },
  seed: { arr_multiple: 15, description: '$500K-2M ARR' },
  series_a: { arr_multiple: 12, description: '$2M-10M ARR' },
  series_b: { arr_multiple: 10, description: '$10M-25M ARR' },
  growth: { arr_multiple: 8, description: '$25M+ ARR' }
};

const DEFAULT_EXIT_DATA = {
  selectedExit: 'strategic_acquisition',
  projections: {
    targetArr: 10000000,
    growthRate: 0.5,
    exitYear: 5,
    fundingStage: 'series_a'
  }
};

export default function ExitOrientedDesign({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: exitData,
    setData: setExitData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 9, 'exit_strategy', DEFAULT_EXIT_DATA);

  const currentData = exitData || DEFAULT_EXIT_DATA;
  const selectedExit = currentData.selectedExit;
  const projections = currentData.projections;

  const setSelectedExit = (value) => {
    setExitData(prev => ({ ...(prev || DEFAULT_EXIT_DATA), selectedExit: value }));
  };

  const setProjections = (value) => {
    setExitData(prev => ({ ...(prev || DEFAULT_EXIT_DATA), projections: value }));
  };

  // Save handler
  const handleSave = async () => {
    await saveArtifact(currentData, 'Exit Strategy');
  };

  // Complete stage handler
  const handleComplete = async () => {
    await saveArtifact(currentData, 'Exit Strategy');
    onStageComplete?.();
  };

  // Calculate projected valuation
  const arrMultiple = VALUATION_BENCHMARKS[projections.fundingStage]?.arr_multiple || 10;
  const projectedValuation = projections.targetArr * arrMultiple;
  const currentArrEstimate = projections.targetArr / Math.pow(1 + projections.growthRate, projections.exitYear);

  // Generate milestones
  const milestones = [
    { year: 1, label: 'Product-Market Fit', arr: currentArrEstimate * Math.pow(1 + projections.growthRate, 1), status: 'pending' },
    { year: 2, label: 'Scale Operations', arr: currentArrEstimate * Math.pow(1 + projections.growthRate, 2), status: 'pending' },
    { year: 3, label: 'Market Leadership', arr: currentArrEstimate * Math.pow(1 + projections.growthRate, 3), status: 'pending' },
    { year: projections.exitYear, label: 'Exit Ready', arr: projections.targetArr, status: 'pending' }
  ];

  const formatCurrency = (value) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading exit strategy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <LogOut className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Stage 9: Exit-Oriented Design
            </h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              THE ENGINE
            </span>
          </div>
        </div>
      </div>

      {/* Exit Type Selection */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Exit Strategy</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {EXIT_TYPES.map((exit) => {
            const Icon = exit.icon;
            const isSelected = selectedExit === exit.id;

            return (
              <button
                key={exit.id}
                onClick={() => setSelectedExit(exit.id)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-amber-600' : 'text-gray-400'}`} />
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{exit.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{exit.typicalMultiple}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Exit Details */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
        {EXIT_TYPES.filter(e => e.id === selectedExit).map((exit) => (
          <div key={exit.id} className="grid md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{exit.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">{exit.description}</p>
              <div className="mt-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Typical Timeline: </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{exit.timeline}</span>
              </div>
            </div>
            <div>
              <h5 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">Advantages</h5>
              <ul className="space-y-1">
                {exit.pros.map((pro, idx) => (
                  <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Considerations</h5>
              <ul className="space-y-1">
                {exit.cons.map((con, idx) => (
                  <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* Valuation Calculator */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Valuation Projector</h3>
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Target ARR at Exit</label>
            <select
              value={projections.targetArr}
              onChange={(e) => setProjections({ ...projections, targetArr: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600"
            >
              <option value={1000000}>$1M</option>
              <option value={5000000}>$5M</option>
              <option value={10000000}>$10M</option>
              <option value={25000000}>$25M</option>
              <option value={50000000}>$50M</option>
              <option value={100000000}>$100M</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Annual Growth Rate</label>
            <select
              value={projections.growthRate}
              onChange={(e) => setProjections({ ...projections, growthRate: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600"
            >
              <option value={0.25}>25%</option>
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.5}>150%</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Exit Timeline</label>
            <select
              value={projections.exitYear}
              onChange={(e) => setProjections({ ...projections, exitYear: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600"
            >
              <option value={3}>3 years</option>
              <option value={5}>5 years</option>
              <option value={7}>7 years</option>
              <option value={10}>10 years</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Funding Stage at Exit</label>
            <select
              value={projections.fundingStage}
              onChange={(e) => setProjections({ ...projections, fundingStage: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600"
            >
              {Object.entries(VALUATION_BENCHMARKS).map(([key, val]) => (
                <option key={key} value={key}>{key.replace(/_/g, ' ').toUpperCase()} ({val.arr_multiple}x)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Projected Valuation */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg p-6 text-white">
          <div className="text-sm opacity-80 mb-1">Projected Exit Valuation</div>
          <div className="text-4xl font-bold">{formatCurrency(projectedValuation)}</div>
          <div className="text-sm opacity-80 mt-2">
            Based on {formatCurrency(projections.targetArr)} ARR × {arrMultiple}x multiple
          </div>
        </div>
      </div>

      {/* Milestone Timeline */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Exit Milestone Timeline</h3>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-6">
            {milestones.map((milestone, idx) => (
              <div key={idx} className="relative flex items-start gap-4 pl-10">
                <div className={`absolute left-2 w-4 h-4 rounded-full border-2 ${
                  milestone.status === 'completed'
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white dark:bg-gray-800 border-amber-500'
                }`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Year {milestone.year}: {milestone.label}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {formatCurrency(milestone.arr)} ARR
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
            Golden Nugget Artifacts
          </h3>
          <div className="grid gap-2">
            {artifacts.map((artifact, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="font-medium text-gray-900 dark:text-gray-100">{artifact.type}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  Validated
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onPrevious}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous Stage
        </button>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-gray-400">
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
        <button
          onClick={handleComplete}
          disabled={saving || loading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Complete & Continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
