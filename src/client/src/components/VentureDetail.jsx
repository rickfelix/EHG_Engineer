/**
 * VentureDetail Component
 * Displays detailed view of a single venture with stage-specific UI
 *
 * SD: SD-INDUSTRIAL-2025-001 (Sovereign Industrial Expansion)
 * Integrates StageRouter for stages 7-25
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Rocket,
  AlertCircle,
  ChevronRight,
  Calendar,
  Users,
  Target,
  Loader2
} from 'lucide-react';
import StageRouter, { STAGE_CONFIG, PHASE_COLORS } from './stages/StageRouter';

export default function VentureDetail({ isCompact, onRefresh }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [venture, setVenture] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);

  // Load venture data
  useEffect(() => {
    const loadVenture = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch venture details
        const ventureResponse = await fetch(`/api/ventures/${id}`);
        if (!ventureResponse.ok) {
          throw new Error('Failed to fetch venture');
        }
        const ventureData = await ventureResponse.json();
        setVenture(ventureData);

        // Fetch artifacts for this venture
        try {
          const artifactsResponse = await fetch(`/api/ventures/${id}/artifacts`);
          if (artifactsResponse.ok) {
            const artifactsData = await artifactsResponse.json();
            setArtifacts(artifactsData || []);
          }
        } catch (artifactError) {
          console.warn('Could not load artifacts:', artifactError);
          setArtifacts([]);
        }
      } catch (err) {
        console.error('Error loading venture:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadVenture();
  }, [id]);

  // Handle stage change
  const handleStageChange = async (newStage) => {
    if (!venture || updating) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/ventures/${id}/stage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stage: newStage })
      });

      if (!response.ok) {
        throw new Error('Failed to update stage');
      }

      const updatedVenture = await response.json();
      setVenture(updatedVenture);

      // Refresh artifacts for new stage
      try {
        const artifactsResponse = await fetch(`/api/ventures/${id}/artifacts`);
        if (artifactsResponse.ok) {
          const artifactsData = await artifactsResponse.json();
          setArtifacts(artifactsData || []);
        }
      } catch (artifactError) {
        console.warn('Could not refresh artifacts:', artifactError);
      }
    } catch (err) {
      console.error('Error updating stage:', err);
      // Optionally show error toast
    } finally {
      setUpdating(false);
    }
  };

  // Get phase info for current stage
  const getPhaseInfo = (stage) => {
    if (stage <= 5) return { name: 'THE TRUTH', color: 'blue' };
    if (stage <= 9) return { name: 'THE ENGINE', color: 'amber' };
    if (stage <= 12) return { name: 'THE IDENTITY', color: 'purple' };
    if (stage <= 16) return { name: 'THE BLUEPRINT', color: 'green' };
    if (stage <= 20) return { name: 'THE BUILD LOOP', color: 'orange' };
    return { name: 'LAUNCH & LEARN', color: 'red' };
  };

  // Loading state
  if (loading) {
    return (
      <div className={`${isCompact ? 'p-4' : 'p-6'} bg-gray-50 dark:bg-gray-900 min-h-screen`}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`${isCompact ? 'p-4' : 'p-6'} bg-gray-50 dark:bg-gray-900 min-h-screen`}>
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate('/ventures')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Ventures
          </button>

          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              <div>
                <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
                  Error Loading Venture
                </h2>
                <p className="text-red-600 dark:text-red-400 mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not found state
  if (!venture) {
    return (
      <div className={`${isCompact ? 'p-4' : 'p-6'} bg-gray-50 dark:bg-gray-900 min-h-screen`}>
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate('/ventures')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Ventures
          </button>

          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-12 text-center">
            <Rocket className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Venture Not Found
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              The venture you're looking for doesn't exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const phaseInfo = getPhaseInfo(venture.stage);
  const stageConfig = STAGE_CONFIG[venture.stage];

  return (
    <div className={`${isCompact ? 'p-4' : 'p-6'} bg-gray-50 dark:bg-gray-900 min-h-screen`}>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/ventures')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Ventures
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg bg-${phaseInfo.color}-100 dark:bg-${phaseInfo.color}-900/30`}>
                <Rocket className={`w-8 h-8 text-${phaseInfo.color}-600 dark:text-${phaseInfo.color}-400`} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {venture.name}
                </h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`px-2 py-1 text-xs rounded-full ${PHASE_COLORS[phaseInfo.name]}`}>
                    {phaseInfo.name}
                  </span>
                  <span className="text-sm text-gray-500">
                    Stage {venture.stage} of 25
                  </span>
                  {updating && (
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  )}
                </div>
              </div>
            </div>

            {/* Stage Progress */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {Math.round((venture.stage / 25) * 100)}%
                </div>
                <div className="text-xs text-gray-500">Complete</div>
              </div>
              <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-${phaseInfo.color}-500 transition-all duration-300`}
                  style={{ width: `${(venture.stage / 25) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Venture Metadata */}
          {venture.problem_statement && (
            <p className="mt-4 text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-4">
              {venture.problem_statement}
            </p>
          )}

          <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
            {venture.target_market && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>{venture.target_market}</span>
              </div>
            )}
            {venture.created_at && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Created {new Date(venture.created_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stage Content via StageRouter */}
      <StageRouter
        venture={venture}
        artifacts={artifacts}
        onStageChange={handleStageChange}
      />

      {/* Stage Navigation Timeline */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">
          Venture Journey
        </h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {Array.from({ length: 25 }, (_, i) => i + 1).map((stage) => {
            const isComplete = stage < venture.stage;
            const isCurrent = stage === venture.stage;
            const stagePhase = getPhaseInfo(stage);

            return (
              <button
                key={stage}
                onClick={() => handleStageChange(stage)}
                disabled={updating}
                className={`
                  flex-shrink-0 w-8 h-8 rounded-full text-xs font-medium
                  flex items-center justify-center transition-all
                  ${isComplete
                    ? `bg-${stagePhase.color}-500 text-white`
                    : isCurrent
                      ? `bg-${stagePhase.color}-100 dark:bg-${stagePhase.color}-900/30 text-${stagePhase.color}-700 dark:text-${stagePhase.color}-300 ring-2 ring-${stagePhase.color}-500`
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                  }
                  ${!updating && !isCurrent ? 'hover:scale-110 cursor-pointer' : ''}
                  ${updating ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                title={stageConfig ? `Stage ${stage}: ${STAGE_CONFIG[stage]?.title}` : `Stage ${stage}`}
              >
                {stage}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>THE TRUTH</span>
          <span>THE ENGINE</span>
          <span>THE IDENTITY</span>
          <span>THE BLUEPRINT</span>
          <span>BUILD LOOP</span>
          <span>LAUNCH</span>
        </div>
      </div>
    </div>
  );
}
