import React, { useState, useEffect } from 'react';
import {
  Play,
  Square,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Server,
  TrendingUp,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Target
} from 'lucide-react';

export function TestingCampaignManager() {
  const [status, setStatus] = useState(null);
  const [appCounts, setAppCounts] = useState(null);
  const [health, setHealth] = useState(null);
  const [logs, setLogs] = useState({ progress: [], errors: [], alerts: [] });
  const [selectedApp, setSelectedApp] = useState('EHG');
  const [expanded, setExpanded] = useState(true);
  const [selectedLogTab, setSelectedLogTab] = useState('progress');
  const [loading, setLoading] = useState(false);
  const [showConfirmStart, setShowConfirmStart] = useState(false);
  const [fastMode, setFastMode] = useState(false);

  // Fetch campaign status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/testing/campaign/status');
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch campaign status:', error);
    }
  };

  // Fetch app counts
  const fetchAppCounts = async () => {
    try {
      const res = await fetch('/api/testing/campaign/apps');
      const data = await res.json();
      setAppCounts(data);
    } catch (error) {
      console.error('Failed to fetch app counts:', error);
    }
  };

  // Fetch health report
  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/testing/campaign/health');
      const data = await res.json();
      setHealth(data);
    } catch (error) {
      console.error('Failed to fetch health:', error);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    try {
      const [progressRes, errorsRes, alertsRes] = await Promise.all([
        fetch('/api/testing/campaign/logs/progress?limit=50'),
        fetch('/api/testing/campaign/logs/errors?limit=50'),
        fetch('/api/testing/campaign/logs/alerts?limit=20')
      ]);

      const [progress, errors, alerts] = await Promise.all([
        progressRes.json(),
        errorsRes.json(),
        alertsRes.json()
      ]);

      setLogs({
        progress: progress.lines || [],
        errors: errors.lines || [],
        alerts: alerts.lines || []
      });
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  // Start campaign
  const startCampaign = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/testing/campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetApplication: selectedApp,
          smokeOnly: fastMode
        })
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Failed to start campaign: ${error.error}`);
      } else {
        setTimeout(fetchStatus, 2000); // Give it time to start
      }
    } catch (error) {
      alert(`Failed to start campaign: ${error.message}`);
    } finally {
      setLoading(false);
      setShowConfirmStart(false); // Always close modal, even on error
    }
  };

  // Stop campaign
  const stopCampaign = async () => {
    if (!confirm('Stop the testing campaign? Tests in progress will be interrupted.')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/testing/campaign/stop', {
        method: 'POST'
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Failed to stop campaign: ${error.error}`);
      } else {
        setTimeout(fetchStatus, 1000);
      }
    } catch (error) {
      alert(`Failed to stop campaign: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Refresh all data
  const refreshAll = () => {
    fetchStatus();
    fetchAppCounts();
    fetchHealth();
    fetchLogs();
  };

  // Initial load and polling
  useEffect(() => {
    refreshAll();

    // Poll every 10 seconds
    const interval = setInterval(refreshAll, 10000);

    return () => clearInterval(interval);
  }, []);

  // Get status icon and color
  const getStatusDisplay = () => {
    if (!status || status.status === 'not_started') {
      return { icon: '❓', color: 'text-gray-500', label: 'Not Started' };
    }

    switch (status.status) {
      case 'running':
        return { icon: '🟢', color: 'text-green-600', label: 'HEALTHY' };
      case 'complete':
        return { icon: '🎉', color: 'text-blue-600', label: 'COMPLETE' };
      case 'crashed':
        return { icon: '🔴', color: 'text-red-600', label: 'CRASHED' };
      default:
        return { icon: '🟡', color: 'text-yellow-600', label: status.status.toUpperCase() };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 dark:from-indigo-700 dark:to-indigo-600 text-white p-4 flex items-center justify-between hover:from-indigo-700 hover:to-indigo-600 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Server className="h-6 w-6" />
          <h2 className="text-lg font-semibold">Testing Campaign Management</h2>
          {status?.running && (
            <span className="bg-green-400/30 px-3 py-1 rounded-full text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 animate-pulse" />
              Running
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>

      {expanded && (
        <div className="p-6">
          {/* Application Selector */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <label className="flex items-center gap-2 text-base font-semibold text-gray-700 dark:text-gray-300 mb-3">
              <Target className="h-5 w-5" />
              Target Application
            </label>
            <select
              value={selectedApp}
              onChange={(e) => setSelectedApp(e.target.value)}
              disabled={status?.running}
              className="w-full px-4 py-2 border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="EHG">EHG (Customer Application) - RECOMMENDED</option>
              <option value="EHG_Engineer">EHG_Engineer (Dashboard)</option>
            </select>
            {appCounts && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold text-blue-700 dark:text-blue-300 text-base">EHG</div>
                  <div className="text-gray-600 dark:text-gray-400 text-base">
                    {appCounts.EHG?.tested || 0}/{appCounts.EHG?.completed || 0} tested
                    {appCounts.EHG?.untested > 0 && (
                      <span className="text-orange-600 dark:text-orange-400 ml-2">
                        ({appCounts.EHG.untested} remaining)
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700 dark:text-gray-300 text-base">EHG_Engineer</div>
                  <div className="text-gray-600 dark:text-gray-400 text-base">
                    {appCounts.EHG_Engineer?.tested || 0}/{appCounts.EHG_Engineer?.completed || 0} tested
                    {appCounts.EHG_Engineer?.untested > 0 && (
                      <span className="text-orange-600 dark:text-orange-400 ml-2">
                        ({appCounts.EHG_Engineer.untested} remaining)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Fast Mode Toggle */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                disabled={status?.running}
                className="w-5 h-5 text-green-600 bg-white border-green-300 rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex-1">
                <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  ⚡ Fast Mode (Smoke Tests Only)
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {fastMode ? (
                    <>5x faster (~60s per SD, smoke tests only) vs. Full testing (~5min per SD with E2E)</>
                  ) : (
                    <>Full testing includes unit tests + E2E tests (~5min per SD)</>
                  )}
                </div>
              </div>
            </label>
          </div>

          {/* Status Card */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{statusDisplay.icon}</span>
                <div>
                  <div className={`text-lg font-bold ${statusDisplay.color}`}>
                    {statusDisplay.label}
                  </div>
                  {status?.targetApplication && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Testing: <span className="font-semibold">{status.targetApplication}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={refreshAll}
                  className="p-2 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>

                {!status?.running ? (
                  <button
                    onClick={() => setShowConfirmStart(true)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    Start Campaign
                  </button>
                ) : (
                  <button
                    onClick={stopCampaign}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    <Square className="h-4 w-4" />
                    Stop
                  </button>
                )}
              </div>
            </div>

            {/* Progress Info */}
            {status?.running && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Progress</span>
                  <span className="font-semibold">{status.progress} ({status.percent}%)</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${status.percent}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                  <div>
                    <div className="text-gray-600 dark:text-gray-400">Current SD</div>
                    <div className="font-mono text-xs">{status.currentSD || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600 dark:text-gray-400">Last Update</div>
                    <div className="font-mono text-xs">
                      {status.lastUpdate ? new Date(status.lastUpdate).toLocaleTimeString() : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stats from Checkpoint */}
          {health?.checkpoint && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-base font-medium mb-1">
                  <FileText className="h-5 w-5" />
                  Tested
                </div>
                <div className="text-2xl font-bold">{health.checkpoint.tested}</div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-base font-medium mb-1">
                  <CheckCircle className="h-5 w-5" />
                  Passed
                </div>
                <div className="text-2xl font-bold text-green-600">{health.checkpoint.passed}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {health.checkpoint.tested > 0
                    ? ((health.checkpoint.passed / health.checkpoint.tested) * 100).toFixed(1)
                    : 0}%
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-base font-medium mb-1">
                  <AlertTriangle className="h-5 w-5" />
                  Failed
                </div>
                <div className="text-2xl font-bold text-red-600">{health.checkpoint.failed}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {health.checkpoint.tested > 0
                    ? ((health.checkpoint.failed / health.checkpoint.tested) * 100).toFixed(1)
                    : 0}%
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 text-base font-medium mb-1">
                  <Clock className="h-5 w-5" />
                  Errors
                </div>
                <div className="text-2xl font-bold text-yellow-600">{health.checkpoint.errors}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {health.checkpoint.tested > 0
                    ? ((health.checkpoint.errors / health.checkpoint.tested) * 100).toFixed(1)
                    : 0}%
                </div>
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden">
            <div className="flex border-b border-gray-200 dark:border-gray-600">
              {['progress', 'errors', 'alerts'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedLogTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    selectedLogTab === tab
                      ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {logs[tab].length > 0 && (
                    <span className="ml-2 bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded-full text-xs">
                      {logs[tab].length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 bg-gray-900 text-gray-100 font-mono text-sm max-h-64 overflow-y-auto">
              {logs[selectedLogTab].length > 0 ? (
                logs[selectedLogTab].map((line, idx) => (
                  <div key={idx} className="py-1">
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-gray-500 text-center py-8 text-base">No {selectedLogTab} logs yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Start Modal */}
      {showConfirmStart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-bold mb-4">Start Testing Campaign?</h3>

            <div className="space-y-3 mb-6 text-base">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Application:</span>
                <span className="font-semibold">{selectedApp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">SDs to test:</span>
                <span className="font-semibold">
                  {appCounts?.[selectedApp]?.untested || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Estimated time:</span>
                <span className="font-semibold">
                  ~{Math.round(((appCounts?.[selectedApp]?.untested || 0) * 5) / 60)} hours
                </span>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6 text-base">
              <p>
                This will run <strong>REAL tests</strong> against the{' '}
                <strong>{selectedApp}</strong> application at{' '}
                <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded text-sm">
                  {selectedApp === 'EHG' ? '/mnt/c/_EHG/ehg' : '/mnt/c/_EHG/EHG_Engineer'}
                </code>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmStart(false)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startCampaign}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Starting...' : 'Start Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
