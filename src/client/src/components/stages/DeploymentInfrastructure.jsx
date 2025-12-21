/**
 * DeploymentInfrastructure Component - Stage 22
 * Deployment & Infrastructure Setup
 *
 * SD: SD-IND-D-STAGES-22-25 (Block D: Infrastructure & Exit)
 * Phase: LAUNCH & LEARN
 */

import React, { useState } from 'react';
import { Cloud, Server, Database, Globe, Check, AlertCircle, ChevronRight, ChevronLeft, RefreshCw, Lock, Zap, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const INFRASTRUCTURE = [
  { name: 'Load Balancer', provider: 'AWS ALB', status: 'configured', region: 'us-east-1' },
  { name: 'Application Servers', provider: 'AWS ECS', status: 'configured', instances: 3 },
  { name: 'Database', provider: 'Supabase', status: 'configured', type: 'PostgreSQL' },
  { name: 'CDN', provider: 'CloudFront', status: 'pending', type: 'Edge' },
  { name: 'DNS', provider: 'Route 53', status: 'configured', domain: 'app.example.com' }
];

const ENVIRONMENTS = [
  { name: 'Development', status: 'active', url: 'dev.example.com', version: 'v1.2.3-dev' },
  { name: 'Staging', status: 'active', url: 'staging.example.com', version: 'v1.2.2' },
  { name: 'Production', status: 'pending', url: 'app.example.com', version: 'v1.2.1' }
];

const DEPLOY_CHECKLIST = [
  { item: 'Environment variables configured', checked: true },
  { item: 'SSL certificates installed', checked: true },
  { item: 'Database migrations applied', checked: true },
  { item: 'Health checks configured', checked: true },
  { item: 'Rollback procedure documented', checked: false },
  { item: 'Monitoring alerts configured', checked: false }
];

const DEFAULT_DEPLOY_DATA = { infrastructure: INFRASTRUCTURE, environments: ENVIRONMENTS, checklist: DEPLOY_CHECKLIST };

export default function DeploymentInfrastructure({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: deployData,
    setData: setDeployData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 22, 'deployment_runbook', DEFAULT_DEPLOY_DATA);

  const [activeTab, setActiveTab] = useState('infrastructure');
  const [deploying, setDeploying] = useState(false);

  const runDeployment = () => {
    setDeploying(true);
    setTimeout(() => setDeploying(false), 3000);
  };

  const handleSave = async () => {
    await saveArtifact(deployData || DEFAULT_DEPLOY_DATA, 'Deployment Runbook');
  };

  const handleComplete = async () => {
    await saveArtifact(deployData || DEFAULT_DEPLOY_DATA, 'Deployment Runbook');
    onStageComplete?.();
  };

  const configuredCount = INFRASTRUCTURE.filter(i => i.status === 'configured').length;
  const checklistComplete = DEPLOY_CHECKLIST.filter(c => c.checked).length;

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading deployment infrastructure...</p>
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
              <Cloud className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 22: Deployment & Infrastructure</h2>
              <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">LAUNCH & LEARN</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">{configuredCount}/{INFRASTRUCTURE.length}</div>
              <div className="text-xs text-gray-500">Services Ready</div>
            </div>
            <button
              onClick={runDeployment}
              disabled={deploying}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${deploying ? 'bg-gray-100' : 'bg-red-600 text-white hover:bg-red-700'}`}
            >
              <RefreshCw className={`w-4 h-4 ${deploying ? 'animate-spin' : ''}`} />
              {deploying ? 'Deploying...' : 'Deploy'}
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['infrastructure', 'environments', 'checklist'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'infrastructure' && (
          <div className="space-y-4">
            {INFRASTRUCTURE.map((infra, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <Server className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{infra.name}</div>
                  <div className="text-xs text-gray-500">{infra.provider} • {infra.region || infra.type || `${infra.instances} instances`}</div>
                </div>
                {infra.status === 'configured' ? (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                    <Check className="w-3 h-3" /> Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded">
                    <AlertCircle className="w-3 h-3" /> Pending
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'environments' && (
          <div className="space-y-4">
            {ENVIRONMENTS.map((env, idx) => (
              <div key={idx} className={`p-4 rounded-lg border-2 ${
                env.status === 'active' ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{env.name}</div>
                      <div className="text-xs text-gray-500">{env.url}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-gray-600">{env.version}</div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      env.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {env.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-red-500" /> Deployment Pipeline
              </h4>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-green-500 rounded-l" />
                <div className="flex-1 h-2 bg-green-500" />
                <div className="flex-1 h-2 bg-amber-500 rounded-r" />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>Dev</span>
                <span>Staging</span>
                <span>Production</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'checklist' && (
          <div className="space-y-6">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Deployment Readiness</span>
                <span className="text-sm text-gray-500">{checklistComplete}/{DEPLOY_CHECKLIST.length} complete</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: `${(checklistComplete / DEPLOY_CHECKLIST.length) * 100}%` }} />
              </div>
            </div>

            <div className="space-y-3">
              {DEPLOY_CHECKLIST.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  {item.checked ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <div className="w-5 h-5 rounded border-2 border-gray-300" />
                  )}
                  <span className={`text-sm ${item.checked ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>
                    {item.item}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-4 border border-amber-200 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Complete all checklist items before production deployment</span>
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
