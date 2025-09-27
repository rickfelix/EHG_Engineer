import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { BacklogImportManager, StoryGenerationEngine, ReleaseGateCalculator } from '../components/backlog-import';
import { Package, Wand2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BacklogImportView = () => {
  const [activeTab, setActiveTab] = useState('import');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              EHG Backlog Import System
            </h1>
            <p className="text-gray-600">
              Import backlog items, generate user stories, and calculate release readiness
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                SD: fbe359b4-aa56-4740-8350-d51760de0a3b
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                EHG Engineer Dashboard
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Import Backlog
            </TabsTrigger>
            <TabsTrigger value="stories" className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Story Generation
            </TabsTrigger>
            <TabsTrigger value="release" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Release Gates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4">
            <BacklogImportManager />
          </TabsContent>

          <TabsContent value="stories" className="space-y-4">
            <StoryGenerationEngine />
          </TabsContent>

          <TabsContent value="release" className="space-y-4">
            <ReleaseGateCalculator />
          </TabsContent>
        </Tabs>

        {/* Footer Statistics */}
        <div className="mt-12 p-6 bg-white rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-4">System Overview</h3>
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="text-2xl font-bold text-gray-900">0</div>
              <div className="text-sm text-gray-500">Total Backlog Items</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">0</div>
              <div className="text-sm text-gray-500">AI Generated Stories</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">0%</div>
              <div className="text-sm text-gray-500">Release Readiness</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">0</div>
              <div className="text-sm text-gray-500">Active Gates</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BacklogImportView;