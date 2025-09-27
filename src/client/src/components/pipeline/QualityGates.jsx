import React, { useState } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, TrendingUp, Lock, Unlock, BarChart3 } from 'lucide-react';

const QualityGates = () => {
  const [gates, setGates] = useState([
    {
      id: 'gate-001',
      name: 'Code Coverage',
      type: 'coverage',
      threshold: 80,
      currentValue: 85,
      status: 'passed',
      required: true,
      description: 'Minimum code coverage percentage'
    },
    {
      id: 'gate-002',
      name: 'Security Vulnerabilities',
      type: 'security',
      threshold: 0,
      currentValue: 2,
      status: 'failed',
      required: true,
      description: 'Critical security vulnerabilities count'
    },
    {
      id: 'gate-003',
      name: 'Performance Benchmark',
      type: 'performance',
      threshold: 500,
      currentValue: 420,
      status: 'passed',
      required: false,
      description: 'Page load time in milliseconds'
    },
    {
      id: 'gate-004',
      name: 'Test Success Rate',
      type: 'testing',
      threshold: 100,
      currentValue: 98,
      status: 'warning',
      required: true,
      description: 'Percentage of passing tests'
    },
    {
      id: 'gate-005',
      name: 'Build Size',
      type: 'size',
      threshold: 5000,
      currentValue: 4200,
      status: 'passed',
      required: false,
      description: 'Maximum bundle size in KB'
    },
    {
      id: 'gate-006',
      name: 'Manual Approval',
      type: 'approval',
      threshold: 1,
      currentValue: 0,
      status: 'pending',
      required: true,
      description: 'Release manager approval required'
    }
  ]);

  const [overrides, setOverrides] = useState([]);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [selectedGate, setSelectedGate] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  const getGateIcon = (type) => {
    switch (type) {
      case 'coverage':
        return <BarChart3 className="h-5 w-5" />;
      case 'security':
        return <Shield className="h-5 w-5" />;
      case 'performance':
        return <TrendingUp className="h-5 w-5" />;
      case 'testing':
        return <CheckCircle className="h-5 w-5" />;
      case 'size':
        return <Package className="h-5 w-5" />;
      case 'approval':
        return <Lock className="h-5 w-5" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'passed':
        return 'text-green-600 bg-green-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'pending':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getProgressBarColor = (status) => {
    switch (status) {
      case 'passed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'pending':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const calculateProgress = (gate) => {
    if (gate.type === 'approval') {
      return gate.currentValue * 100;
    }
    if (gate.type === 'security') {
      // Inverse for security (less is better)
      return Math.max(0, 100 - (gate.currentValue / (gate.threshold + 1)) * 100);
    }
    return Math.min(100, (gate.currentValue / gate.threshold) * 100);
  };

  const handleOverride = (gate) => {
    setSelectedGate(gate);
    setShowOverrideDialog(true);
  };

  const submitOverride = () => {
    if (selectedGate && overrideReason) {
      setOverrides([...overrides, {
        gateId: selectedGate.id,
        gateName: selectedGate.name,
        reason: overrideReason,
        timestamp: new Date().toISOString(),
        user: 'Current User'
      }]);

      // Update gate status
      setGates(gates.map(g =>
        g.id === selectedGate.id
          ? { ...g, status: 'passed', overridden: true }
          : g
      ));

      setShowOverrideDialog(false);
      setOverrideReason('');
      setSelectedGate(null);
    }
  };

  const overallStatus = gates.every(g => g.status === 'passed' || !g.required);
  const requiredGatesFailed = gates.filter(g => g.required && g.status === 'failed').length;
  const warningGates = gates.filter(g => g.status === 'warning').length;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <Shield className="h-6 w-6 mr-2 text-purple-600" />
          Quality Gates Configuration
        </h2>
        <p className="text-gray-600">Pipeline quality gates and deployment criteria</p>
        <div className="mt-2">
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            SD-PIPELINE-001
          </span>
        </div>
      </div>

      {/* Overall Status */}
      <div className={`mb-6 p-4 rounded-lg ${overallStatus ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {overallStatus ? (
              <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
            ) : (
              <XCircle className="h-8 w-8 text-red-600 mr-3" />
            )}
            <div>
              <h3 className="font-semibold text-lg">
                {overallStatus ? 'All Quality Gates Passed' : `${requiredGatesFailed} Required Gates Failed`}
              </h3>
              <p className="text-sm text-gray-600">
                {warningGates > 0 && `${warningGates} gates with warnings • `}
                {overrides.length > 0 && `${overrides.length} overrides applied`}
              </p>
            </div>
          </div>
          <button
            className={`px-4 py-2 rounded font-medium ${
              overallStatus
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-400 text-white cursor-not-allowed'
            }`}
            disabled={!overallStatus}
          >
            Proceed to Deployment
          </button>
        </div>
      </div>

      {/* Gates List */}
      <div className="space-y-4">
        {gates.map(gate => (
          <div
            key={gate.id}
            className={`border rounded-lg p-4 ${
              gate.overridden ? 'border-orange-300 bg-orange-50' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <div className={`p-2 rounded-lg mr-3 ${getStatusColor(gate.status)}`}>
                  {getGateIcon(gate.type)}
                </div>
                <div>
                  <h4 className="font-semibold flex items-center">
                    {gate.name}
                    {gate.required && (
                      <span className="ml-2 px-2 py-1 bg-red-100 text-red-600 text-xs rounded">
                        Required
                      </span>
                    )}
                    {gate.overridden && (
                      <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded">
                        Overridden
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-gray-500">{gate.description}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">
                  {gate.type === 'approval' ? (
                    gate.currentValue === 1 ? 'Approved' : 'Pending'
                  ) : (
                    `${gate.currentValue}${gate.type === 'coverage' || gate.type === 'testing' ? '%' : ''}`
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  Threshold: {gate.threshold}{gate.type === 'coverage' || gate.type === 'testing' ? '%' : ''}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {gate.type !== 'approval' && (
              <div className="mb-3">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${getProgressBarColor(gate.status)}`}
                    style={{ width: `${calculateProgress(gate)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="text-sm">
                {gate.status === 'passed' && (
                  <span className="text-green-600 flex items-center">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Gate passed
                  </span>
                )}
                {gate.status === 'failed' && (
                  <span className="text-red-600 flex items-center">
                    <XCircle className="h-4 w-4 mr-1" />
                    Gate failed - action required
                  </span>
                )}
                {gate.status === 'warning' && (
                  <span className="text-yellow-600 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Warning - review recommended
                  </span>
                )}
                {gate.status === 'pending' && (
                  <span className="text-gray-600 flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    Awaiting completion
                  </span>
                )}
              </div>
              {gate.required && gate.status === 'failed' && !gate.overridden && (
                <button
                  onClick={() => handleOverride(gate)}
                  className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 flex items-center"
                >
                  <Unlock className="h-3 w-3 mr-1" />
                  Override Gate
                </button>
              )}
              {gate.type === 'approval' && gate.currentValue === 0 && (
                <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                  Approve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Override History */}
      {overrides.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Override History</h3>
          <div className="space-y-2">
            {overrides.map((override, index) => (
              <div key={index} className="p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{override.gateName}</span>
                    <p className="text-sm text-gray-600">
                      Reason: {override.reason}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    By {override.user}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Override Dialog */}
      {showOverrideDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Override Quality Gate</h3>
            <p className="text-sm text-gray-600 mb-4">
              You are about to override the "{selectedGate?.name}" gate. This action requires justification and will be logged.
            </p>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Enter reason for override..."
              className="w-full p-3 border rounded-lg mb-4"
              rows={4}
            />
            <div className="flex gap-2">
              <button
                onClick={submitOverride}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                Confirm Override
              </button>
              <button
                onClick={() => {
                  setShowOverrideDialog(false);
                  setOverrideReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QualityGates;