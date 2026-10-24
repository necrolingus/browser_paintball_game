(function () {
  class NetworkManager {
    constructor() {
      this.role = null; // 'host' | 'client' | 'bot'
      this.port = '60001';
      this.peer = null;
      this.conn = null;
      this.bc = null;
      this.connected = false;
      this.onMessageCallback = null;
      this.onConnectCallback = null;
      this.onStatusCallback = null;
      this.seenMsgIds = new Set();
      this.msgCounter = 0;
      this.clientId = 'p_' + Math.random().toString(36).slice(2, 10);
    }

    onMessage(cb) {
      this.onMessageCallback = cb;
    }

    onConnect(cb) {
      this.onConnectCallback = cb;
    }

    onStatus(cb) {
      this.onStatusCallback = cb;
    }

    _emitStatus(text) {
      if (this.onStatusCallback) this.onStatusCallback(text);
    }

    cleanup() {
      this.connected = false;
      if (this.conn) {
        try { this.conn.close(); } catch (e) {}
        this.conn = null;
      }
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
        this.peer = null;
      }
      if (this.bc) {
        try { this.bc.close(); } catch (e) {}
        this.bc = null;
      }
      this.seenMsgIds.clear();
    }

    startServer(portStr) {
      this.cleanup();
      this.role = 'host';
      this.port = String(portStr || '60001').trim() || '60001';
      this._emitStatus(`Server started on Port ${this.port}. Waiting for Player 2 to join...`);

      // 1. Setup BroadcastChannel for instant local/multi-tab connection
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel('paintball_port_' + this.port);
        this.bc.onmessage = (ev) => {
          this._handleIncomingRaw(ev.data);
        };
      }

      // 2. Setup WebRTC PeerJS for cross-device LAN / Web multiplayer
      if (typeof window.Peer !== 'undefined') {
        const peerId = `paintball-arena-host-${this.port}`;
        try {
          this.peer = new window.Peer(peerId, { debug: 0 });
          this.peer.on('open', () => {
            if (!this.connected) {
              this._emitStatus(`Server listening on Port ${this.port} (WebRTC + Local ready). Waiting for Player 2...`);
            }
          });
          this.peer.on('connection', (conn) => {
            this.conn = conn;
            conn.on('open', () => {
              this._markConnected();
            });
            conn.on('data', (data) => {
              this._handleIncomingRaw(data);
            });
          });
          this.peer.on('error', () => {
            // BroadcastChannel still works even if PeerJS cloud broker is unreachable or ID busy
          });
        } catch (err) {}
      }
    }

    joinServer(portStr) {
      this.cleanup();
      this.role = 'client';
      this.port = String(portStr || '60001').trim() || '60001';
      this._emitStatus(`Connecting to Server on Port ${this.port}...`);

      // 1. Setup BroadcastChannel and send handshake ping
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel('paintball_port_' + this.port);
        this.bc.onmessage = (ev) => {
          this._handleIncomingRaw(ev.data);
        };
        this.send({ type: 'join_request', port: this.port });
        // Retry join ping briefly in case host just clicked start
        this._joinInterval = setInterval(() => {
          if (this.connected || this.role !== 'client') {
            clearInterval(this._joinInterval);
            return;
          }
          this.send({ type: 'join_request', port: this.port });
        }, 400);
      }

      // 2. Setup WebRTC PeerJS client connection
      if (typeof window.Peer !== 'undefined') {
        try {
          this.peer = new window.Peer({ debug: 0 });
          this.peer.on('open', () => {
            if (this.connected) return;
            const hostPeerId = `paintball-arena-host-${this.port}`;
            const conn = this.peer.connect(hostPeerId, { reliable: true });
            this.conn = conn;
            conn.on('open', () => {
              this.send({ type: 'join_request', port: this.port });
            });
            conn.on('data', (data) => {
              this._handleIncomingRaw(data);
            });
          });
          this.peer.on('error', () => {});
        } catch (err) {}
      }
    }

    _markConnected() {
      if (this.connected) return;
      this.connected = true;
      if (this._joinInterval) clearInterval(this._joinInterval);
      this._emitStatus(`Connected on Port ${this.port}! Launching match...`);
      if (this.onConnectCallback) this.onConnectCallback();
    }

    _handleIncomingRaw(packet) {
      if (!packet || packet.sender === this.clientId) return;
      if (packet.msgId && this.seenMsgIds.has(packet.msgId)) return;
      if (packet.msgId) {
        this.seenMsgIds.add(packet.msgId);
        if (this.seenMsgIds.size > 600) {
          const first = this.seenMsgIds.values().next().value;
          this.seenMsgIds.delete(first);
        }
      }

      const payload = packet.payload;
      if (!payload) return;

      if (payload.type === 'join_request' && this.role === 'host') {
        this.send({ type: 'join_accept', port: this.port });
        this._markConnected();
        return;
      }

      if (payload.type === 'join_accept' && this.role === 'client') {
        this._markConnected();
        return;
      }

      if (this.onMessageCallback) {
        this.onMessageCallback(payload);
      }
    }

    send(payload) {
      const packet = {
        sender: this.clientId,
        msgId: `${this.clientId}_${++this.msgCounter}_${Date.now()}`,
        payload
      };

      if (this.bc) {
        try {
          this.bc.postMessage(packet);
        } catch (e) {}
      }

      if (this.conn && this.conn.open) {
        try {
          this.conn.send(packet);
        } catch (e) {}
      }
    }
  }

  window.PaintballNetwork = new NetworkManager();
})();
