/**
 * MVPDevelopmentLoop Component - Stage 18
 * MVP Development Sprint Interface
 *
 * SD: SD-IND-C-STAGES-17-21 (Block C: MVP Feedback Loop)
 * Phase: THE BUILD LOOP
 */

import React, { useState } from 'react';
import { Hammer, Code, GitPullRequest, CheckCircle, Clock, AlertCircle, ChevronRight, ChevronLeft, Play, Pause, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const SPRINT_TASKS = [
  { id: 1, title: 'User authentication flow', status: 'done', type: 'feature', hours: 8 },
  { id: 2, title: 'Product listing page', status: 'done', type: 'feature', hours: 6 },
  { id: 3, title: 'Shopping cart', status: 'in_progress', type: 'feature', hours: 10 },
  { id: 4, title: 'Checkout flow', status: 'todo', type: 'feature', hours: 12 },
  { id: 5, title: 'Fix login redirect bug', status: 'todo', type: 'bug', hours: 2 }
];

const DEFAULT_MVP_DATA = { tasks: SPRINT_TASKS, sprintActive: true };

export default function MVPDevelopmentLoop({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: mvpData,
    setData: setMvpData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 18, 'mvp_codebase', DEFAULT_MVP_DATA);

  const [activeTab, setActiveTab] = useState('sprint');
  const [sprintActive, setSprintActive] = useState(true);

  const handleSave = async () => {
    await saveArtifact(mvpData || DEFAULT_MVP_DATA, 'MVP Codebase');
  };

  const handleComplete = async () => {
    await saveArtifact(mvpData || DEFAULT_MVP_DATA, 'MVP Codebase');
    onStageComplete?.();
  };

  const completedHours = SPRINT_TASKS.filter(t => t.status === 'done').reduce((sum, t) => sum + t.hours, 0);
  const totalHours = SPRINT_TASKS.reduce((sum, t) => sum + t.hours, 0);
  const progress = Math.round((completedHours / totalHours) * 100);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading MVP development...</p>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'done': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress': return <Clock className="w-5 h-5 text-orange-500 animate-pulse" />;
      default: return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Hammer className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 18: MVP Development Loop</h2>
              <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">THE BUILD LOOP</span>
            </div>
          </div>
          <button
            onClick={() => setSprintActive(!sprintActive)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              sprintActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {sprintActive ? <><Pause className="w-4 h-4" /> Sprint Active</> : <><Play className="w-4 h-4" /> Start Sprint</>}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sprint Progress</span>
          <span className="text-sm text-gray-500">{completedHours}h / {totalHours}h ({progress}%)</span>
        </div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['sprint', 'commits', 'prs'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}>
              {tab === 'prs' ? 'Pull Requests' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'sprint' && (
          <div className="space-y-3">
            {SPRINT_TASKS.map((task) => (
              <div key={task.id} className={`flex items-center gap-4 p-4 rounded-lg border ${
                task.status === 'in_progress' ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-700'
              }`}>
                {getStatusIcon(task.status)}
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{task.title}</div>
                  <div className="text-xs text-gray-500">{task.hours}h estimated</div>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${
                  task.type === 'bug' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {task.type}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'commits' && (
          <div className="space-y-3">
            {[
              { hash: 'a1b2c3d', message: 'feat: add user authentication', time: '2h ago' },
              { hash: 'e4f5g6h', message: 'feat: product listing page', time: '4h ago' },
              { hash: 'i7j8k9l', message: 'fix: login redirect issue', time: '1d ago' }
            ].map((commit, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <Code className="w-4 h-4 text-gray-400" />
                <span className="font-mono text-xs text-orange-600">{commit.hash}</span>
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{commit.message}</span>
                <span className="text-xs text-gray-500">{commit.time}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'prs' && (
          <div className="space-y-3">
            {[
              { number: 42, title: 'Add shopping cart feature', status: 'open', reviews: 1 },
              { number: 41, title: 'User authentication flow', status: 'merged', reviews: 2 }
            ].map((pr, idx) => (
              <div key={idx} className="flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <GitPullRequest className={`w-5 h-5 ${pr.status === 'merged' ? 'text-purple-500' : 'text-green-500'}`} />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">#{pr.number} {pr.title}</div>
                  <div className="text-xs text-gray-500">{pr.reviews} review(s)</div>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${
                  pr.status === 'merged' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                }`}>
                  {pr.status}
                </span>
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
        <button onClick={handleComplete} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
