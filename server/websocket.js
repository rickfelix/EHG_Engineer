/**
 * WebSocket Handler
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { WebSocketServer } from 'ws';
import { dbLoader } from './config.js';
import { dashboardState } from './state.js';

let wss = null;
let broadcastUpdateFn = null;

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(server) {
  wss = new WebSocketServer({ server });

  // Define broadcast function
  broadcastUpdateFn = (type, data) => {
    const message = JSON.stringify({ type, data });
    global.wsClients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  };

  // WebSocket connection handling
  wss.on('connection', (ws) => {
    global.wsClients.add(ws);
    console.log('✨ New WebSocket client connected');

    // Send initial state
    ws.send(JSON.stringify({
      type: 'state',
      data: dashboardState
    }));

    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);
        console.log('📨 WebSocket message received:', msg.type, msg.data ? JSON.stringify(msg.data) : '');

        if (msg.type === 'setActiveSD') {
          await handleSetActiveSD(ws, msg.data);
        } else if (msg.type === 'updateSDStatus') {
          await handleUpdateSDStatus(ws, msg.data);
        } else if (msg.type === 'updateSDPriority') {
          await handleUpdateSDPriority(ws, msg.data);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      global.wsClients.delete(ws);
      console.log('👋 WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return wss;
}

/**
 * Handle setActiveSD message
 */
async function handleSetActiveSD(ws, data) {
  const { sdId } = data;
  console.log(`🎯 Setting active SD to: ${sdId}`);

  if (!dbLoader.supabase) {
    console.error('❌ dbLoader.supabase is not initialized!');
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Database connection not initialized'
    }));
    return;
  }

  // First, clear is_working_on flag from all SDs
  const { error: clearError } = await dbLoader.supabase
    .from('strategic_directives_v2')
    .update({ is_working_on: false })
    .eq('is_working_on', true);

  if (clearError) {
    console.error('❌ Error clearing working_on flags:', clearError);
  }

  // Then set the new active SD
  const { error: setError } = await dbLoader.supabase
    .from('strategic_directives_v2')
    .update({ is_working_on: true })
    .eq('id', sdId);

  if (setError) {
    console.error('❌ Error setting working_on flag:', setError);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to set active SD: ${setError.message}`
    }));
  } else {
    console.log(`✅ Successfully set ${sdId} as working_on`);

    // Update local state
    dashboardState.leoProtocol.currentSD = sdId;

    // Reload strategic directives to get updated is_working_on flags
    dashboardState.strategicDirectives = await dbLoader.loadStrategicDirectives();

    // Broadcast the updated state to all clients
    broadcastUpdate('state', dashboardState);
  }
}

/**
 * Handle updateSDStatus message
 */
async function handleUpdateSDStatus(ws, data) {
  const { sdId, status } = data;
  console.log(`📝 Updating SD ${sdId} status to: ${status}`);

  // Update in database
  const { error } = await dbLoader.supabase
    .from('strategic_directives_v2')
    .update({ status })
    .eq('id', sdId);

  if (error) {
    console.error('❌ Error updating SD status:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to update status: ${error.message}`
    }));
  } else {
    console.log(`✅ Successfully updated ${sdId} to ${status}`);

    // Reload strategic directives to broadcast update to all clients
    dashboardState.strategicDirectives = await dbLoader.loadStrategicDirectives();

    // Broadcast the updated state to all clients
    broadcastUpdate('state', dashboardState);
  }
}

/**
 * Handle updateSDPriority message
 */
async function handleUpdateSDPriority(ws, data) {
  const { sdId, priority } = data;
  console.log(`🎯 Updating SD ${sdId} priority to: ${priority}`);

  // Update in database
  const { error } = await dbLoader.supabase
    .from('strategic_directives_v2')
    .update({ priority })
    .eq('id', sdId);

  if (error) {
    console.error('❌ Error updating SD priority:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to update priority: ${error.message}`
    }));
  } else {
    console.log(`✅ Successfully updated ${sdId} priority to ${priority}`);

    // Reload strategic directives to broadcast update to all clients
    dashboardState.strategicDirectives = await dbLoader.loadStrategicDirectives();

    // Broadcast the updated state to all clients
    broadcastUpdate('state', dashboardState);
  }
}

/**
 * Broadcast state updates to all connected clients
 */
export function broadcastUpdate(type, data) {
  if (broadcastUpdateFn) {
    broadcastUpdateFn(type, data);
  }
}

/**
 * Broadcast to clients (alias for PR review webhook)
 */
export function broadcastToClients(data) {
  const message = JSON.stringify(data);
  global.wsClients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

/**
 * Get WebSocket server instance
 */
export function getWss() {
  return wss;
}
