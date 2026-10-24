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
      this.onDisconnectCallback = null;
      this.onStatusCallback = null;
      this.seenMsgIds = new Set();
      this.msgCounter = 0;
      this.lastSeenPeerTime = 0;
      this._heartbeatInterval = null;
      this._joinInterval = null;
      this.clientId = 'p_' + Math.random().toString(36).slice(2, 10);

      // Broadcast immediate disconnect packet if tab is closed, reloaded, or navigated away
      const handleUnload = () => {
        if (this.connected && (this.role === 'host' || this.role === 'client')) {
          this.send({
            type: 'peer_disconnect',
            role: this.role
          });
        }
      };
      window.addEventListener('beforeunload', handleUnload);
      window.addEventListener('pagehide', handleUnload);
    }

    onMessage(cb) {
      this.onMessageCallback = cb;
    }

    onConnect(cb) {
      this.onConnectCallback = cb;
    }

    onDisconnect(cb) {
      this.onDisconnectCallback = cb;
    }

    onStatus(cb) {
      this.onStatusCallback = cb;
    }

    _emitStatus(text) {
      if (this.onStatusCallback) this.onStatusCallback(text);
    }

    cleanup() {
      this.connected = false;
      if (this._joinInterval) {
        clearInterval(this._joinInterval);
        this._joinInterval = null;
      }
      if (this._heartbeatInterval) {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
      }
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
            this._bindConnEvents(conn);
          });
          this.peer.on('error', () => {});
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
            this._bindConnEvents(conn);
          });
          this.peer.on('error', () => {});
        } catch (err) {}
      }
    }

    _bindConnEvents(conn) {
      conn.on('open', () => {
        if (this.role === 'client') {
          this.send({ type: 'join_request', port: this.port });
        } else {
          this._markConnected();
        }
      });
      conn.on('data', (data) => {
        this._handleIncomingRaw(data);
      });
      conn.on('close', () => {
        this._triggerDisconnect(
          this.role === 'client'
            ? 'The Host server disconnected or closed the game.'
            : 'Player 2 disconnected from your server.'
        );
      });
      conn.on('error', () => {
        this._triggerDisconnect(
          this.role === 'client'
            ? 'Lost connection to the Host server.'
            : 'Lost connection to Player 2.'
        );
      });
    }

    _markConnected() {
      if (this.connected) return;
      this.connected = true;
      this.lastSeenPeerTime = performance.now();
      if (this._joinInterval) {
        clearInterval(this._joinInterval);
        this._joinInterval = null;
      }

      // Start heartbeat ping & connection timeout watchdog
      if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = setInterval(() => {
        if (!this.connected) return;
        this.send({ type: 'heartbeat' });
        const elapsed = performance.now() - this.lastSeenPeerTime;
        if (elapsed > 3200) {
          this._triggerDisconnect(
            this.role === 'client'
              ? 'Server dropped! The Host closed the game or lost connection.'
              : 'Player 2 dropped! Opponent closed the game or lost connection.'
          );
        }
      }, 800);

      this._emitStatus(`Connected on Port ${this.port}! Launching match...`);
      if (this.onConnectCallback) this.onConnectCallback();
    }

    _triggerDisconnect(reason) {
      if (!this.connected) return;
      this.cleanup();
      this._emitStatus(reason);
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback(reason);
      }
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

      this.lastSeenPeerTime = performance.now();

      const payload = packet.payload;
      if (!payload) return;

      if (payload.type === 'heartbeat') {
        return;
      }

      if (payload.type === 'peer_disconnect') {
        const msg =
          payload.role === 'host'
            ? 'Server dropped! The Host left the game.'
            : 'Player 2 left the game.';
        this._triggerDisconnect(msg);
        return;
      }

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
