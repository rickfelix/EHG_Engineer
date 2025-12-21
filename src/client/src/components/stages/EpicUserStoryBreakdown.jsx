/**
 * EpicUserStoryBreakdown Component - Stage 15
 * Epic & User Story Development Interface
 *
 * SD: SD-IND-B-STAGES-12-16 (Block B: Sales & Operational Flow)
 * Phase: THE BLUEPRINT
 */

import React, { useState } from 'react';
import { FileCode, BookOpen, Users, CheckSquare, ChevronRight, ChevronLeft, Plus, GripVertical, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const SAMPLE_EPICS = [
  {
    id: 1,
    title: 'User Authentication',
    stories: [
      { id: 1, title: 'As a user, I can sign up with email', points: 3, status: 'done' },
      { id: 2, title: 'As a user, I can log in with email/password', points: 2, status: 'done' },
      { id: 3, title: 'As a user, I can reset my password', points: 2, status: 'todo' }
    ]
  },
  {
    id: 2,
    title: 'Product Catalog',
    stories: [
      { id: 4, title: 'As a user, I can browse products', points: 3, status: 'todo' },
      { id: 5, title: 'As a user, I can search products', points: 5, status: 'todo' },
      { id: 6, title: 'As a user, I can filter by category', points: 3, status: 'todo' }
    ]
  }
];

const DEFAULT_STORIES_DATA = { epics: SAMPLE_EPICS, selectedEpic: 0 };

export default function EpicUserStoryBreakdown({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: storiesData,
    setData: setStoriesData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 15, 'user_stories', DEFAULT_STORIES_DATA);

  const currentData = storiesData || DEFAULT_STORIES_DATA;
  const epics = currentData.epics;
  const selectedEpic = currentData.selectedEpic;

  const setEpics = (value) => {
    setStoriesData(prev => ({ ...(prev || DEFAULT_STORIES_DATA), epics: value }));
  };

  const setSelectedEpic = (value) => {
    setStoriesData(prev => ({ ...(prev || DEFAULT_STORIES_DATA), selectedEpic: value }));
  };

  const handleSave = async () => {
    await saveArtifact(currentData, 'User Stories');
  };

  const handleComplete = async () => {
    await saveArtifact(currentData, 'User Stories');
    onStageComplete?.();
  };

  const totalPoints = epics.reduce((sum, epic) =>
    sum + epic.stories.reduce((s, story) => s + story.points, 0), 0);

  const completedPoints = epics.reduce((sum, epic) =>
    sum + epic.stories.filter(s => s.status === 'done').reduce((s, story) => s + story.points, 0), 0);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading user stories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
              <FileCode className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 15: Epic & User Story Breakdown</h2>
              <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">THE BLUEPRINT</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">{completedPoints}/{totalPoints}</div>
            <div className="text-xs text-gray-500">Story Points</div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700">
        {/* Epics List */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Epics</h3>
          <div className="space-y-2">
            {epics.map((epic, idx) => (
              <button
                key={epic.id}
                onClick={() => setSelectedEpic(idx)}
                className={`w-full p-3 rounded-lg text-left transition-all ${
                  selectedEpic === idx
                    ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-2 border-transparent hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-gray-900 dark:text-gray-100">{epic.title}</div>
                <div className="text-xs text-gray-500">{epic.stories.length} stories</div>
              </button>
            ))}
            <button className="flex items-center gap-2 w-full p-3 border-2 border-dashed rounded-lg text-gray-500 hover:border-green-500 hover:text-green-500">
              <Plus className="w-4 h-4" /> Add Epic
            </button>
          </div>
        </div>

        {/* Stories */}
        <div className="col-span-2 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
            User Stories - {epics[selectedEpic]?.title}
          </h3>
          <div className="space-y-3">
            {epics[selectedEpic]?.stories.map((story) => (
              <div key={story.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                <CheckSquare className={`w-5 h-5 ${story.status === 'done' ? 'text-green-500' : 'text-gray-300'}`} />
                <div className="flex-1">
                  <div className={`text-sm ${story.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {story.title}
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${
                  story.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {story.points} pts
                </span>
              </div>
            ))}
            <button className="flex items-center gap-2 w-full p-3 border-2 border-dashed rounded-lg text-gray-500 hover:border-green-500 hover:text-green-500">
              <Plus className="w-4 h-4" /> Add Story
            </button>
          </div>
        </div>
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
        <button onClick={handleComplete} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
