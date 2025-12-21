/**
 * SalesSuccessLogic Component - Stage 12
 * Sales Process & Customer Success Framework
 *
 * SD: SD-IND-B-STAGES-12-16 (Block B: Sales & Operational Flow)
 * Phase: THE IDENTITY
 */

import React, { useState } from 'react';
import { Users2, Users, TrendingUp, CheckCircle, ChevronRight, ChevronLeft, Target, Phone, Mail, Calendar, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const SALES_STAGES = [
  { id: 'prospecting', name: 'Prospecting', conversion: 30 },
  { id: 'qualification', name: 'Qualification', conversion: 50 },
  { id: 'discovery', name: 'Discovery', conversion: 60 },
  { id: 'proposal', name: 'Proposal', conversion: 70 },
  { id: 'negotiation', name: 'Negotiation', conversion: 80 },
  { id: 'closed', name: 'Closed Won', conversion: 100 }
];

const DEFAULT_SALES_DATA = {
  dealData: { avgDealSize: 5000, salesCycle: 30, targetDeals: 20 }
};

export default function SalesSuccessLogic({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: salesData,
    setData: setSalesData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 12, 'sales_playbook', DEFAULT_SALES_DATA);

  const [activeTab, setActiveTab] = useState('funnel');

  const currentData = salesData || DEFAULT_SALES_DATA;
  const dealData = currentData.dealData;

  const setDealData = (value) => {
    setSalesData(prev => ({ ...(prev || DEFAULT_SALES_DATA), dealData: value }));
  };

  // Save handler
  const handleSave = async () => {
    await saveArtifact(currentData, 'Sales Playbook');
  };

  // Complete stage handler
  const handleComplete = async () => {
    await saveArtifact(currentData, 'Sales Playbook');
    onStageComplete?.();
  };

  const projectedRevenue = dealData.avgDealSize * dealData.targetDeals;

  // Loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading sales playbook...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Users2 className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 12: Sales & Success Logic</h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">THE IDENTITY</span>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['funnel', 'playbook', 'success'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'funnel' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">${dealData.avgDealSize.toLocaleString()}</div>
                <div className="text-xs text-gray-500">Avg Deal Size</div>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">{dealData.salesCycle} days</div>
                <div className="text-xs text-gray-500">Sales Cycle</div>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">${projectedRevenue.toLocaleString()}</div>
                <div className="text-xs text-gray-500">Monthly Target</div>
              </div>
            </div>
            <div className="space-y-3">
              {SALES_STAGES.map((stage, idx) => (
                <div key={stage.id} className="flex items-center gap-4">
                  <div className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">{stage.name}</div>
                  <div className="flex-1 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                    <div className="h-full bg-purple-500" style={{ width: `${stage.conversion}%` }} />
                  </div>
                  <div className="w-16 text-sm text-gray-500">{stage.conversion}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'playbook' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Sales Playbook</h3>
            {[
              { icon: Phone, title: 'Discovery Call', duration: '30 min', goal: 'Understand pain points' },
              { icon: Target, title: 'Demo', duration: '45 min', goal: 'Show solution fit' },
              { icon: Mail, title: 'Proposal', duration: 'Async', goal: 'Present pricing' },
              { icon: Calendar, title: 'Negotiation', duration: 'Variable', goal: 'Close deal' }
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <item.icon className="w-5 h-5 text-purple-500" />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{item.title}</div>
                  <div className="text-sm text-gray-500">{item.goal}</div>
                </div>
                <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{item.duration}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'success' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Customer Success Framework</h3>
            {['Onboarding (Days 1-7)', 'Activation (Days 8-30)', 'Engagement (Ongoing)', 'Expansion (90+ days)'].map((phase, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-gray-700 dark:text-gray-300">{phase}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onPrevious} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronLeft className="w-4 h-4" /> Previous
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
          className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Continue <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
