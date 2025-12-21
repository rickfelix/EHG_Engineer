/**
 * TechStackInterrogation Component - Stage 13
 * Technology Stack Selection & Validation
 *
 * SD: SD-IND-B-STAGES-12-16 (Block B: Sales & Operational Flow)
 * Phase: THE BLUEPRINT
 */

import React, { useState } from 'react';
import { Cpu, Database, Cloud, Shield, Code, Server, ChevronRight, ChevronLeft, Check, X, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const TECH_CATEGORIES = {
  frontend: { label: 'Frontend', options: ['React', 'Vue', 'Angular', 'Svelte', 'Next.js'] },
  backend: { label: 'Backend', options: ['Node.js', 'Python', 'Go', 'Rust', 'Java'] },
  database: { label: 'Database', options: ['PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'Supabase'] },
  hosting: { label: 'Hosting', options: ['AWS', 'GCP', 'Azure', 'Vercel', 'Railway'] },
  auth: { label: 'Auth', options: ['Auth0', 'Supabase Auth', 'Clerk', 'Firebase Auth', 'Custom'] }
};

const DEFAULT_TECH_DATA = {
  selections: {
    frontend: 'React',
    backend: 'Node.js',
    database: 'PostgreSQL',
    hosting: 'Vercel',
    auth: 'Supabase Auth'
  }
};

export default function TechStackInterrogation({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: techData,
    setData: setTechData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 13, 'tech_decision_matrix', DEFAULT_TECH_DATA);

  const [activeTab, setActiveTab] = useState('stack');

  const currentData = techData || DEFAULT_TECH_DATA;
  const selections = currentData.selections;

  const setSelections = (value) => {
    setTechData(prev => ({ ...(prev || DEFAULT_TECH_DATA), selections: value }));
  };

  const handleSave = async () => {
    await saveArtifact(currentData, 'Tech Decision Matrix');
  };

  const handleComplete = async () => {
    await saveArtifact(currentData, 'Tech Decision Matrix');
    onStageComplete?.();
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading tech stack...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
            <Cpu className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 13: Tech Stack Interrogation</h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">THE BLUEPRINT</span>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['stack', 'evaluation', 'integrations'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'stack' && (
          <div className="space-y-6">
            {Object.entries(TECH_CATEGORIES).map(([key, cat]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{cat.label}</label>
                <div className="flex flex-wrap gap-2">
                  {cat.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelections({ ...selections, [key]: opt })}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        selections[key] === opt
                          ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'evaluation' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Stack Evaluation</h3>
            {[
              { label: 'Scalability', score: 9, status: 'pass' },
              { label: 'Developer Experience', score: 8, status: 'pass' },
              { label: 'Community Support', score: 9, status: 'pass' },
              { label: 'Cost Efficiency', score: 7, status: 'pass' },
              { label: 'Security', score: 8, status: 'pass' }
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  {item.status === 'pass' ? <Check className="w-5 h-5 text-green-500" /> : <X className="w-5 h-5 text-red-500" />}
                  <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${item.score * 10}%` }} />
                  </div>
                  <span className="text-sm text-gray-500">{item.score}/10</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Required Integrations</h3>
            {[
              { icon: Cloud, name: 'Payment Gateway', provider: 'Stripe' },
              { icon: Database, name: 'Analytics', provider: 'PostHog' },
              { icon: Shield, name: 'Error Tracking', provider: 'Sentry' },
              { icon: Server, name: 'Email', provider: 'Resend' }
            ].map((int, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <int.icon className="w-5 h-5 text-green-500" />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{int.name}</div>
                  <div className="text-sm text-gray-500">{int.provider}</div>
                </div>
                <Check className="w-5 h-5 text-green-500" />
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
          {lastSaved && <span className="text-xs text-gray-400">Last saved: {lastSaved.toLocaleTimeString()}</span>}
          <button onClick={handleSave} disabled={saving || loading} className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
        <button onClick={handleComplete} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
