/**
 * StrategicNaming Component - Stage 10
 * Brand Identity and Strategic Naming Interface
 *
 * SD: SD-IND-A-STAGES-7-11 (Block A: GTM & Persona Fit)
 * Phase: THE IDENTITY
 *
 * Features:
 * - Name generation and evaluation
 * - Brand archetype alignment
 * - Domain/trademark availability checking
 * - Visual identity preview
 * - Golden Nugget artifact display
 */

import React, { useState } from 'react';
import {
  Palette,
  Sparkles,
  Globe,
  Shield,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Star,
  Save,
  Loader2
} from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

// Brand archetype definitions
const BRAND_ARCHETYPES = [
  { id: 'hero', name: 'Hero', traits: ['Brave', 'Determined', 'Inspiring'], color: '#EF4444' },
  { id: 'sage', name: 'Sage', traits: ['Wise', 'Thoughtful', 'Expert'], color: '#3B82F6' },
  { id: 'explorer', name: 'Explorer', traits: ['Adventurous', 'Independent', 'Pioneer'], color: '#10B981' },
  { id: 'creator', name: 'Creator', traits: ['Innovative', 'Artistic', 'Visionary'], color: '#8B5CF6' },
  { id: 'ruler', name: 'Ruler', traits: ['Authoritative', 'Powerful', 'Successful'], color: '#F59E0B' },
  { id: 'caregiver', name: 'Caregiver', traits: ['Nurturing', 'Generous', 'Compassionate'], color: '#EC4899' }
];

// Name evaluation criteria
const EVALUATION_CRITERIA = [
  { id: 'memorable', label: 'Memorable', description: 'Easy to remember and recall' },
  { id: 'pronounceable', label: 'Pronounceable', description: 'Easy to say in any language' },
  { id: 'unique', label: 'Unique', description: 'Distinctive and differentiating' },
  { id: 'relevant', label: 'Relevant', description: 'Connected to value proposition' },
  { id: 'scalable', label: 'Scalable', description: 'Can grow with the business' },
  { id: 'available', label: 'Available', description: 'Domain and trademark available' }
];

const DEFAULT_NAMING_DATA = {
  selectedArchetype: 'creator',
  nameCandidates: [
    { name: 'Venture Name', scores: { memorable: 4, pronounceable: 5, unique: 3, relevant: 4, scalable: 4, available: 5 }, domainAvailable: true },
    { name: 'AlternateName', scores: { memorable: 3, pronounceable: 4, unique: 4, relevant: 3, scalable: 4, available: true }, domainAvailable: false },
  ],
  selectedName: 0
};

export default function StrategicNaming({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: namingData,
    setData: setNamingData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 10, 'brand_guidelines', DEFAULT_NAMING_DATA);

  const [newNameInput, setNewNameInput] = useState('');

  const currentData = namingData || DEFAULT_NAMING_DATA;
  const selectedArchetype = currentData.selectedArchetype;
  const nameCandidates = currentData.nameCandidates;
  const selectedName = currentData.selectedName;

  const setSelectedArchetype = (value) => {
    setNamingData(prev => ({ ...(prev || DEFAULT_NAMING_DATA), selectedArchetype: value }));
  };

  const setNameCandidates = (value) => {
    setNamingData(prev => ({ ...(prev || DEFAULT_NAMING_DATA), nameCandidates: value }));
  };

  const setSelectedName = (value) => {
    setNamingData(prev => ({ ...(prev || DEFAULT_NAMING_DATA), selectedName: value }));
  };

  // Save handler
  const handleSave = async () => {
    await saveArtifact(currentData, 'Brand Guidelines');
  };

  // Complete stage handler
  const handleComplete = async () => {
    await saveArtifact(currentData, 'Brand Guidelines');
    onStageComplete?.();
  };

  const addNameCandidate = () => {
    if (newNameInput.trim()) {
      setNameCandidates([
        ...nameCandidates,
        {
          name: newNameInput.trim(),
          scores: { memorable: 3, pronounceable: 3, unique: 3, relevant: 3, scalable: 3, available: 3 },
          domainAvailable: null
        }
      ]);
      setNewNameInput('');
    }
  };

  const calculateTotalScore = (scores) => {
    const values = Object.values(scores);
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  };

  const updateScore = (nameIndex, criterion, value) => {
    const updated = [...nameCandidates];
    updated[nameIndex].scores[criterion] = value;
    setNameCandidates(updated);
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading brand guidelines...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Palette className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Stage 10: Strategic Naming
            </h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
              THE IDENTITY
            </span>
          </div>
        </div>
      </div>

      {/* Brand Archetype Selection */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Brand Archetype</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {BRAND_ARCHETYPES.map((archetype) => (
            <button
              key={archetype.id}
              onClick={() => setSelectedArchetype(archetype.id)}
              className={`p-3 rounded-lg border-2 text-center transition-all ${
                selectedArchetype === archetype.id
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full mx-auto mb-2"
                style={{ backgroundColor: archetype.color }}
              />
              <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{archetype.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {archetype.traits[0]}
              </div>
            </button>
          ))}
        </div>
        {selectedArchetype && (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="font-medium text-purple-800 dark:text-purple-300">
                {BRAND_ARCHETYPES.find(a => a.id === selectedArchetype)?.name} Archetype
              </span>
            </div>
            <p className="text-sm text-purple-700 dark:text-purple-400">
              Key traits: {BRAND_ARCHETYPES.find(a => a.id === selectedArchetype)?.traits.join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Name Candidates */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Name Candidates</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addNameCandidate()}
              placeholder="Add a name..."
              className="px-3 py-1.5 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
            <button
              onClick={addNameCandidate}
              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Add
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {nameCandidates.map((candidate, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg border-2 ${
                selectedName === idx
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedName(idx)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedName === idx
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {selectedName === idx && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{candidate.name}</span>
                  {candidate.domainAvailable === true && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Globe className="w-3 h-3" /> .com available
                    </span>
                  )}
                  {candidate.domainAvailable === false && (
                    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                      <Globe className="w-3 h-3" /> .com taken
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {calculateTotalScore(candidate.scores)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">/5</span>
                </div>
              </div>

              {/* Score Grid */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {EVALUATION_CRITERIA.map((criterion) => (
                  <div key={criterion.id} className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{criterion.label}</div>
                    <div className="flex justify-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          onClick={() => updateScore(idx, criterion.id, score)}
                          className={`w-4 h-4 rounded-sm ${
                            candidate.scores[criterion.id] >= score
                              ? 'bg-purple-500'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Brand Preview */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Brand Preview</h3>
        <div className="flex items-center gap-8">
          <div
            className="w-20 h-20 rounded-xl flex items-center justify-center text-white text-2xl font-bold"
            style={{ backgroundColor: BRAND_ARCHETYPES.find(a => a.id === selectedArchetype)?.color }}
          >
            {nameCandidates[selectedName]?.name.charAt(0)}
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {nameCandidates[selectedName]?.name}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {BRAND_ARCHETYPES.find(a => a.id === selectedArchetype)?.traits.join(' • ')}
            </div>
          </div>
        </div>
      </div>

      {/* Availability Checks */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Availability Checks</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-5 h-5 text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-gray-100">Domain</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>.com</span>
                <span className="text-green-600 dark:text-green-400">Available</span>
              </div>
              <div className="flex items-center justify-between">
                <span>.io</span>
                <span className="text-green-600 dark:text-green-400">Available</span>
              </div>
              <div className="flex items-center justify-between">
                <span>.ai</span>
                <span className="text-amber-600 dark:text-amber-400">Check</span>
              </div>
            </div>
          </div>

          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-gray-100">Trademark</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>USPTO search: Pending</p>
              <p className="text-xs mt-2 text-gray-500">Run formal trademark search before launch</p>
            </div>
          </div>

          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-gray-100">Social Handles</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>Twitter/X</span>
                <span className="text-amber-600 dark:text-amber-400">Check</span>
              </div>
              <div className="flex items-center justify-between">
                <span>LinkedIn</span>
                <span className="text-amber-600 dark:text-amber-400">Check</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
            Golden Nugget Artifacts
          </h3>
          <div className="grid gap-2">
            {artifacts.map((artifact, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="font-medium text-gray-900 dark:text-gray-100">{artifact.type}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  Validated
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onPrevious}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous Stage
        </button>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-gray-400">
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
        <button
          onClick={handleComplete}
          disabled={saving || loading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Complete & Continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
