import React, { useState, useEffect } from 'react';
import { Wand2, RefreshCw, Save, Edit, CheckCircle, AlertCircle, Sparkles, FileText } from 'lucide-react';
import { supabase } from '../../config/supabase';

const StoryGenerationEngine = () => {
  const [backlogItems, setBacklogItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [generatedStory, setGeneratedStory] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [storyStats, setStoryStats] = useState({
    total: 0,
    generated: 0,
    manual: 0,
    verified: 0
  });

  useEffect(() => {
    fetchBacklogItems();
    fetchStoryStats();
  }, []);

  // Fetch backlog items
  const fetchBacklogItems = async () => {
    try {
      const { data, error } = await supabase
        .from('backlog_items')
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBacklogItems(data || []);
    } catch (error) {
      console.error('Error fetching backlog items:', error);
    }
  };

  // Fetch story statistics
  const fetchStoryStats = async () => {
    try {
      const { data: stories, error } = await supabase
        .from('user_stories')
        .select('id, is_generated, verification_status');

      if (error) throw error;

      const stats = {
        total: stories.length,
        generated: stories.filter(s => s.is_generated).length,
        manual: stories.filter(s => !s.is_generated).length,
        verified: stories.filter(s => s.verification_status === 'verified').length
      };

      setStoryStats(stats);
    } catch (error) {
      console.error('Error fetching story stats:', error);
    }
  };

  // Generate user story using AI simulation
  const generateStory = async (item) => {
    setIsGenerating(true);
    setSelectedItem(item);

    // Simulate AI generation with template-based approach
    await new Promise(resolve => setTimeout(resolve, 1500));

    const story = {
      title: item.title,
      user_story: generateUserStoryText(item),
      acceptance_criteria: generateAcceptanceCriteria(item),
      technical_notes: generateTechnicalNotes(item),
      estimated_effort: item.estimated_effort || 'medium',
      priority: item.priority,
      tags: extractTags(item),
      is_generated: true,
      backlog_item_id: item.id,
      created_at: new Date().toISOString()
    };

    setGeneratedStory(story);
    setIsGenerating(false);
  };

  // Generate user story text
  const generateUserStoryText = (item) => {
    const templates = [
      `As a ${identifyRole(item)}, I want to ${extractAction(item)} so that ${extractBenefit(item)}`,
      `As a ${identifyRole(item)}, I need ${extractFeature(item)} in order to ${extractGoal(item)}`,
      `As a ${identifyRole(item)}, I would like to ${extractAction(item)} to ${extractOutcome(item)}`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  };

  // Helper functions for story generation
  const identifyRole = (item) => {
    const roles = ['user', 'administrator', 'developer', 'customer', 'manager'];
    if (item.category === 'admin') return 'administrator';
    if (item.category === 'development') return 'developer';
    return roles[Math.floor(Math.random() * roles.length)];
  };

  const extractAction = (item) => {
    return item.title.toLowerCase().replace(/^(add|create|implement|build|develop)\s+/, '');
  };

  const extractFeature = (item) => {
    return item.title.toLowerCase();
  };

  const extractBenefit = (item) => {
    const benefits = [
      'improve efficiency',
      'save time',
      'enhance user experience',
      'increase productivity',
      'streamline workflows'
    ];
    return item.description?.substring(0, 50) || benefits[Math.floor(Math.random() * benefits.length)];
  };

  const extractGoal = (item) => {
    return 'achieve better results';
  };

  const extractOutcome = (item) => {
    return 'complete tasks more efficiently';
  };

  // Generate acceptance criteria
  const generateAcceptanceCriteria = (item) => {
    const criteria = [
      `The ${extractFeature(item)} should be accessible to authorized users`,
      `System should provide feedback on successful completion`,
      `Feature should handle error cases gracefully`,
      `Performance should meet defined SLA requirements`,
      `User interface should be intuitive and responsive`
    ];

    // Add specific criteria based on priority
    if (item.priority === 'high' || item.priority === 'critical') {
      criteria.push('Feature should include comprehensive logging');
      criteria.push('Security measures should be implemented');
    }

    return criteria.slice(0, 4 + Math.floor(Math.random() * 2));
  };

  // Generate technical notes
  const generateTechnicalNotes = (item) => {
    const notes = [];

    if (item.category === 'frontend') {
      notes.push('Ensure responsive design for mobile devices');
      notes.push('Implement proper state management');
    }

    if (item.category === 'backend') {
      notes.push('Implement proper error handling and logging');
      notes.push('Ensure API endpoints follow RESTful principles');
    }

    if (item.priority === 'high' || item.priority === 'critical') {
      notes.push('Include unit tests with minimum 80% coverage');
      notes.push('Document API changes in technical documentation');
    }

    return notes;
  };

  // Extract tags from item
  const extractTags = (item) => {
    const tags = [item.category];
    if (item.priority) tags.push(item.priority);
    if (item.estimated_effort) tags.push(item.estimated_effort);
    return tags.filter(Boolean);
  };

  const handleKeyDown = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };

  // Save generated story
  const saveStory = async () => {
    if (!generatedStory) return;

    try {
      const { data, error } = await supabase
        .from('user_stories')
        .insert([generatedStory])
        .select();

      if (error) throw error;

      // Update backlog item with story reference
      await supabase
        .from('backlog_items')
        .update({ user_story_id: data[0].id })
        .eq('id', selectedItem.id);

      alert('User story saved successfully!');
      setGeneratedStory(null);
      setSelectedItem(null);
      fetchBacklogItems();
      fetchStoryStats();
    } catch (error) {
      console.error('Error saving story:', error);
      alert('Failed to save user story');
    }
  };

  // Update story content
  const updateStoryContent = (field, value) => {
    setGeneratedStory(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center">
          <Sparkles className="h-6 w-6 mr-2 text-yellow-500" />
          AI Story Generation Engine
        </h2>
        <p className="text-gray-600">Generate user stories from backlog items using AI</p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-gray-800">{storyStats.total}</div>
          <div className="text-sm text-gray-600">Total Stories</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{storyStats.generated}</div>
          <div className="text-sm text-gray-600">AI Generated</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{storyStats.manual}</div>
          <div className="text-sm text-gray-600">Manual</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{storyStats.verified}</div>
          <div className="text-sm text-gray-600">Verified</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Backlog Items */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Backlog Items</h3>
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {backlogItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => !isGenerating && generateStory(item)}
                  onKeyDown={(e) => handleKeyDown(e, () => !isGenerating && generateStory(item))}
                  tabIndex="0"
                  role="button"
                  aria-label={`Generate story for ${item.title}`}
                  className={`p-3 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedItem?.id === item.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{item.title}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {item.description?.substring(0, 100)}...
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          item.priority === 'high' ? 'bg-red-100 text-red-700' :
                          item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {item.priority}
                        </span>
                        {item.user_story_id && (
                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded flex items-center">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Has Story
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        generateStory(item);
                      }}
                      aria-label="Generate story for this item" className="ml-2 p-2 text-blue-600 hover:bg-blue-50 rounded"
                      disabled={isGenerating}
                    >
                      <Wand2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Generated Story */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Generated User Story</h3>

          {isGenerating && (
            <div className="border rounded-lg p-8 flex flex-col items-center justify-center">
              <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mb-3" />
              <p className="text-gray-600">Generating user story...</p>
            </div>
          )}

          {generatedStory && !isGenerating && (
            <div className="border rounded-lg p-4">
              <div className="space-y-4">
                {/* User Story */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    User Story
                  </label>
                  <textarea id="generated-user-story"
                    value={generatedStory.user_story}
                    onChange={(e) => updateStoryContent('user_story', e.target.value)}
                    disabled={!editMode}
                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    rows={3}
                  />
                </div>

                {/* Acceptance Criteria */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Acceptance Criteria
                  </label>
                  <div className="space-y-2">
                    {generatedStory.acceptance_criteria.map((criteria, index) => (
                      <div key={index} className="flex items-start">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                        <input
                          type="text"
                          value={criteria}
                          onChange={(e) => {
                            const newCriteria = [...generatedStory.acceptance_criteria];
                            newCriteria[index] = e.target.value;
                            updateStoryContent('acceptance_criteria', newCriteria);
                          }}
                          disabled={!editMode}
                          className="flex-1 px-2 py-1 border rounded text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Technical Notes */}
                {generatedStory.technical_notes.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Technical Notes
                    </label>
                    <ul className="list-disc list-inside space-y-1">
                      {generatedStory.technical_notes.map((note, index) => (
                        <li key={index} className="text-sm text-gray-600">{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {generatedStory.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {editMode ? 'Done Editing' : 'Edit'}
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => generateStory(selectedItem)}
                      className="px-4 py-2 text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 flex items-center"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerate
                    </button>
                    <button
                      onClick={saveStory}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Story
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!generatedStory && !isGenerating && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">Select a backlog item to generate a user story</p>
              <p className="text-sm text-gray-500 mt-1">AI will create acceptance criteria and technical notes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StoryGenerationEngine;