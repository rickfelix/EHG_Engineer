/**
 * BlueprintBrowser Component
 * Main container orchestrating blueprint grid and detail panel
 * Enhanced with AI-powered opportunity discovery
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * User Story: US-004 - Blueprint Browse Path
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Loader2, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import BlueprintGrid, { type Blueprint } from './BlueprintGrid';
import BlueprintDetailPanel from './BlueprintDetailPanel';
import ChairmanApprovalPanel from './ChairmanApprovalPanel';

interface BlueprintBrowserProps {
  onVentureCreated: (ventureId: string) => void;
  onCancel?: () => void;
}

interface VenturePayload {
  name: string;
  problem: string;
  solution: string;
  market: string;
  blueprintId: string;
}

interface DiscoveryScanResult {
  scan_id: string;
  status: 'completed' | 'failed';
  duration_ms: number;
  competitor?: string;
  summary?: {
    opportunities_found: number;
    blueprints_generated: number;
    auto_approved: number;
    pending_review: number;
    by_box: { green: number; yellow: number; red: number };
  };
  error?: string;
}

type SourceFilter = 'all' | 'ai_generated' | 'manual';
type BoxFilter = 'all' | 'green' | 'yellow' | 'red';

const BlueprintBrowser: React.FC<BlueprintBrowserProps> = ({
  onVentureCreated,
  onCancel,
}) => {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI Discovery state
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [boxFilter, setBoxFilter] = useState<BoxFilter>('all');
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<DiscoveryScanResult | null>(null);
  const [activeView, setActiveView] = useState<'browse' | 'pending'>('browse');
  const [pendingCount, setPendingCount] = useState(0);

  // Fetch pending count
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/blueprints?source=ai_generated&status=pending');
      if (res.ok) {
        const data = await res.json();
        setPendingCount((data.blueprints || []).length);
      }
    } catch {
      // Ignore errors for count
    }
  }, []);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  // Fetch blueprints with filters
  const fetchBlueprints = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (marketFilter) params.set('market', marketFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (boxFilter !== 'all') params.set('box', boxFilter);

      const url = `/api/blueprints${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error('Failed to fetch blueprints');
      }

      const data = await res.json();
      setBlueprints(data.blueprints || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setBlueprints([]);
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, marketFilter, sourceFilter, boxFilter]);

  useEffect(() => {
    fetchBlueprints();
  }, [fetchBlueprints]);

  // Filter blueprints by search query (client-side)
  const filteredBlueprints = useMemo(() => {
    if (!searchQuery.trim()) return blueprints;

    const query = searchQuery.toLowerCase();
    return blueprints.filter(
      (bp) =>
        bp.title.toLowerCase().includes(query) ||
        bp.summary.toLowerCase().includes(query) ||
        bp.problem.toLowerCase().includes(query) ||
        bp.solution.toLowerCase().includes(query)
    );
  }, [blueprints, searchQuery]);

  const handleSelect = useCallback((blueprint: Blueprint) => {
    setSelectedBlueprint(blueprint);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedBlueprint(null);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter(null);
    setMarketFilter(null);
    setSourceFilter('all');
    setBoxFilter('all');
  }, []);

  const handleCreateVenture = useCallback(
    async (data: VenturePayload) => {
      const res = await fetch('/api/ventures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          problem_statement: data.problem,
          solution: data.solution,
          target_market: data.market,
          origin_type: 'blueprint',
          blueprint_id: data.blueprintId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create venture');
      }

      const venture = await res.json();
      onVentureCreated(venture.id);
    },
    [onVentureCreated]
  );

  // AI Discovery - Trigger scan
  const handleDiscoverOpportunities = useCallback(async () => {
    if (!competitorUrl.trim()) return;

    setIsScanning(true);
    setScanResult(null);
    setError(null);

    try {
      const res = await fetch('/api/discovery/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scan_type: 'competitor',
          target_url: competitorUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Scan failed');
      }

      setScanResult(data);

      // Refresh blueprints if scan was successful
      if (data.status === 'completed' && data.summary?.blueprints_generated > 0) {
        await fetchBlueprints();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  }, [competitorUrl, fetchBlueprints]);

  const handleCloseDiscoverModal = useCallback(() => {
    setShowDiscoverModal(false);
    setCompetitorUrl('');
    setScanResult(null);
  }, []);

  // Count blueprints by box for badges
  const boxCounts = useMemo(() => {
    return blueprints.reduce(
      (acc, bp) => {
        const box = (bp as unknown as { opportunity_box?: string }).opportunity_box;
        if (box === 'green') acc.green++;
        else if (box === 'yellow') acc.yellow++;
        else if (box === 'red') acc.red++;
        return acc;
      },
      { green: 0, yellow: 0, red: 0 }
    );
  }, [blueprints]);

  return (
    <div data-testid="blueprint-browser" className="w-full max-w-7xl mx-auto p-6">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Browse Blueprint Ideas
          </h1>
          <div className="flex items-center gap-3">
            {/* Discover Opportunities Button */}
            <button
              type="button"
              onClick={() => setShowDiscoverModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white
                bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700
                transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-lg"
            >
              <Sparkles className="w-5 h-5" />
              <span className="hidden sm:inline">Discover Opportunities</span>
              <span className="sm:hidden">Discover</span>
            </button>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300
                  bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                  transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Back
              </button>
            )}
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveView('browse')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeView === 'browse'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Browse All
          </button>
          <button
            onClick={() => setActiveView('pending')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeView === 'pending'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            Pending Review
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter bar - only show on browse view */}
        {activeView === 'browse' && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Source Filter */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setSourceFilter('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                sourceFilter === 'all'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSourceFilter('ai_generated')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                sourceFilter === 'ai_generated'
                  ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI
            </button>
            <button
              onClick={() => setSourceFilter('manual')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                sourceFilter === 'manual'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Manual
            </button>
          </div>

          {/* Box Filter */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setBoxFilter('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                boxFilter === 'all'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              All Boxes
            </button>
            <button
              onClick={() => setBoxFilter('green')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                boxFilter === 'green'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Quick Wins
              {boxCounts.green > 0 && (
                <span className="text-xs bg-green-200 dark:bg-green-800 px-1.5 rounded">
                  {boxCounts.green}
                </span>
              )}
            </button>
            <button
              onClick={() => setBoxFilter('yellow')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                boxFilter === 'yellow'
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-yellow-700 dark:hover:text-yellow-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              Strategic
              {boxCounts.yellow > 0 && (
                <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-1.5 rounded">
                  {boxCounts.yellow}
                </span>
              )}
            </button>
            <button
              onClick={() => setBoxFilter('red')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                boxFilter === 'red'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-red-700 dark:hover:text-red-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Defensive
              {boxCounts.red > 0 && (
                <span className="text-xs bg-red-200 dark:bg-red-800 px-1.5 rounded">
                  {boxCounts.red}
                </span>
              )}
            </button>
          </div>
        </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800" role="alert">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Pending Review View */}
      {activeView === 'pending' && (
        <ChairmanApprovalPanel
          onApprovalComplete={() => {
            fetchPendingCount();
            fetchBlueprints();
          }}
        />
      )}

      {/* Browse View */}
      {activeView === 'browse' && (
      <div className={`${selectedBlueprint ? 'mr-0 sm:mr-96 md:mr-[480px]' : ''} transition-all duration-300`}>
        <BlueprintGrid
          blueprints={filteredBlueprints}
          selectedId={selectedBlueprint?.id || null}
          onSelect={handleSelect}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryFilter={setCategoryFilter}
          marketFilter={marketFilter}
          onMarketFilter={setMarketFilter}
          onClearFilters={handleClearFilters}
          isLoading={isLoading}
        />
      </div>
      )}

      {/* Overlay for mobile */}
      {activeView === 'browse' && selectedBlueprint && (
        <div
          className="fixed inset-0 bg-black/30 z-30 sm:hidden"
          onClick={handleClosePanel}
          aria-hidden="true"
        />
      )}

      {/* Detail Panel */}
      {activeView === 'browse' && selectedBlueprint && (
        <BlueprintDetailPanel
          blueprint={selectedBlueprint}
          onClose={handleClosePanel}
          onCreateVenture={handleCreateVenture}
        />
      )}

      {/* Discover Opportunities Modal */}
      {showDiscoverModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={handleCloseDiscoverModal}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Discover Opportunities
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Analyze competitors to find market gaps
                  </p>
                </div>
              </div>

              {!scanResult ? (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Competitor URL
                    </label>
                    <input
                      type="url"
                      value={competitorUrl}
                      onChange={(e) => setCompetitorUrl(e.target.value)}
                      placeholder="https://competitor.com"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                        bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      disabled={isScanning}
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      We'll analyze this competitor across 6 dimensions: Features, Pricing, Segments, Experience, Integrations, and Quality.
                    </p>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleCloseDiscoverModal}
                      className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300
                        hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      disabled={isScanning}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDiscoverOpportunities}
                      disabled={!competitorUrl.trim() || isScanning}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white
                        bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                        transition-colors"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Start Discovery
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {scanResult.status === 'completed' ? (
                    <>
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                        <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="font-medium text-green-800 dark:text-green-300">
                            Discovery Complete!
                          </p>
                          <p className="text-sm text-green-600 dark:text-green-400">
                            Analyzed in {(scanResult.duration_ms / 1000).toFixed(1)}s
                          </p>
                        </div>
                      </div>

                      {scanResult.summary && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                              {scanResult.summary.opportunities_found}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Opportunities Found
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                              {scanResult.summary.blueprints_generated}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Blueprints Generated
                            </p>
                          </div>

                          {/* Box breakdown */}
                          <div className="col-span-2 flex gap-2">
                            <div className="flex-1 p-2 rounded bg-green-100 dark:bg-green-900/30 text-center">
                              <p className="text-lg font-bold text-green-700 dark:text-green-400">
                                {scanResult.summary.by_box.green}
                              </p>
                              <p className="text-xs text-green-600 dark:text-green-500">Green</p>
                            </div>
                            <div className="flex-1 p-2 rounded bg-yellow-100 dark:bg-yellow-900/30 text-center">
                              <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">
                                {scanResult.summary.by_box.yellow}
                              </p>
                              <p className="text-xs text-yellow-600 dark:text-yellow-500">Yellow</p>
                            </div>
                            <div className="flex-1 p-2 rounded bg-red-100 dark:bg-red-900/30 text-center">
                              <p className="text-lg font-bold text-red-700 dark:text-red-400">
                                {scanResult.summary.by_box.red}
                              </p>
                              <p className="text-xs text-red-600 dark:text-red-500">Red</p>
                            </div>
                          </div>

                          {scanResult.summary.auto_approved > 0 && (
                            <div className="col-span-2 flex items-center gap-2 p-2 rounded bg-purple-50 dark:bg-purple-900/20">
                              <AlertCircle className="w-4 h-4 text-purple-600" />
                              <p className="text-sm text-purple-700 dark:text-purple-300">
                                {scanResult.summary.auto_approved} auto-approved (85%+ confidence)
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
                      <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                      <div>
                        <p className="font-medium text-red-800 dark:text-red-300">
                          Discovery Failed
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {scanResult.error || 'Unknown error occurred'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setScanResult(null);
                        setCompetitorUrl('');
                      }}
                      className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300
                        hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Scan Another
                    </button>
                    <button
                      onClick={handleCloseDiscoverModal}
                      className="px-4 py-2 rounded-lg font-medium text-white
                        bg-purple-600 hover:bg-purple-700 transition-colors"
                    >
                      View Blueprints
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BlueprintBrowser;
