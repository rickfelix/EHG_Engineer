/**
 * IntegrationAPILayer Component - Stage 19
 * Integration & API Layer Development
 *
 * SD: SD-IND-C-STAGES-17-21 (Block C: MVP Feedback Loop)
 * Phase: THE BUILD LOOP
 */

import React, { useState } from 'react';
import { Plug, Server, Zap, Check, AlertCircle, ChevronRight, ChevronLeft, Play, ExternalLink, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const API_ENDPOINTS = [
  { method: 'GET', path: '/api/users', status: 'active', latency: '45ms' },
  { method: 'POST', path: '/api/users', status: 'active', latency: '120ms' },
  { method: 'GET', path: '/api/products', status: 'active', latency: '38ms' },
  { method: 'POST', path: '/api/orders', status: 'active', latency: '250ms' },
  { method: 'GET', path: '/api/orders/:id', status: 'testing', latency: '-' }
];

const INTEGRATIONS = [
  { name: 'Stripe', type: 'Payment', status: 'connected', icon: '💳' },
  { name: 'Resend', type: 'Email', status: 'connected', icon: '📧' },
  { name: 'Supabase', type: 'Database', status: 'connected', icon: '🗄️' },
  { name: 'PostHog', type: 'Analytics', status: 'pending', icon: '📊' }
];

const DEFAULT_API_DATA = { endpoints: API_ENDPOINTS, integrations: INTEGRATIONS };

export default function IntegrationAPILayer({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: apiData,
    setData: setApiData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 19, 'integration_tests', DEFAULT_API_DATA);

  const [activeTab, setActiveTab] = useState('endpoints');
  const [testResult, setTestResult] = useState(null);

  const handleSave = async () => {
    await saveArtifact(apiData || DEFAULT_API_DATA, 'Integration Tests');
  };

  const handleComplete = async () => {
    await saveArtifact(apiData || DEFAULT_API_DATA, 'Integration Tests');
    onStageComplete?.();
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading API layer...</p>
        </div>
      </div>
    );
  }

  const runTest = (endpoint) => {
    setTestResult({ endpoint: endpoint.path, status: 'running' });
    setTimeout(() => {
      setTestResult({ endpoint: endpoint.path, status: 'success', response: '200 OK' });
    }, 1000);
  };

  const getMethodColor = (method) => {
    const colors = { GET: 'text-green-600 bg-green-100', POST: 'text-blue-600 bg-blue-100', PUT: 'text-amber-600 bg-amber-100', DELETE: 'text-red-600 bg-red-100' };
    return colors[method] || 'text-gray-600 bg-gray-100';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <Plug className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 19: Integration & API Layer</h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">THE BUILD LOOP</span>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['endpoints', 'integrations', 'webhooks'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'endpoints' && (
          <div className="space-y-3">
            {API_ENDPOINTS.map((endpoint, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-orange-300 transition-colors">
                <span className={`px-2 py-1 text-xs font-mono font-bold rounded ${getMethodColor(endpoint.method)}`}>
                  {endpoint.method}
                </span>
                <code className="flex-1 text-sm font-mono text-gray-700 dark:text-gray-300">{endpoint.path}</code>
                <span className="text-xs text-gray-500">{endpoint.latency}</span>
                {endpoint.status === 'active' && <Check className="w-4 h-4 text-green-500" />}
                {endpoint.status === 'testing' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                <button onClick={() => runTest(endpoint)} className="p-1 hover:bg-orange-100 rounded">
                  <Play className="w-4 h-4 text-orange-500" />
                </button>
              </div>
            ))}

            {testResult && (
              <div className={`p-4 rounded-lg ${testResult.status === 'success' ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
                <div className="flex items-center gap-2">
                  {testResult.status === 'running' && <Zap className="w-4 h-4 text-orange-500 animate-pulse" />}
                  {testResult.status === 'success' && <Check className="w-4 h-4 text-green-500" />}
                  <span className="text-sm font-mono">{testResult.endpoint}</span>
                  {testResult.response && <span className="text-sm text-green-600 ml-auto">{testResult.response}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="grid md:grid-cols-2 gap-4">
            {INTEGRATIONS.map((int, idx) => (
              <div key={idx} className={`p-4 rounded-lg border-2 ${
                int.status === 'connected' ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{int.icon}</span>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{int.name}</div>
                      <div className="text-xs text-gray-500">{int.type}</div>
                    </div>
                  </div>
                  {int.status === 'connected' ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <button className="px-3 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600">
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Configured Webhooks</h4>
              {[
                { event: 'payment.completed', url: 'https://api.example.com/webhooks/stripe' },
                { event: 'user.created', url: 'https://api.example.com/webhooks/auth' }
              ].map((wh, idx) => (
                <div key={idx} className="flex items-center gap-3 py-2 border-b last:border-0 border-gray-100 dark:border-gray-700">
                  <Zap className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{wh.event}</span>
                  <span className="text-xs text-gray-500 flex-1 truncate">{wh.url}</span>
                  <ExternalLink className="w-4 h-4 text-gray-400" />
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
