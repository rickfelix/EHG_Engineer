/**
 * EVAVoiceAssistant Component
 * OpenAI Realtime Voice Interface using WebRTC
 * Part of SD-2025-001 Implementation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Activity, DollarSign, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { RealtimeClient } from './RealtimeClient';
import '../../styles/mobile-voice.css';
import type { 
  ConversationItem, 
  FunctionCallResult,
  SessionConfig,
  UsageStats 
} from './types';

interface EVAVoiceAssistantProps {
  userId: string;
  onTranscript?: (text: string, speaker: 'user' | 'assistant') => void;
  onFunctionCall?: (name: string, args: any) => Promise<any>;
  onCostUpdate?: (cents: number) => void;
  onError?: (error: Error) => void;
}

export const EVAVoiceAssistant: React.FC<EVAVoiceAssistantProps> = ({
  userId,
  onTranscript,
  onFunctionCall,
  onCostUpdate,
  onError
}) => {
  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [usage, setUsage] = useState<UsageStats>({
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    costCents: 0,
    latencyMs: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [announcements, setAnnouncements] = useState<string[]>([]);

  // Refs
  const realtimeClient = useRef<RealtimeClient | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const conversationId = useRef<string | null>(null);

  /**
   * Announce message to screen readers
   */
  const announceToScreenReader = (message: string) => {
    setAnnouncements(prev => [...prev, message]);
    // Clear announcements after 2 seconds
    setTimeout(() => {
      setAnnouncements(prev => prev.filter(msg => msg !== message));
    }, 2000);
  };

  /**
   * Handle keyboard interactions
   */
  const handleKeyPress = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  /**
   * Provide haptic feedback on mobile devices
   */
  const triggerHapticFeedback = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    if ('vibrate' in navigator) {
      // Different vibration patterns for different feedback types
      const patterns = {
        light: [10],
        medium: [25],
        heavy: [50]
      };
      navigator.vibrate(patterns[type]);
    }
  };

  /**
   * Initialize audio context and media stream
   */
  const initializeAudio = async () => {
    try {
      // Create audio context
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000 // OpenAI requires 24kHz
      });

      // Request microphone access
      mediaStream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      return true;
    } catch (err: any) {
      console.error('Audio initialization failed:', err);
      let errorMessage = 'Microphone access denied';
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please allow microphone permissions and try again.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage = 'Your browser does not support audio recording.';
      }
      
      setError(errorMessage);
      announceToScreenReader(`Error: ${errorMessage}`);
      return false;
    }
  };

  /**
   * Connect to OpenAI Realtime API
   */
  /**
   * Connect with retry logic
   */
  const connectWithRetry = async (attempt = 1) => {
    const maxRetries = 3;
    
    try {
      await connect();
      setRetryCount(0);
    } catch (err: any) {
      if (attempt < maxRetries) {
        setRetryCount(attempt);
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        announceToScreenReader(`Connection failed. Retrying in ${delay / 1000} seconds...`);
        setTimeout(() => connectWithRetry(attempt + 1), delay);
      } else {
        setRetryCount(0);
        setError(`Connection failed after ${maxRetries} attempts. Please check your internet connection.`);
        announceToScreenReader('Connection failed. Please try again later.');
      }
    }
  };

  /**
   * Connect to OpenAI Realtime API
   */
  const connect = async () => {
    if (isConnected || isConnecting) return;

    setIsConnecting(true);
    setError(null);
    announceToScreenReader('Connecting to voice assistant...');

    try {
      // Initialize audio if not already done
      if (!audioContext.current || !mediaStream.current) {
        const audioReady = await initializeAudio();
        if (!audioReady) {
          setIsConnecting(false);
          return;
        }
      }

      // Get ephemeral token from Edge Function
      const { data: session, error: tokenError } = await supabase.functions.invoke(
        'openai-realtime-token',
        {
          body: {
            userId,
            sessionConfig: {
              model: 'gpt-4o-realtime-preview-2024-12-17',
              voice: 'alloy',
              instructions: `You are EVA, a professional portfolio assistant.
                Help users understand their investments and make informed decisions.
                Be concise and professional. Focus on financial topics.`,
              temperature: 0.7,
              maxTokens: 4096
            }
          }
        }
      );

      if (tokenError) throw tokenError;

      // Store conversation ID
      conversationId.current = session.conversation_id;

      // Create realtime client
      realtimeClient.current = new RealtimeClient({
        session: session.session,
        mediaStream: mediaStream.current!,
        audioContext: audioContext.current!,
        onTranscript: (text, speaker) => {
          // Update conversation
          setConversation(prev => [...prev, { 
            id: Date.now().toString(),
            role: speaker,
            content: text,
            timestamp: new Date().toISOString()
          }]);

          // Call callback
          onTranscript?.(text, speaker);
        },
        onFunctionCall: async (name, args) => {
          // Execute function
          const result = onFunctionCall ? 
            await onFunctionCall(name, args) : 
            { error: 'Function handler not provided' };

          // Track in database
          await supabase
            .from('voice_function_calls')
            .insert({
              conversation_id: conversationId.current,
              function_name: name,
              arguments: args,
              result: result,
              success: !result.error
            });

          return result;
        },
        onUsageUpdate: (stats) => {
          setUsage(stats);
          onCostUpdate?.(stats.costCents);

          // Update database
          supabase.functions.invoke('realtime-relay', {
            body: {
              conversation_id: conversationId.current,
              event_type: 'response.done',
              data: { usage: stats }
            }
          });
        },
        onError: (err) => {
          console.error('Realtime client error:', err);
          setError(err.message);
          onError?.(err);
        },
        onListening: (listening) => {
          setIsListening(listening);
          announceToScreenReader(listening ? 'Voice assistant is listening' : 'Voice assistant stopped listening');
        }
      });

      // Set up processing state handler
      if (realtimeClient.current.onProcessing) {
        realtimeClient.current.onProcessing = (processing) => {
          setIsProcessing(processing);
          announceToScreenReader(processing ? 'Processing your request...' : 'Processing complete');
        };
      }

      // Connect to OpenAI
      await realtimeClient.current.connect();
      setIsConnected(true);
      setIsConnecting(false);
      triggerHapticFeedback('medium');
      announceToScreenReader('Connected to voice assistant. You can now start speaking.');

    } catch (err: any) {
      console.error('Connection failed:', err);
      const errorMessage = err.message || 'Failed to connect';
      setError(errorMessage);
      setIsConnecting(false);
      announceToScreenReader(`Connection failed: ${errorMessage}`);
      onError?.(err);
      throw err; // Re-throw for retry logic
    }
  };

  /**
   * Disconnect from OpenAI
   */
  const disconnect = async () => {
    if (!isConnected) return;

    try {
      // Disconnect client
      if (realtimeClient.current) {
        await realtimeClient.current.disconnect();
        realtimeClient.current = null;
      }

      // Stop media stream
      if (mediaStream.current) {
        mediaStream.current.getTracks().forEach(track => track.stop());
        mediaStream.current = null;
      }

      // Close audio context
      if (audioContext.current) {
        await audioContext.current.close();
        audioContext.current = null;
      }

      // Update conversation end time
      if (conversationId.current) {
        await supabase.functions.invoke('realtime-relay', {
          body: {
            conversation_id: conversationId.current,
            event_type: 'conversation.ended',
            data: {}
          }
        });
      }

      setIsConnected(false);
      setIsListening(false);
      announceToScreenReader('Disconnected from voice assistant.');
    } catch (err) {
      console.error('Disconnect error:', err);
    }
  };

  /**
   * Toggle mute
   */
  const toggleMute = () => {
    if (!realtimeClient.current) return;
    
    const newMutedState = !isMuted;
    triggerHapticFeedback('light');
    realtimeClient.current.setMuted(newMutedState);
    setIsMuted(newMutedState);
    announceToScreenReader(newMutedState ? 'Microphone muted' : 'Microphone unmuted');
  };

  /**
   * Show tutorial
   */
  const openTutorial = () => {
    triggerHapticFeedback('light');
    setShowTutorial(true);
    announceToScreenReader('Voice assistant tutorial opened');
  };

  /**
   * Close tutorial
   */
  const closeTutorial = () => {
    triggerHapticFeedback('light');
    setShowTutorial(false);
    announceToScreenReader('Tutorial closed');
  };

  /**
   * Format cost display
   */
  const formatCost = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  /**
   * Format latency display
   */
  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mobile-spacing" role="main" aria-label="EVA Voice Assistant">
      {/* Screen Reader Announcements */}
      <div 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only"
        role="status"
      >
        {announcements.map((announcement, index) => (
          <div key={index}>{announcement}</div>
        ))}
      </div>

      {/* Tutorial Modal */}
      {showTutorial && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <h3 id="tutorial-title" className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              How to Use EVA Voice Assistant
            </h3>
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <p>• Click "Connect" to start a voice session</p>
              <p>• Speak naturally after you see "Listening..."</p>
              <p>• Ask about your portfolio or financial information</p>
              <p>• Use the mute button if you need to pause</p>
              <p>• Click "Disconnect" when you're done</p>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeTutorial}
                onKeyDown={(e) => handleKeyPress(e, closeTutorial)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                aria-label="Close tutorial"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div 
            className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-gray-400'
            } animate-pulse`}
            role="img"
            aria-label={isConnected ? 'Connected' : 'Disconnected'}
          />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            EVA Voice Assistant
          </h1>
        </div>
        
        {/* Tutorial Button */}
        <button
          onClick={openTutorial}
          onKeyDown={(e) => handleKeyPress(e, openTutorial)}
          className="text-blue-500 hover:text-blue-600 text-sm underline transition-colors"
          aria-label="Open voice assistant tutorial"
          tabIndex={0}
        >
          How to use
        </button>
        
      </div>

      {/* Usage stats */}
      <div className="voice-stats flex items-center justify-end space-x-4 text-sm mb-4">
        <div className="flex items-center space-x-1" role="group" aria-label="Response latency">
          <Activity className="w-4 h-4 text-gray-500" aria-hidden="true" />
          <span className="text-gray-600 dark:text-gray-400">
            {formatLatency(usage.latencyMs)}
          </span>
          <span className="sr-only">response time</span>
        </div>
        <div className="flex items-center space-x-1" role="group" aria-label="Session cost">
          <DollarSign className="w-4 h-4 text-gray-500" aria-hidden="true" />
          <span className="text-gray-600 dark:text-gray-400">
            {formatCost(usage.costCents)}
          </span>
          <span className="sr-only">total cost</span>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div 
          className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-start space-x-2"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-400 mb-2">{error}</p>
            {retryCount > 0 && (
              <p className="text-xs text-red-600 dark:text-red-500">
                Retry attempt {retryCount} of 3...
              </p>
            )}
            {!isConnecting && error.includes('Microphone') && (
              <button
                onClick={connectWithRetry}
                onKeyDown={(e) => handleKeyPress(e, connectWithRetry)}
                className="text-xs text-red-600 dark:text-red-400 underline hover:no-underline mt-1"
                aria-label="Retry connection"
                tabIndex={0}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Conversation display */}
      <div 
        className="mb-6 conversation-display overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg conversation-container"
        role="log"
        aria-live="polite"
        aria-label="Conversation history"
        tabIndex={0}
      >
        {conversation.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center mt-20">
            <p className="mb-2">
              {isConnected ? 'Start speaking to begin...' : 'Connect to start a conversation'}
            </p>
            {isProcessing && (
              <p className="text-sm" aria-live="polite">
                Processing your request...
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {conversation.map(item => (
              <div
                key={item.id}
                className={`flex ${
                  item.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
                role="article"
                aria-label={`${item.role === 'user' ? 'You said' : 'EVA said'}: ${item.content}`}
              >
                <div
                  className={`conversation-message px-4 py-2 rounded-lg ${
                    item.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                  }`}
                >
                  <div className="sr-only">
                    {item.role === 'user' ? 'You said:' : 'EVA said:'}
                  </div>
                  <p className="text-sm">{item.content}</p>
                  <div className="sr-only">
                    at {new Date(item.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="voice-controls flex items-center justify-center space-x-4" role="group" aria-label="Voice controls">
        {/* Connect/Disconnect button */}
        <button
          onClick={isConnected ? disconnect : connectWithRetry}
          onKeyDown={(e) => handleKeyPress(e, isConnected ? disconnect : connectWithRetry)}
          disabled={isConnecting}
          className={`voice-button-primary rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 haptic-feedback ${
            isConnected
              ? 'bg-red-500 hover:bg-red-600 focus:bg-red-600 text-white'
              : 'bg-green-500 hover:bg-green-600 focus:bg-green-600 text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
          aria-label={isConnected ? 'Disconnect from voice assistant' : 'Connect to voice assistant'}
          aria-describedby="connection-status"
          tabIndex={0}
        >
          {isConnected ? (
            <>
              <PhoneOff className="w-5 h-5" />
              <span>Disconnect</span>
            </>
          ) : (
            <>
              <Phone className="w-5 h-5" />
              <span>{isConnecting ? 'Connecting...' : 'Connect'}</span>
            </>
          )}
        </button>

        {/* Mute button */}
        <button
          onClick={toggleMute}
          onKeyDown={(e) => handleKeyPress(e, toggleMute)}
          disabled={!isConnected}
          className={`voice-button rounded-lg transition-colors flex items-center justify-center haptic-feedback ${
            isMuted
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
          } disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={isMuted}
          tabIndex={0}
        >
          {isMuted ? (
            <MicOff className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Mic className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Hidden status for screen readers */}
      <div id="connection-status" className="sr-only">
        {isConnected ? 'Connected to voice assistant' : 'Not connected to voice assistant'}
      </div>

      {/* Listening indicator */}
      {isListening && (
        <div 
          className="mt-4 flex items-center justify-center space-x-2" 
          role="status" 
          aria-live="polite"
        >
          <div className="flex space-x-1" aria-hidden="true">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-1 h-8 bg-blue-500 rounded-full animate-pulse"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  height: `${Math.random() * 20 + 10}px`
                }}
              />
            ))}
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Listening...
          </span>
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div 
          className="mt-4 flex items-center justify-center space-x-2" 
          role="status" 
          aria-live="polite"
        >
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" aria-hidden="true"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Processing...
          </span>
        </div>
      )}

      {/* Token usage */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div 
          className="flex justify-between text-xs text-gray-500 dark:text-gray-400" 
          role="region" 
          aria-label="Usage statistics"
        >
          <span aria-label={`Total tokens used: ${usage.totalTokens}`}>Tokens: {usage.totalTokens}</span>
          <span aria-label={`Input tokens: ${usage.inputTokens}`}>Input: {usage.inputTokens}</span>
          <span aria-label={`Output tokens: ${usage.outputTokens}`}>Output: {usage.outputTokens}</span>
        </div>
      </div>
    </div>
  );
};