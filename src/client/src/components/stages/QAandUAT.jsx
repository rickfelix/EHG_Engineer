/**
 * QAandUAT Component - Stage 21
 * Quality Assurance & User Acceptance Testing
 *
 * SD: SD-IND-C-STAGES-17-21 (Block C: MVP Feedback Loop)
 * Phase: LAUNCH & LEARN
 */

import React, { useState } from 'react';
import { TestTube, CheckCircle, XCircle, Clock, Play, ChevronRight, ChevronLeft, Users, FileCheck, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const TEST_SUITES = [
  { name: 'Unit Tests', passed: 142, failed: 0, total: 142, duration: '12s' },
  { name: 'Integration Tests', passed: 38, failed: 2, total: 40, duration: '45s' },
  { name: 'E2E Tests', passed: 24, failed: 1, total: 25, duration: '3m 20s' }
];

const UAT_SCENARIOS = [
  { id: 1, title: 'User can complete signup flow', status: 'passed', tester: 'Sarah C.' },
  { id: 2, title: 'User can browse and search products', status: 'passed', tester: 'Mike R.' },
  { id: 3, title: 'User can add items to cart', status: 'passed', tester: 'Sarah C.' },
  { id: 4, title: 'User can complete checkout', status: 'in_progress', tester: 'Mike R.' },
  { id: 5, title: 'User receives order confirmation email', status: 'pending', tester: 'Unassigned' }
];

const DEFAULT_UAT_DATA = { testSuites: TEST_SUITES, uatScenarios: UAT_SCENARIOS };

export default function QAandUAT({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: uatData,
    setData: setUatData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 21, 'test_coverage_report', DEFAULT_UAT_DATA);

  const [activeTab, setActiveTab] = useState('automated');
  const [runningTests, setRunningTests] = useState(false);

  const runTests = () => {
    setRunningTests(true);
    setTimeout(() => setRunningTests(false), 3000);
  };

  const handleSave = async () => {
    await saveArtifact(uatData || DEFAULT_UAT_DATA, 'Test Coverage Report');
  };

  const handleComplete = async () => {
    await saveArtifact(uatData || DEFAULT_UAT_DATA, 'Test Coverage Report');
    onStageComplete?.();
  };

  const totalPassed = TEST_SUITES.reduce((sum, s) => sum + s.passed, 0);
  const totalTests = TEST_SUITES.reduce((sum, s) => sum + s.total, 0);
  const coverage = Math.round((totalPassed / totalTests) * 100);

  const uatPassed = UAT_SCENARIOS.filter(s => s.status === 'passed').length;
  const uatProgress = Math.round((uatPassed / UAT_SCENARIOS.length) * 100);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading QA & UAT...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30">
              <TestTube className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 21: QA & UAT</h2>
              <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">LAUNCH & LEARN</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">{coverage}%</div>
              <div className="text-xs text-gray-500">Test Coverage</div>
            </div>
            <button
              onClick={runTests}
              disabled={runningTests}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${runningTests ? 'bg-gray-100' : 'bg-red-600 text-white hover:bg-red-700'}`}
            >
              <Play className={`w-4 h-4 ${runningTests ? 'animate-pulse' : ''}`} />
              {runningTests ? 'Running...' : 'Run All Tests'}
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['automated', 'uat', 'signoff'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500'}`}>
              {tab === 'uat' ? 'UAT' : tab === 'signoff' ? 'Sign-off' : 'Automated Tests'}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'automated' && (
          <div className="space-y-4">
            {TEST_SUITES.map((suite, idx) => (
              <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{suite.name}</div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500">{suite.duration}</span>
                    <span className="text-sm">
                      <span className="text-green-600 font-medium">{suite.passed}</span>
                      <span className="text-gray-400"> / </span>
                      <span className={suite.failed > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>{suite.total}</span>
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div className="bg-green-500" style={{ width: `${(suite.passed / suite.total) * 100}%` }} />
                    <div className="bg-red-500" style={{ width: `${(suite.failed / suite.total) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'uat' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">UAT Progress</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500" style={{ width: `${uatProgress}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{uatProgress}%</span>
              </div>
            </div>

            <div className="space-y-3">
              {UAT_SCENARIOS.map((scenario) => (
                <div key={scenario.id} className="flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  {scenario.status === 'passed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                  {scenario.status === 'in_progress' && <Clock className="w-5 h-5 text-amber-500 animate-pulse" />}
                  {scenario.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
                  <div className="flex-1">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{scenario.title}</div>
                    <div className="text-xs text-gray-500">Tester: {scenario.tester}</div>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded ${
                    scenario.status === 'passed' ? 'bg-green-100 text-green-700' :
                    scenario.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {scenario.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'signoff' && (
          <div className="space-y-6">
            <div className={`p-6 rounded-lg border-2 ${
              uatProgress === 100 ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex items-center gap-4">
                <FileCheck className={`w-12 h-12 ${uatProgress === 100 ? 'text-green-500' : 'text-gray-400'}`} />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">UAT Sign-off</h3>
                  <p className="text-sm text-gray-500">
                    {uatProgress === 100
                      ? 'All UAT scenarios passed. Ready for sign-off.'
                      : `Complete ${100 - uatProgress}% remaining UAT scenarios before sign-off.`}
                  </p>
                </div>
              </div>
              {uatProgress === 100 && (
                <button className="mt-4 w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                  Approve & Sign-off
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">Automated Tests</div>
                <div className="text-2xl font-bold text-green-600">{coverage}% Passing</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">UAT Scenarios</div>
                <div className="text-2xl font-bold text-green-600">{uatPassed}/{UAT_SCENARIOS.length} Complete</div>
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
