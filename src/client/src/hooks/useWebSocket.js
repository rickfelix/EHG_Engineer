import { useEffect, useRef } from 'react';

export function useWebSocket(url, options = {}) {
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = options.maxReconnectAttempts || 10;
  const reconnectDelay = options.reconnectDelay || 3000;

  const connect = () => {
    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = (event) => {
        console.log('WebSocket connected');
        reconnectAttempts.current = 0;
        if (options.onOpen) {
          options.onOpen(event);
        }
      };

      ws.current.onmessage = (event) => {
        if (options.onMessage) {
          options.onMessage(event);
        }
      };

      ws.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        if (options.onError) {
          options.onError(event);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket closed');
        if (options.onClose) {
          options.onClose(event);
        }

        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`Reconnecting... (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url]);

  return ws.current;
}