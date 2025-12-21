/**
 * PricingStrategy Component - Stage 7
 * Pricing Strategy Development Interface
 *
 * SD: SD-IND-A-STAGES-7-11 (Block A: GTM & Persona Fit)
 * Phase: THE ENGINE
 *
 * Features:
 * - Unit economics dashboard (CAC, LTV, margins)
 * - Pricing tier configuration
 * - Sensitivity analysis visualization
 * - Golden Nugget artifact display
 * - Real data persistence via useStageArtifacts hook
 */

import React, { useState, useEffect } from 'react';
import {
  Tag,
  DollarSign,
  TrendingUp,
  Calculator,
  Users,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  Save,
  Loader2
} from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

// Default pricing tier template
const DEFAULT_TIERS = [
  { name: 'Starter', price: 0, features: ['Basic features', 'Community support'], highlighted: false },
  { name: 'Pro', price: 49, features: ['All Starter features', 'Advanced analytics', 'Email support'], highlighted: true },
  { name: 'Enterprise', price: 199, features: ['All Pro features', 'Dedicated support', 'Custom integrations'], highlighted: false }
];

const DEFAULT_ECONOMICS = {
  cac: 100,
  ltv: 500,
  grossMargin: 0.7,
  paybackMonths: 6,
  churnRate: 0.05
};

export default function PricingStrategy({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const [activeTab, setActiveTab] = useState('economics');

  // Load pricing data from artifacts
  const {
    data: pricingData,
    setData: setPricingData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(
    venture?.id,
    7,
    'pricing_model',
    { unitEconomics: DEFAULT_ECONOMICS, pricingTiers: DEFAULT_TIERS }
  );

  // Derived state from artifact data
  const unitEconomics = pricingData?.unitEconomics || DEFAULT_ECONOMICS;
  const pricingTiers = pricingData?.pricingTiers || DEFAULT_TIERS;

  const setUnitEconomics = (newEconomics) => {
    setPricingData(prev => ({
      ...prev,
      unitEconomics: typeof newEconomics === 'function'
        ? newEconomics(prev?.unitEconomics || DEFAULT_ECONOMICS)
        : newEconomics
    }));
  };

  const setPricingTiers = (newTiers) => {
    setPricingData(prev => ({
      ...prev,
      pricingTiers: typeof newTiers === 'function'
        ? newTiers(prev?.pricingTiers || DEFAULT_TIERS)
        : newTiers
    }));
  };

  // Save handler
  const handleSave = async () => {
    const success = await saveArtifact(pricingData, 'Pricing Strategy Model');
    if (success) {
      console.log('Pricing model saved successfully');
    }
  };

  // Complete stage handler - save before advancing
  const handleComplete = async () => {
    await saveArtifact(pricingData, 'Pricing Strategy Model');
    onStageComplete?.();
  };

  // Calculate derived metrics
  const ltvCacRatio = unitEconomics.ltv / unitEconomics.cac;
  const monthlyRecurringValue = unitEconomics.ltv / (1 / unitEconomics.churnRate);

  const getHealthStatus = (metric, value) => {
    const thresholds = {
      ltvCac: { good: 3, warning: 2 },
      grossMargin: { good: 0.6, warning: 0.4 },
      payback: { good: 12, warning: 18 }
    };

    if (metric === 'ltvCac') {
      if (value >= thresholds.ltvCac.good) return 'good';
      if (value >= thresholds.ltvCac.warning) return 'warning';
      return 'critical';
    }
    if (metric === 'grossMargin') {
      if (value >= thresholds.grossMargin.good) return 'good';
      if (value >= thresholds.grossMargin.warning) return 'warning';
      return 'critical';
    }
    if (metric === 'payback') {
      if (value <= thresholds.payback.good) return 'good';
      if (value <= thresholds.payback.warning) return 'warning';
      return 'critical';
    }
    return 'good';
  };

  const statusColors = {
    good: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
    warning: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30',
    critical: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading pricing data...</p>
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
            <Tag className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Stage 7: Pricing Strategy
            </h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              THE ENGINE
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['economics', 'tiers', 'sensitivity'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {tab === 'economics' && 'Unit Economics'}
              {tab === 'tiers' && 'Pricing Tiers'}
              {tab === 'sensitivity' && 'Sensitivity'}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'economics' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-lg ${statusColors[getHealthStatus('ltvCac', ltvCacRatio)]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">LTV:CAC Ratio</span>
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="text-2xl font-bold mt-1">{ltvCacRatio.toFixed(1)}:1</div>
                <div className="text-xs mt-1">Target: 3:1+</div>
              </div>

              <div className={`p-4 rounded-lg ${statusColors[getHealthStatus('grossMargin', unitEconomics.grossMargin)]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Gross Margin</span>
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="text-2xl font-bold mt-1">{(unitEconomics.grossMargin * 100).toFixed(0)}%</div>
                <div className="text-xs mt-1">Target: 60%+</div>
              </div>

              <div className={`p-4 rounded-lg ${statusColors[getHealthStatus('payback', unitEconomics.paybackMonths)]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Payback Period</span>
                  <Calculator className="w-5 h-5" />
                </div>
                <div className="text-2xl font-bold mt-1">{unitEconomics.paybackMonths} mo</div>
                <div className="text-xs mt-1">Target: &lt;12 months</div>
              </div>
            </div>

            {/* Input Fields */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  CAC ($)
                </label>
                <input
                  type="number"
                  value={unitEconomics.cac}
                  onChange={(e) => setUnitEconomics({ ...unitEconomics, cac: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  LTV ($)
                </label>
                <input
                  type="number"
                  value={unitEconomics.ltv}
                  onChange={(e) => setUnitEconomics({ ...unitEconomics, ltv: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Gross Margin (%)
                </label>
                <input
                  type="number"
                  value={unitEconomics.grossMargin * 100}
                  onChange={(e) => setUnitEconomics({ ...unitEconomics, grossMargin: Number(e.target.value) / 100 })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Churn Rate (%)
                </label>
                <input
                  type="number"
                  value={unitEconomics.churnRate * 100}
                  onChange={(e) => setUnitEconomics({ ...unitEconomics, churnRate: Number(e.target.value) / 100 })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tiers' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pricingTiers.map((tier, idx) => (
                <div
                  key={idx}
                  className={`relative p-6 rounded-lg border-2 ${
                    tier.highlighted
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {tier.highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-500 text-white text-xs font-medium rounded-full">
                      Most Popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {tier.name}
                  </h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      ${tier.price}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">/mo</span>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {tier.features.map((feature, fIdx) => (
                      <li key={fIdx} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Check className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sensitivity' && (
          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Price Sensitivity Analysis
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">-20% Price</div>
                  <div className="text-xl font-bold text-red-600 dark:text-red-400">+35% Volume</div>
                  <div className="text-sm text-gray-500">Net: +8% Revenue</div>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-blue-300">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current</div>
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">Baseline</div>
                  <div className="text-sm text-gray-500">100% Revenue</div>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">+20% Price</div>
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">-15% Volume</div>
                  <div className="text-sm text-gray-500">Net: +2% Revenue</div>
                </div>
              </div>
            </div>

            <div className="p-4 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-300">Recommendation</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    Based on your LTV:CAC ratio of {ltvCacRatio.toFixed(1)}:1, consider testing a 10-15% price increase
                    to improve margins while monitoring churn closely.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
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
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
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
