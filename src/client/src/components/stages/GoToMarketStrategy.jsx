/**
 * GoToMarketStrategy Component - Stage 11
 * Go-to-Market Strategy Development Interface
 *
 * SD: SD-IND-A-STAGES-7-11 (Block A: GTM & Persona Fit)
 * Phase: THE IDENTITY
 *
 * Features:
 * - ICP (Ideal Customer Profile) definition
 * - Channel mix configuration
 * - Launch timeline planning
 * - Campaign framework setup
 * - Golden Nugget artifact display
 */

import React, { useState } from 'react';
import {
  Megaphone,
  Users,
  Target,
  TrendingUp,
  Calendar,
  DollarSign,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  Plus,
  Check,
  AlertCircle,
  Save,
  Loader2
} from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

// Channel definitions
const CHANNELS = {
  organic: [
    { id: 'seo', name: 'SEO / Organic Search', cost: 'Low', time: 'Long', scalability: 'High' },
    { id: 'content', name: 'Content Marketing', cost: 'Medium', time: 'Medium', scalability: 'High' },
    { id: 'social', name: 'Organic Social', cost: 'Low', time: 'Medium', scalability: 'Medium' },
    { id: 'community', name: 'Community Building', cost: 'Medium', time: 'Long', scalability: 'Medium' },
  ],
  paid: [
    { id: 'paid_search', name: 'Paid Search (Google/Bing)', cost: 'High', time: 'Short', scalability: 'High' },
    { id: 'paid_social', name: 'Paid Social (Meta/LinkedIn)', cost: 'Medium', time: 'Short', scalability: 'High' },
    { id: 'display', name: 'Display Advertising', cost: 'Medium', time: 'Short', scalability: 'Medium' },
  ],
  outbound: [
    { id: 'cold_email', name: 'Cold Email', cost: 'Low', time: 'Short', scalability: 'Medium' },
    { id: 'cold_call', name: 'Cold Calling', cost: 'High', time: 'Short', scalability: 'Low' },
    { id: 'abm', name: 'Account-Based Marketing', cost: 'High', time: 'Medium', scalability: 'Low' },
  ],
  partnerships: [
    { id: 'affiliates', name: 'Affiliate Program', cost: 'Medium', time: 'Medium', scalability: 'High' },
    { id: 'integrations', name: 'Integration Partners', cost: 'Medium', time: 'Long', scalability: 'High' },
    { id: 'resellers', name: 'Reseller Network', cost: 'High', time: 'Long', scalability: 'High' },
  ]
};

// Launch phases
const LAUNCH_PHASES = [
  { id: 'pre_launch', name: 'Pre-Launch', duration: '4-8 weeks', activities: ['Build waitlist', 'Create content', 'Seed community'] },
  { id: 'soft_launch', name: 'Soft Launch', duration: '2-4 weeks', activities: ['Beta users', 'Collect feedback', 'Iterate'] },
  { id: 'public_launch', name: 'Public Launch', duration: '1 week', activities: ['Press/PR', 'Product Hunt', 'Social push'] },
  { id: 'growth', name: 'Growth Phase', duration: 'Ongoing', activities: ['Scale channels', 'Optimize CAC', 'Expand reach'] }
];

const DEFAULT_GTM_DATA = {
  activeTab: 'icp',
  selectedChannels: ['content', 'seo', 'paid_social'],
  icpData: {
    companySize: 'mid-market',
    industry: '',
    geography: 'North America',
    jobTitles: ['Founder/CEO', 'VP Engineering', 'Product Manager'],
    painPoints: ['Manual processes', 'Lack of visibility', 'Scaling challenges'],
    budget: '$1K-$10K/month',
    buyingTriggers: ['New funding', 'Team growth', 'Compliance requirements']
  },
  budgetAllocation: {
    organic: 30,
    paid: 40,
    outbound: 15,
    partnerships: 15
  }
};

export default function GoToMarketStrategy({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: gtmData,
    setData: setGtmData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 11, 'gtm_plan', DEFAULT_GTM_DATA);

  const [activeTab, setActiveTab] = useState('icp');

  const currentData = gtmData || DEFAULT_GTM_DATA;
  const selectedChannels = currentData.selectedChannels;
  const icpData = currentData.icpData;
  const budgetAllocation = currentData.budgetAllocation;

  const setSelectedChannels = (value) => {
    setGtmData(prev => ({ ...(prev || DEFAULT_GTM_DATA), selectedChannels: value }));
  };

  const setIcpData = (value) => {
    setGtmData(prev => ({ ...(prev || DEFAULT_GTM_DATA), icpData: value }));
  };

  const setBudgetAllocation = (value) => {
    setGtmData(prev => ({ ...(prev || DEFAULT_GTM_DATA), budgetAllocation: value }));
  };

  // Save handler
  const handleSave = async () => {
    await saveArtifact(currentData, 'Go-to-Market Plan');
  };

  // Complete stage handler
  const handleComplete = async () => {
    await saveArtifact(currentData, 'Go-to-Market Plan');
    onStageComplete?.();
  };

  const toggleChannel = (channelId) => {
    if (selectedChannels.includes(channelId)) {
      setSelectedChannels(selectedChannels.filter(c => c !== channelId));
    } else {
      setSelectedChannels([...selectedChannels, channelId]);
    }
  };

  const getChannelsByCategory = (category) => {
    return CHANNELS[category] || [];
  };

  const isChannelSelected = (channelId) => selectedChannels.includes(channelId);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading go-to-market strategy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Megaphone className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Stage 11: Go-to-Market Strategy
            </h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
              THE IDENTITY
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['icp', 'channels', 'launch', 'metrics'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              {tab === 'icp' && 'Target Customer'}
              {tab === 'channels' && 'Channel Mix'}
              {tab === 'launch' && 'Launch Plan'}
              {tab === 'metrics' && 'Success Metrics'}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'icp' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Company Profile */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Company Profile</h3>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Company Size</label>
                  <select
                    value={icpData.companySize}
                    onChange={(e) => setIcpData({ ...icpData, companySize: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="startup">Startup (1-10 employees)</option>
                    <option value="smb">SMB (11-100 employees)</option>
                    <option value="mid-market">Mid-Market (101-1000)</option>
                    <option value="enterprise">Enterprise (1000+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Industry</label>
                  <input
                    type="text"
                    value={icpData.industry}
                    onChange={(e) => setIcpData({ ...icpData, industry: e.target.value })}
                    placeholder="e.g., SaaS, Fintech, Healthcare"
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Geography</label>
                  <select
                    value={icpData.geography}
                    onChange={(e) => setIcpData({ ...icpData, geography: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="North America">North America</option>
                    <option value="Europe">Europe</option>
                    <option value="APAC">APAC</option>
                    <option value="Global">Global</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Budget Range</label>
                  <select
                    value={icpData.budget}
                    onChange={(e) => setIcpData({ ...icpData, budget: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="$0-$500/month">$0-$500/month</option>
                    <option value="$500-$1K/month">$500-$1K/month</option>
                    <option value="$1K-$10K/month">$1K-$10K/month</option>
                    <option value="$10K+/month">$10K+/month</option>
                  </select>
                </div>
              </div>

              {/* Buyer Profile */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Buyer Profile</h3>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Target Job Titles</label>
                  <div className="flex flex-wrap gap-2">
                    {icpData.jobTitles.map((title, idx) => (
                      <span key={idx} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                        {title}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Pain Points</label>
                  <div className="flex flex-wrap gap-2">
                    {icpData.painPoints.map((pain, idx) => (
                      <span key={idx} className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs">
                        {pain}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Buying Triggers</label>
                  <div className="flex flex-wrap gap-2">
                    {icpData.buyingTriggers.map((trigger, idx) => (
                      <span key={idx} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                        {trigger}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'channels' && (
          <div className="space-y-6">
            {/* Budget Allocation */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Budget Allocation</h3>
              <div className="grid grid-cols-4 gap-4">
                {Object.entries(budgetAllocation).map(([category, pct]) => (
                  <div key={category} className="text-center">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pct}%</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{category}</div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={pct}
                      onChange={(e) => setBudgetAllocation({ ...budgetAllocation, [category]: Number(e.target.value) })}
                      className="w-full mt-2"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Channel Selection */}
            {Object.entries(CHANNELS).map(([category, channels]) => (
              <div key={category}>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 capitalize">{category} Channels</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  {channels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => toggleChannel(channel.id)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        isChannelSelected(channel.id)
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{channel.name}</span>
                        {isChannelSelected(channel.id) && <Check className="w-4 h-4 text-purple-600" />}
                      </div>
                      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>Cost: {channel.cost}</span>
                        <span>Time: {channel.time}</span>
                        <span>Scale: {channel.scalability}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'launch' && (
          <div className="space-y-6">
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-purple-200 dark:bg-purple-800" />
              {LAUNCH_PHASES.map((phase, idx) => (
                <div key={phase.id} className="relative flex gap-6 pb-8 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold z-10">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">{phase.name}</h4>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{phase.duration}</span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {phase.activities.map((activity, aIdx) => (
                        <li key={aIdx} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          {activity}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Acquisition Metrics</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Customer Acquisition Cost (CAC)', target: '$100', icon: DollarSign },
                    { label: 'Cost Per Lead (CPL)', target: '$25', icon: Target },
                    { label: 'Lead-to-Customer Rate', target: '5%', icon: TrendingUp },
                    { label: 'Time to First Value', target: '< 7 days', icon: Calendar }
                  ].map((metric, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <metric.icon className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{metric.label}</span>
                      </div>
                      <span className="text-sm font-medium text-purple-600 dark:text-purple-400">{metric.target}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Growth Metrics</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Monthly Growth Rate', target: '15%', icon: TrendingUp },
                    { label: 'Marketing Qualified Leads', target: '500/mo', icon: Users },
                    { label: 'Organic Traffic Growth', target: '20%/mo', icon: BarChart3 },
                    { label: 'Brand Awareness', target: 'Track via surveys', icon: Megaphone }
                  ].map((metric, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <metric.icon className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{metric.label}</span>
                      </div>
                      <span className="text-sm font-medium text-purple-600 dark:text-purple-400">{metric.target}</span>
                    </div>
                  ))}
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
              Complete & Continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
