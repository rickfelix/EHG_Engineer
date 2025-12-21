/**
 * VenturesManager Component
 * Displays ventures dashboard and handles venture creation flow
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Rocket,
  Plus,
  Search,
  Filter,
  TrendingUp,
  Building2,
  Users,
  DollarSign,
  Calendar,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import SmartRefreshButton from './SmartRefreshButton';
import VentureCreationFlow from './VentureCreationFlow';

function VenturesManager({ isCompact, onRefresh }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ventures, setVentures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [showCreationFlow, setShowCreationFlow] = useState(false);
  const [error, setError] = useState(null);

  // Load ventures data
  useEffect(() => {
    const loadVentures = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/ventures');
        if (!response.ok) {
          throw new Error('Failed to fetch ventures');
        }
        const data = await response.json();
        setVentures(data || []);
      } catch (error) {
        console.error('Error loading ventures:', error);
        setError(error.message);
        setVentures([]);
      } finally {
        setLoading(false);
      }
    };

    loadVentures();
  }, []);

  // Filter ventures
  const filteredVentures = ventures.filter(venture => {
    const matchesSearch = !searchQuery ||
      venture.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      venture.problem_statement?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStage = stageFilter === 'all' || venture.stage === parseInt(stageFilter);

    return matchesSearch && matchesStage;
  });

  const handleCreateVenture = () => {
    setShowCreationFlow(true);
  };

  const handleCancelCreation = () => {
    setShowCreationFlow(false);
  };

  const handleVentureCreated = (venture) => {
    setVentures(prev => [venture, ...prev]);
    setShowCreationFlow(false);
    // Optionally navigate to the new venture detail view
    if (venture.id) {
      navigate(`/ventures/${venture.id}`);
    }
  };

  const getStageLabel = (stage) => {
    // 25-stage Venture Vision v2.0 lifecycle labels
    const labels = {
      // Phase 1: THE TRUTH (Stages 1-5)
      1: 'Draft Idea',
      2: 'AI Critique',
      3: 'Market Validation',
      4: 'Competitive Intel',
      5: 'Profitability',
      // Phase 2: THE ENGINE (Stages 6-9)
      6: 'Risk Matrix',
      7: 'Pricing Strategy',
      8: 'Business Model',
      9: 'Exit Design',
      // Phase 3: THE IDENTITY (Stages 10-12)
      10: 'Strategic Naming',
      11: 'Go-to-Market',
      12: 'Sales Logic',
      // Phase 4: THE BLUEPRINT (Stages 13-16)
      13: 'Tech Stack',
      14: 'Data Model',
      15: 'User Stories',
      16: 'Schema Gen',
      // Phase 5: THE BUILD LOOP (Stages 17-20)
      17: 'Env Config',
      18: 'MVP Dev',
      19: 'Integration',
      20: 'Security',
      // Phase 6: LAUNCH & LEARN (Stages 21-25)
      21: 'QA & UAT',
      22: 'Deployment',
      23: 'Launch',
      24: 'Analytics',
      25: 'Scale & Exit'
    };
    return labels[stage] || `Stage ${stage}`;
  };

  const getOriginIcon = (originType) => {
    switch (originType) {
      case 'manual':
        return '✍️';
      case 'competitor_clone':
        return '🔄';
      case 'blueprint':
        return '📋';
      default:
        return '💡';
    }
  };

  if (showCreationFlow) {
    return (
      <VentureCreationFlow
        onCancel={handleCancelCreation}
        onVentureCreated={handleVentureCreated}
      />
    );
  }

  return (
    <div className={`${isCompact ? 'p-4' : 'p-6'} bg-gray-50 dark:bg-gray-900 min-h-screen`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <Rocket className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Ventures Dashboard
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {filteredVentures.length} {filteredVentures.length === 1 ? 'venture' : 'ventures'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SmartRefreshButton onRefresh={onRefresh} />
          <button
            data-testid="create-venture-btn"
            onClick={handleCreateVenture}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700
              text-white font-medium rounded-lg transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Plus className="w-5 h-5" />
            <span>Create New Venture</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search ventures..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600
                rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Stage Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600
                rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              <option value="all">All Stages</option>
              <optgroup label="THE TRUTH">
                <option value="1">Stage 1: Draft Idea</option>
                <option value="2">Stage 2: AI Critique</option>
                <option value="3">Stage 3: Market Validation</option>
                <option value="4">Stage 4: Competitive Intel</option>
                <option value="5">Stage 5: Profitability</option>
              </optgroup>
              <optgroup label="THE ENGINE">
                <option value="6">Stage 6: Risk Matrix</option>
                <option value="7">Stage 7: Pricing Strategy</option>
                <option value="8">Stage 8: Business Model</option>
                <option value="9">Stage 9: Exit Design</option>
              </optgroup>
              <optgroup label="THE IDENTITY">
                <option value="10">Stage 10: Strategic Naming</option>
                <option value="11">Stage 11: Go-to-Market</option>
                <option value="12">Stage 12: Sales Logic</option>
              </optgroup>
              <optgroup label="THE BLUEPRINT">
                <option value="13">Stage 13: Tech Stack</option>
                <option value="14">Stage 14: Data Model</option>
                <option value="15">Stage 15: User Stories</option>
                <option value="16">Stage 16: Schema Gen</option>
              </optgroup>
              <optgroup label="THE BUILD LOOP">
                <option value="17">Stage 17: Env Config</option>
                <option value="18">Stage 18: MVP Dev</option>
                <option value="19">Stage 19: Integration</option>
                <option value="20">Stage 20: Security</option>
              </optgroup>
              <optgroup label="LAUNCH & LEARN">
                <option value="21">Stage 21: QA & UAT</option>
                <option value="22">Stage 22: Deployment</option>
                <option value="23">Stage 23: Launch</option>
                <option value="24">Stage 24: Analytics</option>
                <option value="25">Stage 25: Scale & Exit</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-red-800 dark:text-red-200">
              Error loading ventures: {error}
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredVentures.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Rocket className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {searchQuery || stageFilter !== 'all' ? 'No ventures found' : 'No ventures yet'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {searchQuery || stageFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Get started by creating your first venture'}
          </p>
          {!searchQuery && stageFilter === 'all' && (
            <button
              onClick={handleCreateVenture}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700
                text-white font-medium rounded-lg transition-all duration-200"
            >
              <Plus className="w-5 h-5" />
              <span>Create Your First Venture</span>
            </button>
          )}
        </div>
      )}

      {/* Ventures Grid */}
      {!loading && !error && filteredVentures.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVentures.map((venture) => (
            <div
              key={venture.id}
              onClick={() => navigate(`/ventures/${venture.id}`)}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200
                dark:border-gray-700 p-6 hover:shadow-lg transition-all duration-200 cursor-pointer
                group"
            >
              {/* Venture Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getOriginIcon(venture.origin_type)}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100
                      group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {venture.name}
                    </h3>
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30
                      text-blue-700 dark:text-blue-300 font-medium">
                      {getStageLabel(venture.stage)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600
                  dark:group-hover:text-blue-400 transition-colors" />
              </div>

              {/* Problem Statement */}
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4">
                {venture.problem_statement}
              </p>

              {/* Metadata */}
              <div className="space-y-2 text-xs text-gray-500 dark:text-gray-500">
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
          ))}
        </div>
      )}
    </div>
  );
}

export default VenturesManager;
