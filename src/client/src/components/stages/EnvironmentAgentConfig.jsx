/**
 * EnvironmentAgentConfig Component - Stage 17
 * Environment & Agent Configuration Interface
 *
 * SD: SD-IND-C-STAGES-17-21 (Block C: MVP Feedback Loop)
 * Phase: THE BUILD LOOP
 */

import React, { useState } from 'react';
import { Settings, Server, Key, GitBranch, Check, AlertCircle, ChevronRight, ChevronLeft, Copy, Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const ENVIRONMENTS = [
  { id: 'development', label: 'Development', status: 'configured' },
  { id: 'staging', label: 'Staging', status: 'configured' },
  { id: 'production', label: 'Production', status: 'pending' }
];

const ENV_VARS = [
  { key: 'DATABASE_URL', value: 'postgresql://...', sensitive: true, required: true },
  { key: 'API_KEY', value: 'sk-...', sensitive: true, required: true },
  { key: 'NEXT_PUBLIC_APP_URL', value: 'https://app.example.com', sensitive: false, required: true },
  { key: 'FEATURE_FLAG_BETA', value: 'true', sensitive: false, required: false }
];

const DEFAULT_ENV_DATA = { activeEnv: 'development', envVars: ENV_VARS };

export default function EnvironmentAgentConfig({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: envData,
    setData: setEnvData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 17, 'cicd_config', DEFAULT_ENV_DATA);

  const [showSecrets, setShowSecrets] = useState({});
  const [activeTab, setActiveTab] = useState('env');
  const [activeEnv, setActiveEnv] = useState('development');

  const toggleSecret = (key) => {
    setShowSecrets({ ...showSecrets, [key]: !showSecrets[key] });
  };

  const handleSave = async () => {
    await saveArtifact(envData || DEFAULT_ENV_DATA, 'CI/CD Config');
  };

  const handleComplete = async () => {
    await saveArtifact(envData || DEFAULT_ENV_DATA, 'CI/CD Config');
    onStageComplete?.();
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading environment config...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <Settings className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 17: Environment & Agent Config</h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">THE BUILD LOOP</span>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['env', 'cicd', 'agents'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}>
              {tab === 'env' ? 'Environment' : tab === 'cicd' ? 'CI/CD' : 'AI Agents'}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'env' && (
          <div className="space-y-6">
            {/* Environment Selector */}
            <div className="flex gap-2">
              {ENVIRONMENTS.map((env) => (
                <button
                  key={env.id}
                  onClick={() => setActiveEnv(env.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${
                    activeEnv === env.id
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <Server className="w-4 h-4" />
                  {env.label}
                  {env.status === 'configured' && <Check className="w-4 h-4 text-green-500" />}
                  {env.status === 'pending' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                </button>
              ))}
            </div>

            {/* Environment Variables */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700 dark:text-gray-300">Environment Variables</h4>
              {ENV_VARS.map((envVar, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <Key className="w-4 h-4 text-gray-400" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{envVar.key}</span>
                      {envVar.required && <span className="text-xs text-red-500">*</span>}
                    </div>
                    <div className="font-mono text-xs text-gray-500">
                      {envVar.sensitive && !showSecrets[envVar.key] ? '••••••••' : envVar.value}
                    </div>
                  </div>
                  {envVar.sensitive && (
                    <button onClick={() => toggleSecret(envVar.key)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                      {showSecrets[envVar.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                  <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'cicd' && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-700 dark:text-gray-300">CI/CD Pipeline</h4>
            {[
              { name: 'Build', status: 'success', duration: '2m 34s' },
              { name: 'Test', status: 'success', duration: '1m 12s' },
              { name: 'Deploy', status: 'pending', duration: '-' }
            ].map((step, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <GitBranch className="w-5 h-5 text-orange-500" />
                  <span className="font-medium">{step.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">{step.duration}</span>
                  {step.status === 'success' && <Check className="w-5 h-5 text-green-500" />}
                  {step.status === 'pending' && <AlertCircle className="w-5 h-5 text-amber-500" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-700 dark:text-gray-300">AI Agent Configuration</h4>
            {[
              { name: 'Code Assistant', provider: 'Claude', status: 'active' },
              { name: 'Test Generator', provider: 'Claude', status: 'active' },
              { name: 'Documentation', provider: 'Claude', status: 'configured' }
            ].map((agent, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">{agent.name}</div>
                  <div className="text-sm text-gray-500">Provider: {agent.provider}</div>
                </div>
                <span className={`px-3 py-1 text-xs rounded-full ${
                  agent.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {agent.status}
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
