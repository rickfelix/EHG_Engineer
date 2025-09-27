import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, TrendingUp, Target, GitBranch, BarChart } from 'lucide-react';
import { supabase } from '../../config/supabase';

const ReleaseGateCalculator = () => {
  const [gateMetrics, setGateMetrics] = useState({
    storyCompletion: 0,
    verificationCoverage: 0,
    testCoverage: 0,
    criticalBugs: 0,
    performanceMetrics: 0,
    securityChecks: 0
  });

  const [gateThresholds, setGateThresholds] = useState({
    storyCompletion: 85,
    verificationCoverage: 80,
    testCoverage: 70,
    criticalBugs: 0,
    performanceMetrics: 90,
    securityChecks: 100
  });

  const [gateStatus, setGateStatus] = useState('calculating');
  const [overrideJustification, setOverrideJustification] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [releaseHistory, setReleaseHistory] = useState([]);

  useEffect(() => {
    fetchMetrics();
    fetchReleaseHistory();
  }, []);

  // Fetch current metrics
  const fetchMetrics = async () => {
    try {
      // Fetch story completion
      const { data: stories, error: storiesError } = await supabase
        .from('user_stories')
        .select('id, status, verification_status');

      if (!storiesError) {
        const total = stories.length || 1;
        const completed = stories.filter(s => s.status === 'completed').length;
        const verified = stories.filter(s => s.verification_status === 'verified').length;

        setGateMetrics(prev => ({
          ...prev,
          storyCompletion: Math.round((completed / total) * 100),
          verificationCoverage: Math.round((verified / total) * 100)
        }));
      }

      // Simulate other metrics (in production, these would come from various sources)
      setGateMetrics(prev => ({
        ...prev,
        testCoverage: 75 + Math.random() * 20,
        criticalBugs: Math.floor(Math.random() * 3),
        performanceMetrics: 85 + Math.random() * 10,
        securityChecks: Math.random() > 0.3 ? 100 : 0
      }));

      calculateGateStatus();
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  // Fetch release history
  const fetchReleaseHistory = async () => {
    // Simulate release history
    const history = [
      {
        id: 1,
        version: 'v2.1.0',
        date: '2024-01-15',
        status: 'passed',
        metrics: {
          storyCompletion: 92,
          verificationCoverage: 88,
          testCoverage: 82
        }
      },
      {
        id: 2,
        version: 'v2.0.9',
        date: '2024-01-08',
        status: 'override',
        metrics: {
          storyCompletion: 78,
          verificationCoverage: 75,
          testCoverage: 71
        },
        justification: 'Critical security patch required immediate release'
      },
      {
        id: 3,
        version: 'v2.0.8',
        date: '2024-01-01',
        status: 'passed',
        metrics: {
          storyCompletion: 95,
          verificationCoverage: 92,
          testCoverage: 85
        }
      }
    ];

    setReleaseHistory(history);
  };

  // Calculate gate status
  const calculateGateStatus = () => {
    const metricsPass =
      gateMetrics.storyCompletion >= gateThresholds.storyCompletion &&
      gateMetrics.verificationCoverage >= gateThresholds.verificationCoverage &&
      gateMetrics.testCoverage >= gateThresholds.testCoverage &&
      gateMetrics.criticalBugs <= gateThresholds.criticalBugs &&
      gateMetrics.performanceMetrics >= gateThresholds.performanceMetrics &&
      gateMetrics.securityChecks >= gateThresholds.securityChecks;

    setGateStatus(metricsPass ? 'passed' : 'failed');
  };

  // Get metric status color
  const getMetricColor = (value, threshold, inverse = false) => {
    const passes = inverse ? value <= threshold : value >= threshold;
    return passes ? 'text-green-600' : 'text-red-600';
  };

  // Get metric icon
  const getMetricIcon = (value, threshold, inverse = false) => {
    const passes = inverse ? value <= threshold : value >= threshold;
    return passes ? (
      <CheckCircle className="h-5 w-5 text-green-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-500" />
    );
  };

  // Handle override
  const handleOverride = async () => {
    if (!overrideJustification.trim()) {
      alert('Please provide a justification for the override');
      return;
    }

    try {
      // Log the override
      const override = {
        metrics: gateMetrics,
        thresholds: gateThresholds,
        justification: overrideJustification,
        user: 'current_user', // Would be actual user in production
        timestamp: new Date().toISOString()
      };

      // Save to database (simplified for demo)
      console.log('Override logged:', override);

      alert('Release gate override approved and logged');
      setShowOverride(false);
      setOverrideJustification('');
      setGateStatus('override');
    } catch (error) {
      console.error('Error logging override:', error);
    }
  };

  // Update threshold
  const updateThreshold = (metric, value) => {
    setGateThresholds(prev => ({
      ...prev,
      [metric]: parseFloat(value)
    }));
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <Shield className="h-6 w-6 mr-2 text-blue-600" />
          Release Gate Calculator
        </h2>
        <p className="text-gray-600">Automated release readiness assessment based on completion metrics</p>
      </div>

      {/* Overall Status */}
      <div className={`mb-6 p-4 rounded-lg ${
        gateStatus === 'passed' ? 'bg-green-50 border-2 border-green-500' :
        gateStatus === 'override' ? 'bg-yellow-50 border-2 border-yellow-500' :
        gateStatus === 'failed' ? 'bg-red-50 border-2 border-red-500' :
        'bg-gray-50 border-2 border-gray-300'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {gateStatus === 'passed' ? (
              <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
            ) : gateStatus === 'failed' ? (
              <XCircle className="h-8 w-8 text-red-600 mr-3" />
            ) : gateStatus === 'override' ? (
              <AlertTriangle className="h-8 w-8 text-yellow-600 mr-3" />
            ) : (
              <div className="h-8 w-8 mr-3 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            )}
            <div>
              <h3 className="text-xl font-bold">
                {gateStatus === 'passed' ? 'Release Gate: PASSED' :
                 gateStatus === 'failed' ? 'Release Gate: FAILED' :
                 gateStatus === 'override' ? 'Release Gate: OVERRIDE' :
                 'Calculating Gate Status...'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {gateStatus === 'passed' ? 'All criteria met - ready for release' :
                 gateStatus === 'failed' ? 'Some criteria not met - review required' :
                 gateStatus === 'override' ? 'Released with override justification' :
                 'Analyzing metrics...'}
              </p>
            </div>
          </div>

          {gateStatus === 'failed' && (
            <button
              onClick={() => setShowOverride(true)}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 flex items-center"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Override Gate
            </button>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Story Completion */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">Story Completion</h4>
            {getMetricIcon(gateMetrics.storyCompletion, gateThresholds.storyCompletion)}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getMetricColor(gateMetrics.storyCompletion, gateThresholds.storyCompletion)}`}>
              {gateMetrics.storyCompletion}%
            </span>
            <span className="text-sm text-gray-500">/ {gateThresholds.storyCompletion}%</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  gateMetrics.storyCompletion >= gateThresholds.storyCompletion ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${gateMetrics.storyCompletion}%` }}
              />
            </div>
          </div>
        </div>

        {/* Verification Coverage */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">Verification Coverage</h4>
            {getMetricIcon(gateMetrics.verificationCoverage, gateThresholds.verificationCoverage)}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getMetricColor(gateMetrics.verificationCoverage, gateThresholds.verificationCoverage)}`}>
              {gateMetrics.verificationCoverage}%
            </span>
            <span className="text-sm text-gray-500">/ {gateThresholds.verificationCoverage}%</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  gateMetrics.verificationCoverage >= gateThresholds.verificationCoverage ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${gateMetrics.verificationCoverage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Test Coverage */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">Test Coverage</h4>
            {getMetricIcon(gateMetrics.testCoverage, gateThresholds.testCoverage)}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getMetricColor(gateMetrics.testCoverage, gateThresholds.testCoverage)}`}>
              {Math.round(gateMetrics.testCoverage)}%
            </span>
            <span className="text-sm text-gray-500">/ {gateThresholds.testCoverage}%</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  gateMetrics.testCoverage >= gateThresholds.testCoverage ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${gateMetrics.testCoverage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Critical Bugs */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">Critical Bugs</h4>
            {getMetricIcon(gateMetrics.criticalBugs, gateThresholds.criticalBugs, true)}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getMetricColor(gateMetrics.criticalBugs, gateThresholds.criticalBugs, true)}`}>
              {gateMetrics.criticalBugs}
            </span>
            <span className="text-sm text-gray-500">≤ {gateThresholds.criticalBugs}</span>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            {gateMetrics.criticalBugs === 0 ? 'No critical bugs' : `${gateMetrics.criticalBugs} bug(s) found`}
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">Performance Metrics</h4>
            {getMetricIcon(gateMetrics.performanceMetrics, gateThresholds.performanceMetrics)}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getMetricColor(gateMetrics.performanceMetrics, gateThresholds.performanceMetrics)}`}>
              {Math.round(gateMetrics.performanceMetrics)}%
            </span>
            <span className="text-sm text-gray-500">/ {gateThresholds.performanceMetrics}%</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  gateMetrics.performanceMetrics >= gateThresholds.performanceMetrics ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${gateMetrics.performanceMetrics}%` }}
              />
            </div>
          </div>
        </div>

        {/* Security Checks */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm">Security Checks</h4>
            {getMetricIcon(gateMetrics.securityChecks, gateThresholds.securityChecks)}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getMetricColor(gateMetrics.securityChecks, gateThresholds.securityChecks)}`}>
              {gateMetrics.securityChecks === 100 ? 'Passed' : 'Failed'}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            {gateMetrics.securityChecks === 100 ? 'All security checks passed' : 'Security issues detected'}
          </div>
        </div>
      </div>

      {/* Threshold Configuration */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">Gate Thresholds</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Story Completion (%)</label>
            <input
              type="number"
              value={gateThresholds.storyCompletion}
              onChange={(e) => updateThreshold('storyCompletion', e.target.value)}
              className="w-full px-3 py-1 border rounded-md"
              min="0"
              max="100"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Verification Coverage (%)</label>
            <input
              type="number"
              value={gateThresholds.verificationCoverage}
              onChange={(e) => updateThreshold('verificationCoverage', e.target.value)}
              className="w-full px-3 py-1 border rounded-md"
              min="0"
              max="100"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Test Coverage (%)</label>
            <input
              type="number"
              value={gateThresholds.testCoverage}
              onChange={(e) => updateThreshold('testCoverage', e.target.value)}
              className="w-full px-3 py-1 border rounded-md"
              min="0"
              max="100"
            />
          </div>
        </div>
      </div>

      {/* Release History */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Recent Release History</h3>
        <div className="space-y-2">
          {releaseHistory.map(release => (
            <div key={release.id} className="border rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center">
                <GitBranch className="h-4 w-4 text-gray-500 mr-2" />
                <div>
                  <span className="font-medium">{release.version}</span>
                  <span className="text-sm text-gray-500 ml-2">{release.date}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-600">
                  SC: {release.metrics.storyCompletion}% |
                  VC: {release.metrics.verificationCoverage}% |
                  TC: {release.metrics.testCoverage}%
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  release.status === 'passed' ? 'bg-green-100 text-green-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {release.status === 'passed' ? 'Passed' : 'Override'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Override Modal */}
      {showOverride && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Override Release Gate</h3>
            <p className="text-gray-600 mb-4">
              Overriding the release gate requires justification and will be logged for audit purposes.
            </p>
            <textarea
              value={overrideJustification}
              onChange={(e) => setOverrideJustification(e.target.value)}
              placeholder="Enter justification for override..."
              className="w-full px-3 py-2 border rounded-md mb-4"
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowOverride(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleOverride}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReleaseGateCalculator;