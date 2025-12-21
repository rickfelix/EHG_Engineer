/**
 * DecisionDeck - Chairman's Glass Cockpit View
 * v3.3.0 Operation 'Human Pulse'
 *
 * THE LAW: Glanceability in <2 seconds
 * THE LAW: Maximum 3 key metrics per venture
 * THE LAW: Show the factory builds for Humans
 *
 * Displays:
 * 1. Venture fleet health at a glance
 * 2. Glanceability Score per venture
 * 3. Human Impact Risk status
 * 4. Stage progression with persona validation
 */

import React, { useState, useEffect } from 'react';

// Calculate health score based on calibration delta
// Operation 'Final Weld' v6.0.0: Truth Aggregator
const calculateHealthScore = (venture) => {
  const calibration = venture.calibration?.calibration;

  if (!calibration) {
    // No calibration data - use stage-based fallback
    const stageScore = (venture.current_lifecycle_stage / 25) * 30;
    return Math.min(100, stageScore + 70);
  }

  // Health score = (1 - normalized_delta) * 100
  // delta 0 = 100% healthy, delta 1 = 0% healthy
  const healthScore = (1 - calibration.normalized_delta) * 100;
  return Math.max(0, Math.round(healthScore));
};

// Get score color based on thresholds from rubric.yaml
const getScoreColor = (score) => {
  if (score >= 85) return 'text-green-400';
  if (score >= 70) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
};

const getScoreBgColor = (score) => {
  if (score >= 85) return 'bg-green-500/20 border-green-500/50';
  if (score >= 70) return 'bg-yellow-500/20 border-yellow-500/50';
  if (score >= 50) return 'bg-orange-500/20 border-orange-500/50';
  return 'bg-red-500/20 border-red-500/50';
};

// Venture Card Component - Glanceable in <2 seconds
// Operation 'Final Weld' v6.0.0: Truth Aggregator - Live δ scores
const VentureCard = ({ venture }) => {
  const healthScore = calculateHealthScore(venture);
  const calibration = venture.calibration?.calibration;
  const delta = calibration?.normalized_delta;
  const healthStatus = calibration?.health_status || 'unknown';

  // Get delta color based on value
  const getDeltaColor = (d) => {
    if (d === undefined || d === null) return 'text-gray-400';
    if (d <= 0.2) return 'text-green-400';
    if (d <= 0.4) return 'text-yellow-400';
    if (d <= 0.5) return 'text-orange-400';
    return 'text-red-400';
  };

  // Get health status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'green': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'yellow': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'red': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  return (
    <div className={`rounded-lg border p-4 ${getScoreBgColor(healthScore)} transition-all hover:scale-[1.02]`}>
      {/* Header: Name + Health Score - Layer 0 (instant comprehension) */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{getVerticalEmoji(venture.metadata?.vertical)}</span>
          <h3 className="font-bold text-lg text-white">{venture.name}</h3>
        </div>
        <div className={`text-2xl font-bold ${getScoreColor(healthScore)}`}>
          {healthScore}
        </div>
      </div>

      {/* Key Metrics - Maximum 3 per Pillar 7 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {/* Stage */}
        <div className="text-center">
          <div className="text-2xl font-bold text-white">{venture.current_lifecycle_stage}</div>
          <div className="text-xs text-gray-400">Stage</div>
        </div>

        {/* Calibration Delta (δ) */}
        <div className="text-center">
          <div className={`text-2xl font-bold ${getDeltaColor(delta)}`}>
            {delta !== undefined && delta !== null ? `δ ${delta.toFixed(2)}` : 'δ --'}
          </div>
          <div className="text-xs text-gray-400">Delta</div>
        </div>

        {/* Health Status */}
        <div className="text-center">
          <div className={`text-sm px-2 py-1 rounded border ${getStatusColor(healthStatus)}`}>
            {healthStatus === 'green' ? '✓ OK' :
             healthStatus === 'yellow' ? '⚠ WARN' :
             healthStatus === 'red' ? '✗ CRIT' : '? N/A'}
          </div>
          <div className="text-xs text-gray-400 mt-1">Status</div>
        </div>
      </div>

      {/* Vertical Badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">
          {venture.metadata?.vertical || venture.vertical_category || 'Unknown'}
        </span>
        <span className="text-xs text-gray-500">
          Stage {venture.current_lifecycle_stage}/25
        </span>
      </div>
    </div>
  );
};

// Helper: Get emoji for vertical
const getVerticalEmoji = (vertical) => {
  const emojiMap = {
    'Healthcare': '🏥',
    'FinTech': '💰',
    'EdTech': '📚',
    'Logistics': '🚚',
    'PropTech': '🏠',
    'LegalTech': '⚖️'
  };
  return emojiMap[vertical] || '🏢';
};

// Fleet Summary Card - Updated for calibration data
// Operation 'Final Weld' v6.0.0: Truth Aggregator
const FleetSummary = ({ ventures }) => {
  const avgHealthScore = ventures.length > 0
    ? Math.round(ventures.reduce((sum, v) => sum + calculateHealthScore(v), 0) / ventures.length)
    : 0;

  // Count ventures by health status
  const statusCounts = ventures.reduce((acc, v) => {
    const status = v.calibration?.calibration?.health_status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const avgStage = ventures.length > 0
    ? (ventures.reduce((sum, v) => sum + (v.current_lifecycle_stage || 0), 0) / ventures.length).toFixed(1)
    : 0;

  // Average delta
  const venturesWithDelta = ventures.filter(v => v.calibration?.calibration?.normalized_delta !== undefined);
  const avgDelta = venturesWithDelta.length > 0
    ? (venturesWithDelta.reduce((sum, v) => sum + v.calibration.calibration.normalized_delta, 0) / venturesWithDelta.length).toFixed(2)
    : '--';

  return (
    <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 rounded-lg border border-indigo-500/30 p-6 mb-6">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        🎯 Fleet Calibration Status
        <span className="text-sm font-normal text-gray-400">
          (Operation Final Weld v6.0.0)
        </span>
      </h2>

      <div className="grid grid-cols-4 gap-4">
        {/* Fleet Health Score */}
        <div className="text-center">
          <div className={`text-4xl font-bold ${getScoreColor(avgHealthScore)}`}>
            {avgHealthScore}
          </div>
          <div className="text-sm text-gray-400">Avg Health</div>
        </div>

        {/* Average Delta */}
        <div className="text-center">
          <div className={`text-4xl font-bold ${avgDelta === '--' ? 'text-gray-400' : parseFloat(avgDelta) <= 0.3 ? 'text-green-400' : parseFloat(avgDelta) <= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
            δ {avgDelta}
          </div>
          <div className="text-sm text-gray-400">Avg Delta</div>
        </div>

        {/* Status Breakdown */}
        <div className="text-center">
          <div className="text-2xl font-bold">
            <span className="text-green-400">{statusCounts.green || 0}</span>
            <span className="text-gray-500">/</span>
            <span className="text-yellow-400">{statusCounts.yellow || 0}</span>
            <span className="text-gray-500">/</span>
            <span className="text-red-400">{statusCounts.red || 0}</span>
          </div>
          <div className="text-sm text-gray-400">G/Y/R Status</div>
        </div>

        {/* Average Stage */}
        <div className="text-center">
          <div className="text-4xl font-bold text-blue-400">{avgStage}</div>
          <div className="text-sm text-gray-400">Avg Stage</div>
        </div>
      </div>
    </div>
  );
};

// Main DecisionDeck Component
const DecisionDeck = () => {
  const [ventures, setVentures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchVentures();
  }, []);

  // Operation 'Final Weld' v6.0.0: Fetch ventures with live calibration data
  const fetchVentures = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ventures');

      if (!response.ok) {
        throw new Error(`Failed to fetch ventures: ${response.status}`);
      }

      const data = await response.json();
      const allVentures = data.ventures || data || [];

      // Filter for active ventures (Stage 1+)
      const activeVentures = allVentures.filter(v =>
        v.current_lifecycle_stage >= 1 && v.status !== 'archived'
      );

      // Fetch calibration data for each venture in parallel
      const enrichedVentures = await Promise.all(
        activeVentures.map(async (venture) => {
          try {
            const calibResponse = await fetch(`/api/ventures/${venture.id}/calibration`);
            if (calibResponse.ok) {
              const calibData = await calibResponse.json();
              return { ...venture, calibration: calibData };
            }
          } catch (calibErr) {
            console.warn(`Failed to fetch calibration for ${venture.name}:`, calibErr);
          }
          return { ...venture, calibration: null };
        })
      );

      setVentures(enrichedVentures);
      setError(null);
    } catch (err) {
      console.error('Error fetching ventures:', err);
      setError(err.message);
      // No hardcoded fallback - show empty state
      setVentures([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-gray-900 min-h-screen">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-40 bg-gray-800 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          🎛️ Decision Deck
          <span className="text-sm font-normal bg-indigo-600 px-2 py-1 rounded">
            v6.0.0 Final Weld
          </span>
        </h1>
        <p className="text-gray-400 mt-1">
          Glass Cockpit View — Live Calibration Data (δ scores from database)
        </p>
      </div>

      {/* Fleet Summary */}
      <FleetSummary ventures={ventures} />

      {/* Venture Grid */}
      {ventures.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          {ventures.map(venture => (
            <VentureCard key={venture.id} venture={venture} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No active ventures found.</p>
          <p className="text-sm mt-2">Create a venture to see calibration data here.</p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <h3 className="text-sm font-bold text-gray-400 mb-2">Calibration Legend</h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <span className="text-green-400">δ ≤0.2: Excellent</span>
          <span className="text-yellow-400">δ 0.2-0.4: Good</span>
          <span className="text-orange-400">δ 0.4-0.5: Warning</span>
          <span className="text-red-400">δ &gt;0.5: Critical (Alert Fired)</span>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-600/30 rounded text-red-400 text-sm">
          ⚠️ Error loading ventures: {error}
        </div>
      )}
    </div>
  );
};

export default DecisionDeck;
