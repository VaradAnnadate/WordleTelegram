/**
 * WebSocket client wrapper with auto-reconnect and event-based API.
 */
export default class GameSocket {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.pingInterval = null;
    this.url = null;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(url) {
    this.url = url || this._getWsUrl();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, 10_000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._startPing();
        this._emit('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') return; // heartbeat
          this._emit(msg.type, msg);
          this._emit('message', msg);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        this.isConnected = false;
        this._stopPing();
        this._emit('disconnected', { code: event.code, reason: event.reason });

        if (event.code !== 1000 && event.code !== 1001) {
          this._attemptReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        this._emit('error', err);
      };
    });
  }

  /**
   * Send a JSON message
   */
  send(type, data = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected, cannot send:', type);
      return false;
    }
    this.ws.send(JSON.stringify({ type, ...data }));
    return true;
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    this._stopPing();
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    this.isConnected = false;
  }

  // ─── Private ─────────────────────────────────────────
  _emit(event, data) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      cbs.forEach(cb => {
        try { cb(data); }
        catch (e) { console.error(`[WS] Event handler error (${event}):`, e); }
      });
    }
  }

  _getWsUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/ws`;
  }

  _startPing() {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      this.send('ping');
    }, 25_000);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      this._emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this._emit('reconnecting', { attempt: this.reconnectAttempts });
      this.connect(this.url).catch(() => {});
    }, delay);
  }
}
