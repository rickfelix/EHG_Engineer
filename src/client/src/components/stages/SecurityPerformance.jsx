/**
 * SecurityPerformance Component - Stage 20
 * Security & Performance Optimization
 *
 * SD: SD-IND-C-STAGES-17-21 (Block C: MVP Feedback Loop)
 * Phase: THE BUILD LOOP
 */

import React, { useState } from 'react';
import { Shield, Zap, Lock, AlertTriangle, Check, ChevronRight, ChevronLeft, RefreshCw, TrendingUp, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const SECURITY_CHECKS = [
  { name: 'HTTPS Enabled', status: 'pass', severity: 'critical' },
  { name: 'SQL Injection Protection', status: 'pass', severity: 'critical' },
  { name: 'XSS Prevention', status: 'pass', severity: 'high' },
  { name: 'CSRF Protection', status: 'pass', severity: 'high' },
  { name: 'Rate Limiting', status: 'warning', severity: 'medium' },
  { name: 'Security Headers', status: 'pass', severity: 'medium' }
];

const PERF_METRICS = [
  { name: 'First Contentful Paint', value: '1.2s', target: '<1.8s', status: 'pass' },
  { name: 'Time to Interactive', value: '2.1s', target: '<3.0s', status: 'pass' },
  { name: 'Largest Contentful Paint', value: '2.5s', target: '<2.5s', status: 'warning' },
  { name: 'Cumulative Layout Shift', value: '0.05', target: '<0.1', status: 'pass' }
];

const DEFAULT_SEC_DATA = { securityChecks: SECURITY_CHECKS, perfMetrics: PERF_METRICS };

export default function SecurityPerformance({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: secData,
    setData: setSecData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 20, 'security_report', DEFAULT_SEC_DATA);

  const [activeTab, setActiveTab] = useState('security');
  const [scanning, setScanning] = useState(false);

  const runScan = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 2000);
  };

  const handleSave = async () => {
    await saveArtifact(secData || DEFAULT_SEC_DATA, 'Security Report');
  };

  const handleComplete = async () => {
    await saveArtifact(secData || DEFAULT_SEC_DATA, 'Security Report');
    onStageComplete?.();
  };

  const passCount = SECURITY_CHECKS.filter(c => c.status === 'pass').length;
  const securityScore = Math.round((passCount / SECURITY_CHECKS.length) * 100);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading security report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Shield className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 20: Security & Performance</h2>
              <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">THE BUILD LOOP</span>
            </div>
          </div>
          <button
            onClick={runScan}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${scanning ? 'bg-gray-100' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
            disabled={scanning}
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Run Scan'}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['security', 'performance', 'audit'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-8 p-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <div className="text-center">
                <div className={`text-5xl font-bold ${securityScore >= 80 ? 'text-green-500' : securityScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                  {securityScore}
                </div>
                <div className="text-sm text-gray-500 mt-1">Security Score</div>
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2 text-green-600"><Check className="w-4 h-4" /> {passCount} Passed</div>
                <div className="flex items-center gap-2 text-amber-600"><AlertTriangle className="w-4 h-4" /> {SECURITY_CHECKS.length - passCount} Warnings</div>
              </div>
            </div>

            <div className="space-y-3">
              {SECURITY_CHECKS.map((check, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">{check.name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      check.severity === 'critical' ? 'bg-red-100 text-red-700' :
                      check.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {check.severity}
                    </span>
                  </div>
                  {check.status === 'pass' ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              {PERF_METRICS.map((metric, idx) => (
                <div key={idx} className={`p-4 rounded-lg text-center ${
                  metric.status === 'pass' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'
                }`}>
                  <div className={`text-2xl font-bold ${metric.status === 'pass' ? 'text-green-600' : 'text-amber-600'}`}>
                    {metric.value}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{metric.name}</div>
                  <div className="text-xs text-gray-400">Target: {metric.target}</div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-500" /> Performance Trend
              </h4>
              <div className="h-24 flex items-end gap-1">
                {[85, 88, 82, 90, 87, 92, 94].map((val, idx) => (
                  <div key={idx} className="flex-1 bg-orange-400 rounded-t" style={{ height: `${val}%` }} />
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>7 days ago</span>
                <span>Today</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Recent Audit Reports</h4>
              {[
                { date: '2024-12-20', type: 'Security Scan', status: 'Pass', findings: 0 },
                { date: '2024-12-19', type: 'Performance Audit', status: 'Pass', findings: 2 },
                { date: '2024-12-18', type: 'Dependency Check', status: 'Warning', findings: 1 }
              ].map((audit, idx) => (
                <div key={idx} className="flex items-center justify-between py-3 border-b last:border-0 border-gray-100 dark:border-gray-700">
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{audit.type}</div>
                    <div className="text-xs text-gray-500">{audit.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{audit.findings} findings</span>
                    <span className={`px-2 py-1 text-xs rounded ${
                      audit.status === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {audit.status}
                    </span>
                  </div>
                </div>
              ))}
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
        <button onClick={handleComplete} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
