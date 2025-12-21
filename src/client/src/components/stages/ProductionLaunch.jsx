/**
 * ProductionLaunch Component - Stage 23
 * Production Launch Orchestration
 *
 * SD: SD-IND-D-STAGES-22-25 (Block D: Infrastructure & Exit)
 * Phase: LAUNCH & LEARN
 */

import React, { useState } from 'react';
import { Rocket, Check, AlertTriangle, Clock, ChevronRight, ChevronLeft, Play, Shield, Users, Zap, PartyPopper, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const LAUNCH_PHASES = [
  { name: 'Pre-Launch Checks', status: 'complete', items: 12, completed: 12 },
  { name: 'Soft Launch', status: 'complete', items: 5, completed: 5 },
  { name: 'Beta Release', status: 'in_progress', items: 8, completed: 5 },
  { name: 'Public Launch', status: 'pending', items: 6, completed: 0 }
];

const LAUNCH_CHECKLIST = [
  { category: 'Technical', items: [
    { name: 'Load testing completed', status: 'done' },
    { name: 'Security audit passed', status: 'done' },
    { name: 'Performance benchmarks met', status: 'done' },
    { name: 'Rollback tested', status: 'done' }
  ]},
  { category: 'Business', items: [
    { name: 'Legal review completed', status: 'done' },
    { name: 'Support documentation ready', status: 'in_progress' },
    { name: 'Marketing materials prepared', status: 'in_progress' },
    { name: 'Pricing page live', status: 'pending' }
  ]},
  { category: 'Operations', items: [
    { name: 'On-call schedule set', status: 'done' },
    { name: 'Escalation procedures defined', status: 'done' },
    { name: 'Monitoring dashboards ready', status: 'done' },
    { name: 'Incident response tested', status: 'pending' }
  ]}
];

const LAUNCH_METRICS = [
  { label: 'Target Users', value: '1,000', icon: Users },
  { label: 'Uptime SLA', value: '99.9%', icon: Zap },
  { label: 'Response Time', value: '<200ms', icon: Clock },
  { label: 'Security Score', value: 'A+', icon: Shield }
];

const DEFAULT_LAUNCH_DATA = { phases: LAUNCH_PHASES, checklist: LAUNCH_CHECKLIST, launched: false };

export default function ProductionLaunch({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: launchData,
    setData: setLaunchData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 23, 'launch_checklist', DEFAULT_LAUNCH_DATA);

  const [activeTab, setActiveTab] = useState('phases');
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);

  const triggerLaunch = () => {
    setLaunching(true);
    setTimeout(() => {
      setLaunching(false);
      setLaunched(true);
    }, 3000);
  };

  const handleSave = async () => {
    await saveArtifact(launchData || DEFAULT_LAUNCH_DATA, 'Launch Checklist');
  };

  const handleComplete = async () => {
    await saveArtifact(launchData || DEFAULT_LAUNCH_DATA, 'Launch Checklist');
    onStageComplete?.();
  };

  const totalItems = LAUNCH_PHASES.reduce((sum, p) => sum + p.items, 0);
  const completedItems = LAUNCH_PHASES.reduce((sum, p) => sum + p.completed, 0);
  const progress = Math.round((completedItems / totalItems) * 100);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading launch checklist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${launched ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              {launched ? (
                <PartyPopper className="w-8 h-8 text-green-600 dark:text-green-400" />
              ) : (
                <Rocket className="w-8 h-8 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 23: Production Launch</h2>
              <span className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${
                launched ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              }`}>
                {launched ? 'LAUNCHED!' : 'LAUNCH & LEARN'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">{progress}%</div>
              <div className="text-xs text-gray-500">Launch Ready</div>
            </div>
            <button
              onClick={triggerLaunch}
              disabled={launching || launched || progress < 100}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
                launched ? 'bg-green-500 text-white' :
                launching ? 'bg-gray-100' :
                progress < 100 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' :
                'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {launched ? (
                <><Check className="w-5 h-5" /> Launched!</>
              ) : launching ? (
                <><Rocket className="w-5 h-5 animate-bounce" /> Launching...</>
              ) : (
                <><Rocket className="w-5 h-5" /> Launch</>
              )}
            </button>
          </div>
        </div>
      </div>

      {launched && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
          <div className="flex items-center justify-center gap-3 text-green-700 dark:text-green-300">
            <PartyPopper className="w-5 h-5" />
            <span className="font-medium">Congratulations! Your product is now live!</span>
            <PartyPopper className="w-5 h-5" />
          </div>
        </div>
      )}

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['phases', 'checklist', 'targets'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'phases' && (
          <div className="space-y-6">
            <div className="relative">
              {LAUNCH_PHASES.map((phase, idx) => (
                <div key={idx} className="flex gap-4 pb-6 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      phase.status === 'complete' ? 'bg-green-500' :
                      phase.status === 'in_progress' ? 'bg-amber-500' :
                      'bg-gray-300'
                    }`}>
                      {phase.status === 'complete' ? (
                        <Check className="w-5 h-5 text-white" />
                      ) : phase.status === 'in_progress' ? (
                        <Clock className="w-5 h-5 text-white" />
                      ) : (
                        <span className="text-white font-medium">{idx + 1}</span>
                      )}
                    </div>
                    {idx < LAUNCH_PHASES.length - 1 && (
                      <div className={`w-0.5 flex-1 mt-2 ${
                        phase.status === 'complete' ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{phase.name}</h4>
                      <span className="text-sm text-gray-500">{phase.completed}/{phase.items}</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full ${
                        phase.status === 'complete' ? 'bg-green-500' :
                        phase.status === 'in_progress' ? 'bg-amber-500' :
                        'bg-gray-300'
                      }`} style={{ width: `${(phase.completed / phase.items) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'checklist' && (
          <div className="space-y-6">
            {LAUNCH_CHECKLIST.map((category, idx) => (
              <div key={idx}>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">{category.category}</h4>
                <div className="space-y-2">
                  {category.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                      {item.status === 'done' && <Check className="w-5 h-5 text-green-500" />}
                      {item.status === 'in_progress' && <Clock className="w-5 h-5 text-amber-500" />}
                      {item.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
                      <span className={`text-sm ${
                        item.status === 'done' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'
                      }`}>{item.name}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                        item.status === 'done' ? 'bg-green-100 text-green-700' :
                        item.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'targets' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-4 gap-4">
              {LAUNCH_METRICS.map((metric, idx) => (
                <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-center">
                  <metric.icon className="w-6 h-6 text-red-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{metric.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{metric.label}</div>
                </div>
              ))}
            </div>

            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Launch Day Timeline</h4>
              <div className="space-y-3">
                {[
                  { time: '06:00 AM', action: 'Final pre-launch checks', status: 'scheduled' },
                  { time: '08:00 AM', action: 'Enable production traffic', status: 'scheduled' },
                  { time: '09:00 AM', action: 'Public announcement', status: 'scheduled' },
                  { time: '12:00 PM', action: 'First metrics review', status: 'scheduled' },
                  { time: '06:00 PM', action: 'Day 1 retrospective', status: 'scheduled' }
                ].map((event, idx) => (
                  <div key={idx} className="flex items-center gap-4 py-2 border-b last:border-0 border-gray-100 dark:border-gray-700">
                    <span className="text-sm font-mono text-gray-500 w-20">{event.time}</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{event.action}</span>
                    <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{event.status}</span>
                  </div>
                ))}
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
        <button onClick={handleComplete} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
