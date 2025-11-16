/**
 * RealtimeClient - WebRTC Client for OpenAI Realtime API
 * Handles WebRTC connection, audio streaming, and event management
 */

import { EventEmitter } from 'events';

export interface RealtimeClientConfig {
  session: any;
  mediaStream: MediaStream;
  audioContext: AudioContext;
  onTranscript?: (text: string, speaker: 'user' | 'assistant') => void;
  onFunctionCall?: (name: string, args: any) => Promise<any>;
  onUsageUpdate?: (stats: UsageStats) => void;
  onError?: (error: Error) => void;
  onListening?: (listening: boolean) => void;
}

export interface UsageStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  latencyMs: number;
}

export class RealtimeClient extends EventEmitter {
  private config: RealtimeClientConfig;
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private isConnected: boolean = false;
  private isMuted: boolean = false;
  private turnStartTime: number = 0;

  constructor(config: RealtimeClientConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect(): Promise<void> {
    try {
      // Create RTCPeerConnection
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      // Add audio track from media stream
      const audioTrack = this.config.mediaStream.getAudioTracks()[0];
      if (audioTrack) {
        this.pc.addTrack(audioTrack, this.config.mediaStream);
      }

      // Set up audio processing
      this.setupAudioProcessing();

      // Create data channel for events
      this.dataChannel = this.pc.createDataChannel('events', {
        ordered: true
      });

      this.dataChannel.onopen = () => {
        console.log('Data channel opened');
        this.sendEvent('session.update', {
          turn_detection: { type: 'server_vad' }
        });
      };

      this.dataChannel.onmessage = (event) => {
        this.handleDataChannelMessage(event.data);
      };

      // Handle ICE candidates
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('ICE candidate:', event.candidate);
        }
      };

      // Handle incoming audio
      this.pc.ontrack = (event) => {
        console.log('Received track:', event.track.kind);
        if (event.track.kind === 'audio') {
          this.handleIncomingAudio(event.streams[0]);
        }
      };

      // Create offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await this.pc.setLocalDescription(offer);

      // Connect via WebSocket to exchange SDP
      await this.connectWebSocket();

      // Send offer
      this.ws?.send(JSON.stringify({
        type: 'offer',
        sdp: offer.sdp,
        session: this.config.session
      }));

      this.isConnected = true;

    } catch (error) {
      console.error('Connection failed:', error);
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Set up WebSocket connection for signaling
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use the client_secret from session for authentication
      const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime';

      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.session.client_secret}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      } as any);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };

      this.ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        await this.handleWebSocketMessage(message);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.isConnected = false;
      };
    });
  }

  /**
   * Handle WebSocket messages
   */
  private async handleWebSocketMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'answer':
        // Set remote description
        await this.pc?.setRemoteDescription({
          type: 'answer',
          sdp: message.sdp
        });
        break;

      case 'session.created':
        console.log('Session created:', message.session);
        break;

      case 'session.updated':
        console.log('Session updated');
        break;

      case 'conversation.item.created':
        // Handle conversation updates
        if (message.item?.content) {
          const speaker = message.item.role === 'user' ? 'user' : 'assistant';
          this.config.onTranscript?.(message.item.content, speaker);
        }
        break;

      case 'response.audio_transcript.delta':
        // Handle incremental transcription
        break;

      case 'response.audio_transcript.done':
        // Final transcription
        if (message.transcript) {
          this.config.onTranscript?.(message.transcript, 'assistant');
        }
        break;

      case 'response.function_call_arguments.done':
        // Handle function call
        if (message.name && this.config.onFunctionCall) {
          const result = await this.config.onFunctionCall(
            message.name,
            JSON.parse(message.arguments)
          );
          
          // Send function result back
          this.sendEvent('conversation.item.create', {
            type: 'function_call_output',
            call_id: message.call_id,
            output: JSON.stringify(result)
          });
        }
        break;

      case 'response.done':
        // Calculate latency
        const latency = this.turnStartTime ? Date.now() - this.turnStartTime : 0;
        
        // Update usage stats
        if (message.response?.usage) {
          const usage = message.response.usage;
          const inputCost = (usage.input_tokens / 1000000) * 6; // $0.06 per 1M
          const outputCost = (usage.output_tokens / 1000000) * 24; // $0.24 per 1M
          
          this.config.onUsageUpdate?.({
            totalTokens: usage.total_tokens,
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            costCents: Math.ceil(inputCost + outputCost),
            latencyMs: latency
          });
        }
        break;

      case 'error':
        console.error('API error:', message.error);
        this.config.onError?.(new Error(message.error.message));
        break;
    }
  }

  /**
   * Handle data channel messages
   */
  private handleDataChannelMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      console.log('Data channel message:', message);
      
      // Handle turn detection
      if (message.type === 'input_audio_buffer.speech_started') {
        this.config.onListening?.(true);
        this.turnStartTime = Date.now();
      } else if (message.type === 'input_audio_buffer.speech_stopped') {
        this.config.onListening?.(false);
      }
    } catch (error) {
      console.error('Failed to parse data channel message:', error);
    }
  }

  /**
   * Set up audio processing for input
   */
  private setupAudioProcessing(): void {
    const source = this.config.audioContext.createMediaStreamSource(this.config.mediaStream);
    
    // Create script processor for audio processing (will be replaced with AudioWorklet)
    this.audioProcessor = this.config.audioContext.createScriptProcessor(2048, 1, 1);
    
    this.audioProcessor.onaudioprocess = (event) => {
      if (this.isMuted || !this.dataChannel || this.dataChannel.readyState !== 'open') {
        return;
      }

      // Get audio data
      const inputData = event.inputBuffer.getChannelData(0);
      
      // Convert to 16-bit PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Send audio data through data channel
      this.dataChannel.send(pcm16.buffer);
    };

    source.connect(this.audioProcessor);
    this.audioProcessor.connect(this.config.audioContext.destination);
  }

  /**
   * Handle incoming audio stream
   */
  private handleIncomingAudio(stream: MediaStream): void {
    // Create audio element to play incoming audio
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    
    // Handle audio errors
    audio.onerror = (error) => {
      console.error('Audio playback error:', error);
    };
  }

  /**
   * Send event through WebSocket or data channel
   */
  private sendEvent(type: string, data: any): void {
    const event = { type, ...data };
    
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(event));
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  /**
   * Set muted state
   */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
    
    // Update media stream track
    const audioTrack = this.config.mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !muted;
    }
  }

  /**
   * Disconnect from the service
   */
  async disconnect(): Promise<void> {
    // Close data channel
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Close peer connection
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    // Disconnect audio processor
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }

    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
}