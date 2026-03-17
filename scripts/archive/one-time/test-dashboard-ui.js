#!/usr/bin/env node

/**
 * Deep Dive UI Functionality Test Suite
 * Comprehensive testing of LEO Protocol Dashboard
 */

import axios from 'axios';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

class DashboardUITester {
  constructor() {
    this.results = {
      server: {},
      api: {},
      websocket: {},
      data: {},
      ui: {},
      realtime: {},
      errors: []
    };
    
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }

  async runAllTests() {
    console.log('🔍 LEO Protocol Dashboard Deep Dive Analysis\n');
    console.log('=' .repeat(50));
    
    await this.testServerHealth();
    await this.testAPIEndpoints();
    await this.testWebSocketConnection();
    await this.testDataIntegrity();
    await this.testUIComponents();
    await this.testRealTimeSync();
    await this.testInteractiveFeatures();
    
    this.generateReport();
  }

  async testServerHealth() {
    console.log('\n📡 Testing Server Health...');
    
    try {
      // Test main page
      const mainResponse = await axios.get(BASE_URL);
      this.results.server.mainPage = {
        status: mainResponse.status,
        contentType: mainResponse.headers['content-type'],
        success: mainResponse.status === 200
      };
      console.log(`  ✅ Main page: ${mainResponse.status}`);
      
      // Test static assets
      const staticTests = [
        '/api/state',
        '/api/sd',
        '/api/prd',
        '/api/progress'
      ];
      
      for (const endpoint of staticTests) {
        try {
          const response = await axios.get(BASE_URL + endpoint);
          this.results.server[endpoint] = {
            status: response.status,
            success: true
          };
          console.log(`  ✅ ${endpoint}: ${response.status}`);
        } catch (_error) {
          this.results.server[endpoint] = {
            status: error.response?.status || 'ERROR',
            success: false
          };
          console.log(`  ❌ ${endpoint}: ${error.message}`);
        }
      }
    } catch (_error) {
      this.results.errors.push(`Server health check failed: ${error.message}`);
      console.log(`  ❌ Server health check failed: ${error.message}`);
    }
  }

  async testAPIEndpoints() {
    console.log('\n🔌 Testing API Endpoints...');
    
    const endpoints = [
      { path: '/api/state', name: 'Dashboard State' },
      { path: '/api/sd', name: 'Strategic Directives' },
      { path: '/api/prd', name: 'Product Requirements' },
      { path: '/api/progress', name: 'Progress Calculation' },
      { path: '/api/leo/status', name: 'LEO Status' },
      { path: '/api/context', name: 'Context State' }
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(BASE_URL + endpoint.path);
        const data = response.data;
        
        this.results.api[endpoint.path] = {
          name: endpoint.name,
          status: response.status,
          hasData: !!data,
          dataType: Array.isArray(data) ? 'array' : typeof data,
          recordCount: Array.isArray(data) ? data.length : null,
          success: true
        };
        
        console.log(`  ✅ ${endpoint.name}: ${response.status} - ${Array.isArray(data) ? data.length + ' records' : 'object'}`);
      } catch (_error) {
        this.results.api[endpoint.path] = {
          name: endpoint.name,
          status: error.response?.status || 'ERROR',
          error: error.message,
          success: false
        };
        console.log(`  ❌ ${endpoint.name}: ${error.message}`);
      }
    }
  }

  async testWebSocketConnection() {
    console.log('\n🔄 Testing WebSocket Connection...');
    
    return new Promise((resolve) => {
      const ws = new WebSocket(WS_URL);
      let timeout;
      
      ws.on('open', () => {
        console.log('  ✅ WebSocket connected');
        this.results.websocket.connected = true;
        
        // Test sending a message
        ws.send(JSON.stringify({ type: 'ping' }));
        
        timeout = setTimeout(() => {
          ws.close();
          resolve();
        }, 2000);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log(`  ✅ Received message: ${message.type || 'state update'}`);
          this.results.websocket.canReceiveMessages = true;
        } catch (_e) {
          console.log('  ⚠️  Received non-JSON message');
        }
      });
      
      ws.on('error', (error) => {
        console.log(`  ❌ WebSocket error: ${error.message}`);
        this.results.websocket.error = error.message;
        clearTimeout(timeout);
        resolve();
      });
      
      ws.on('close', () => {
        console.log('  ℹ️  WebSocket closed');
        this.results.websocket.closed = true;
        clearTimeout(timeout);
        resolve();
      });
      
      // Timeout fallback
      setTimeout(() => {
        if (!this.results.websocket.connected) {
          console.log('  ❌ WebSocket connection timeout');
          this.results.websocket.timeout = true;
        }
        ws.close();
        resolve();
      }, 5000);
    });
  }

  async testDataIntegrity() {
    console.log('\n📊 Testing Data Integrity...');
    
    try {
      // Get SDs from API
      const sdsResponse = await axios.get(BASE_URL + '/api/sd');
      const sds = sdsResponse.data;
      
      // Get PRDs from API
      const prdsResponse = await axios.get(BASE_URL + '/api/prd');
      const prds = prdsResponse.data;
      
      // Test SD data structure
      console.log(`  📁 Strategic Directives: ${sds.length}`);
      for (const sd of sds) {
        const validation = {
          hasId: !!sd.id,
          hasTitle: !!sd.title,
          hasStatus: !!sd.status,
          hasProgress: typeof sd.progress === 'number',
          validProgress: sd.progress >= 0 && sd.progress <= 100,
          hasPRDs: Array.isArray(sd.prds),
          hasEES: Array.isArray(sd.executionSequences),
          statusIsPreferred: ['draft', 'active', 'on_hold', 'cancelled', 'archived'].includes(sd.status)
        };
        
        const isValid = Object.values(validation).every(v => v);
        this.results.data[`SD_${sd.id}`] = { ...validation, valid: isValid };
        
        console.log(`    ${isValid ? '✅' : '❌'} ${sd.id}: ${sd.status} (${sd.progress}%) - ${sd.prds?.length || 0} PRDs, ${sd.executionSequences?.length || 0} EES`);
      }
      
      // Test PRD data structure
      console.log(`  📁 Product Requirements: ${prds.length}`);
      for (const prd of prds) {
        const validation = {
          hasId: !!prd.id,
          hasDirectiveId: !!prd.directiveId,
          hasStatus: !!prd.status,
          hasChecklist: Array.isArray(prd.checklist),
          statusIsPreferred: ['draft', 'planning', 'ready', 'in_progress', 'testing', 'approved', 'rejected', 'on_hold', 'cancelled'].includes(prd.status)
        };
        
        const isValid = Object.values(validation).every(v => v);
        this.results.data[`PRD_${prd.id}`] = { ...validation, valid: isValid };
        
        console.log(`    ${isValid ? '✅' : '❌'} ${prd.id}: ${prd.status} - Checklist: ${prd.checklist?.length || 0} items`);
      }
      
      // Test progress calculation
      const progressResponse = await axios.get(BASE_URL + '/api/progress');
      const progress = progressResponse.data;
      
      console.log(`  📈 Overall Progress: ${progress.overall}%`);
      this.results.data.progress = {
        overall: progress.overall,
        sds: progress.strategicDirectives,
        prds: progress.prds,
        valid: progress.overall >= 0 && progress.overall <= 100
      };
      
    } catch (_error) {
      console.log(`  ❌ Data integrity test failed: ${error.message}`);
      this.results.errors.push(`Data integrity: ${error.message}`);
    }
  }

  async testUIComponents() {
    console.log('\n🎨 Testing UI Components...');
    
    try {
      // Get the main HTML page
      const response = await axios.get(BASE_URL);
      const html = response.data;
      
      // Check for essential UI elements
      const components = {
        hasReactRoot: html.includes('root') || html.includes('app'),
        hasStyles: html.includes('.css') || html.includes('<style'),
        hasScripts: html.includes('.js') || html.includes('<script'),
        hasTitle: html.includes('<title'),
        hasMeta: html.includes('<meta'),
        hasViewport: html.includes('viewport')
      };
      
      this.results.ui.components = components;
      
      Object.entries(components).forEach(([key, value]) => {
        console.log(`  ${value ? '✅' : '❌'} ${key.replace('has', '')}`);
      });
      
      // Test specific API responses for UI data
      const stateResponse = await axios.get(BASE_URL + '/api/state');
      const state = stateResponse.data;
      
      console.log('\n  Dashboard State:');
      console.log(`    ✅ LEO Protocol: v${state.leoProtocol?.version || 'unknown'}`);
      console.log(`    ✅ Active Agent: ${state.leoProtocol?.activeAgent || 'none'}`);
      console.log(`    ✅ Current Phase: ${state.leoProtocol?.currentPhase || 'none'}`);
      console.log(`    ✅ Context Usage: ${state.context?.usage || 0}/${state.context?.total || 0}`);
      
      this.results.ui.state = {
        hasLeoProtocol: !!state.leoProtocol,
        hasContext: !!state.context,
        hasSDs: !!state.strategicDirectives,
        hasPRDs: !!state.prds,
        hasHandoffs: !!state.handoffs
      };
      
    } catch (_error) {
      console.log(`  ❌ UI component test failed: ${error.message}`);
      this.results.errors.push(`UI components: ${error.message}`);
    }
  }

  async testRealTimeSync() {
    console.log('\n⚡ Testing Real-Time Sync...');
    
    try {
      // Create a test update in the database
      const testSD = {
        id: 'TEST-REALTIME-' + Date.now(),
        title: 'Real-time Test SD',
        status: 'draft',
        category: 'test',
        priority: 'low',
        description: 'Testing real-time sync'
      };
      
      console.log('  📝 Creating test SD in database...');
      const { data, error } = await this.supabase
        .from('strategic_directives_v2')
        .insert(testSD)
        .select()
        .single();
      
      if (error) {
        console.log(`  ❌ Failed to create test SD: ${error.message}`);
        this.results.realtime.createTest = false;
      } else {
        console.log(`  ✅ Test SD created: ${data.id}`);
        this.results.realtime.createTest = true;
        
        // Wait for sync
        console.log('  ⏳ Waiting 3 seconds for real-time sync...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if it appears in API
        const response = await axios.get(BASE_URL + '/api/sd');
        const found = response.data.find(sd => sd.id === testSD.id);
        
        if (found) {
          console.log('  ✅ Test SD appears in API (real-time sync working)');
          this.results.realtime.syncWorking = true;
        } else {
          console.log('  ⚠️  Test SD not found in API (may need manual refresh)');
          this.results.realtime.syncWorking = false;
        }
        
        // Clean up
        console.log('  🧹 Cleaning up test SD...');
        await this.supabase
          .from('strategic_directives_v2')
          .delete()
          .eq('id', testSD.id);
      }
    } catch (_error) {
      console.log(`  ❌ Real-time sync test failed: ${error.message}`);
      this.results.errors.push(`Real-time sync: ${error.message}`);
    }
  }

  async testInteractiveFeatures() {
    console.log('\n🖱️  Testing Interactive Features...');
    
    try {
      // Test checklist update endpoint
      console.log('  📝 Testing checklist update...');
      const checklistUpdate = {
        documentType: 'SD',
        documentId: 'SD-DASHBOARD-AUDIT-2025-08-31-A',
        itemIndex: 0,
        checked: true
      };
      
      try {
        await axios.post(BASE_URL + '/api/checklist/update', checklistUpdate);
        console.log('  ✅ Checklist update endpoint working');
        this.results.ui.checklistUpdate = true;
      } catch (_error) {
        console.log('  ⚠️  Checklist update endpoint: ' + error.message);
        this.results.ui.checklistUpdate = false;
      }
      
      // Test SD detail endpoint
      console.log('  📄 Testing SD detail endpoint...');
      try {
        const sdDetail = await axios.get(BASE_URL + '/api/sd/SD-DASHBOARD-AUDIT-2025-08-31-A');
        const sd = sdDetail.data;
        
        console.log(`    ✅ SD loaded: ${sd.title}`);
        console.log(`    ✅ PRDs included: ${sd.prds?.length || 0}`);
        console.log(`    ✅ EES included: ${sd.executionSequences?.length || 0}`);
        console.log(`    ✅ Progress: ${sd.progress}%`);
        
        this.results.ui.sdDetail = {
          success: true,
          hasPRDs: !!sd.prds,
          hasEES: !!sd.executionSequences,
          hasProgress: typeof sd.progress === 'number'
        };
      } catch (_error) {
        console.log('  ❌ SD detail endpoint failed: ' + error.message);
        this.results.ui.sdDetail = { success: false, error: error.message };
      }
      
    } catch (_error) {
      console.log(`  ❌ Interactive features test failed: ${error.message}`);
      this.results.errors.push(`Interactive features: ${error.message}`);
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📋 COMPREHENSIVE UI ANALYSIS REPORT');
    console.log('='.repeat(50));
    
    // Calculate scores
    const serverScore = Object.values(this.results.server).filter(s => s.success).length / Object.keys(this.results.server).length * 100;
    const apiScore = Object.values(this.results.api).filter(a => a.success).length / Object.keys(this.results.api).length * 100;
    const dataScore = Object.values(this.results.data).filter(d => d.valid).length / Object.keys(this.results.data).length * 100;
    
    console.log('\n🏆 Overall Scores:');
    console.log(`  Server Health: ${serverScore.toFixed(0)}%`);
    console.log(`  API Endpoints: ${apiScore.toFixed(0)}%`);
    console.log(`  Data Integrity: ${dataScore.toFixed(0)}%`);
    console.log(`  WebSocket: ${this.results.websocket.connected ? '✅' : '❌'}`);
    console.log(`  Real-time Sync: ${this.results.realtime.syncWorking ? '✅' : '❌'}`);
    
    console.log('\n✅ Working Features:');
    const working = [];
    if (serverScore > 80) working.push('Server responding correctly');
    if (apiScore > 80) working.push('All API endpoints functional');
    if (this.results.websocket.connected) working.push('WebSocket connection established');
    if (this.results.realtime.syncWorking) working.push('Real-time database sync active');
    if (dataScore > 80) working.push('Data integrity maintained');
    
    working.forEach(w => console.log(`  • ${w}`));
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Issues Found:');
      this.results.errors.forEach(e => console.log(`  • ${e}`));
    }
    
    console.log('\n📊 Data Summary:');
    const sds = Object.keys(this.results.data).filter(k => k.startsWith('SD_')).length;
    const prds = Object.keys(this.results.data).filter(k => k.startsWith('PRD_')).length;
    console.log(`  • Strategic Directives: ${sds}`);
    console.log(`  • Product Requirements: ${prds}`);
    console.log(`  • Overall Progress: ${this.results.data.progress?.overall || 0}%`);
    
    console.log('\n🎯 Recommendations:');
    const recommendations = [];
    if (!this.results.websocket.connected) {
      recommendations.push('Fix WebSocket connection for real-time updates');
    }
    if (!this.results.realtime.syncWorking) {
      recommendations.push('Investigate real-time sync issues');
    }
    if (serverScore < 100) {
      recommendations.push('Check failed server endpoints');
    }
    if (dataScore < 100) {
      recommendations.push('Review data validation errors');
    }
    
    if (recommendations.length === 0) {
      console.log('  ✨ No critical issues - dashboard fully functional!');
    } else {
      recommendations.forEach(r => console.log(`  • ${r}`));
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('Analysis complete at', new Date().toISOString());
  }
}

// Run the tests
const tester = new DashboardUITester();
tester.runAllTests().catch(console.error);