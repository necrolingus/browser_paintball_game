(function () {
  const ARENA_W = 1600;
  const ARENA_H = 1000;
  const MAX_HP = 6; // 3 normal shots (2 dmg each) or 2 grenades (3 dmg each)
  const NORMAL_DAMAGE = 2;
  const GRENADE_DAMAGE = 3;

  const BULLET_SPEED = 700;
  const BULLET_MAX_RANGE = 430; // Limited paintball range
  const FIRE_COOLDOWN = 0.26;

  const GRENADE_MAX_RANGE = 380; // Limited grenade throw range
  const GRENADE_MIN_RANGE = 75;
  const GRENADE_FLIGHT_TIME = 0.65;
  const GRENADE_SPLASH_RADIUS = 118;
  const GRENADE_COOLDOWN = 3.0;

  const VIEW_FOV = (104 * Math.PI) / 180; // 104 degree vision cone
  const VIEW_RANGE = 540;
  const CLOSE_SENSE_RADIUS = 44;

  // Seeded PRNG (Mulberry32) so Host & Client generate the exact same random obstacle layout
  function createSeededRandom(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  class PaintballGameEngine {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');

      this.mode = 'menu'; // 'menu' | 'host' | 'client' | 'bot'
      this.localPlayerId = 'p1';
      this.mapSeed = Date.now() & 0x7fffffff;

      this.arenaW = ARENA_W;
      this.arenaH = ARENA_H;

      this.players = {
        p1: this._createPlayer('p1', 110, ARENA_H / 2, 0, '#ff6b2b', '#ff9e73'),
        p2: this._createPlayer('p2', ARENA_W - 110, ARENA_H / 2, Math.PI, '#76e024', '#b4f57f')
      };

      this.obstacles = [];
      this.bullets = [];
      this.grenades = [];
      this.splatters = [];
      this.particles = [];
      this.floatingTexts = [];

      this.roundOver = false;
      this.winnerId = null;
      this.pendingRestartRequest = false;

      // Input state
      this.keys = {};
      this.mouse = {
        screenX: window.innerWidth / 2 + 120,
        screenY: window.innerHeight / 2,
        leftDown: false
      };

      this.mobileInput = {
        enabled: false,
        leftActive: false,
        leftId: null,
        leftX: 0,
        leftY: 0,
        rightActive: false,
        rightId: null,
        rightX: 0,
        rightY: 0
      };

      this.netSyncTimer = 0;
      this.lastFrameTime = performance.now();

      this._initDOM();
      this._initEvents();
      this._resizeCanvas();
      window.PaintballAssets.init(this.ctx);
      this.generateMap(this.mapSeed);
      this._updateMuteUI();

      requestAnimationFrame((t) => this._loop(t));
    }

    _createPlayer(id, x, y, angle, color, lightColor) {
      return {
        id,
        x,
        y,
        vx: 0,
        vy: 0,
        angle,
        radius: 20,
        speed: 245,
        hp: MAX_HP,
        maxHp: MAX_HP,
        color,
        lightColor,
        fireCooldown: 0,
        grenadeCooldown: 0,
        hitFlash: 0
      };
    }

    _initDOM() {
      this.dom = {
        hud: document.getElementById('hud'),
        p1Pips: document.getElementById('p1Pips'),
        p2Pips: document.getElementById('p2Pips'),
        p1HpText: document.getElementById('p1HpText'),
        p2HpText: document.getElementById('p2HpText'),
        p1Label: document.getElementById('p1Label'),
        p2Label: document.getElementById('p2Label'),
        grenadeDot: document.getElementById('grenadeDot'),
        grenadeStatusText: document.getElementById('grenadeStatusText'),
        muteBtn: document.getElementById('muteBtn'),
        touchToggleBtn: document.getElementById('touchToggleBtn'),
        restartBtn: document.getElementById('restartBtn'),
        lobbyOverlay: document.getElementById('lobbyOverlay'),
        portInput: document.getElementById('portInput'),
        startServerBtn: document.getElementById('startServerBtn'),
        joinServerBtn: document.getElementById('joinServerBtn'),
        practiceBotBtn: document.getElementById('practiceBotBtn'),
        lobbyStatus: document.getElementById('lobbyStatus'),
        restartModal: document.getElementById('restartModal'),
        restartPromptText: document.getElementById('restartPromptText'),
        restartYesBtn: document.getElementById('restartYesBtn'),
        restartNoBtn: document.getElementById('restartNoBtn'),
        roundOverModal: document.getElementById('roundOverModal'),
        roundWinnerTitle: document.getElementById('roundWinnerTitle'),
        roundWinnerSub: document.getElementById('roundWinnerSub'),
        roundRestartBtn: document.getElementById('roundRestartBtn'),
        disconnectModal: document.getElementById('disconnectModal'),
        disconnectTitle: document.getElementById('disconnectTitle'),
        disconnectReason: document.getElementById('disconnectReason'),
        disconnectLobbyBtn: document.getElementById('disconnectLobbyBtn'),
        mobileControls: document.getElementById('mobileControls'),
        leftStickZone: document.getElementById('leftStickZone'),
        leftStickKnob: document.getElementById('leftStickKnob'),
        rightStickZone: document.getElementById('rightStickZone'),
        rightStickKnob: document.getElementById('rightStickKnob'),
        mobileFireBtn: document.getElementById('mobileFireBtn'),
        mobileGrenadeBtn: document.getElementById('mobileGrenadeBtn')
      };
    }

    _initEvents() {
      window.addEventListener('resize', () => this._resizeCanvas());

      // Keyboard WASD + Arrows
      window.addEventListener('keydown', (e) => {
        if (document.activeElement === this.dom.portInput) return;
        this.keys[e.code] = true;
      });
      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });

      // Mouse Aim + Left Click Shoot + Right Click Paint Grenade
      this.canvas.addEventListener('mousemove', (e) => {
        this.mouse.screenX = e.clientX;
        this.mouse.screenY = e.clientY;
      });

      this.canvas.addEventListener('mousedown', (e) => {
        if (this.mode === 'menu') return;
        window.PaintballAudio.initContext();
        this.mouse.screenX = e.clientX;
        this.mouse.screenY = e.clientY;
        if (e.button === 0) {
          this.mouse.leftDown = true;
          this.tryFireLocalBullet();
        } else if (e.button === 2) {
          e.preventDefault();
          this.tryThrowLocalGrenade(true);
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.leftDown = false;
      });

      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      // Lobby buttons
      this.dom.startServerBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        const port = this.dom.portInput.value.trim() || '60001';
        this.dom.portInput.value = port;
        this.mode = 'host';
        this.localPlayerId = 'p1';
        window.PaintballNetwork.startServer(port);
      });

      this.dom.joinServerBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        const port = this.dom.portInput.value.trim() || '60001';
        this.dom.portInput.value = port;
        this.mode = 'client';
        this.localPlayerId = 'p2';
        window.PaintballNetwork.joinServer(port);
      });

      this.dom.practiceBotBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        this.startBotMatch();
      });

      // HUD buttons
      this.dom.muteBtn.addEventListener('click', () => {
        window.PaintballAudio.toggleMute();
        this._updateMuteUI();
      });

      this.dom.touchToggleBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        this.setMobileControlsVisible(this.dom.mobileControls.classList.contains('hidden'));
      });

      this.dom.restartBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        this.requestRestartGame();
      });

      this.dom.roundRestartBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        this.requestRestartGame();
      });

      this.dom.restartYesBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        this.confirmRestartVote(true);
      });

      this.dom.restartNoBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        this.confirmRestartVote(false);
      });

      this.dom.disconnectLobbyBtn.addEventListener('click', () => {
        window.PaintballAudio.playUIClick();
        this.returnToLobby();
      });

      // Network callbacks
      window.PaintballNetwork.onStatus((msg) => {
        this.dom.lobbyStatus.textContent = msg;
      });

      window.PaintballNetwork.onConnect(() => {
        if (this.mode === 'host') {
          this.mapSeed = (Date.now() & 0x7fffffff) || 12345;
          this.resetMatch(this.mapSeed);
          window.PaintballNetwork.send({
            type: 'match_init',
            seed: this.mapSeed
          });
          this._enterArenaUI();
        } else if (this.mode === 'client') {
          this._enterArenaUI();
        }
      });

      window.PaintballNetwork.onDisconnect((reason) => {
        if (this.mode === 'host' || this.mode === 'client') {
          this.roundOver = true;
          this.dom.restartModal.classList.add('hidden');
          this.dom.roundOverModal.classList.add('hidden');
          this.dom.disconnectTitle.textContent =
            this.mode === 'client' ? 'Server Dropped!' : 'Opponent Disconnected!';
          this.dom.disconnectReason.textContent =
            reason || 'Connection to the other player was lost (did someone rage quit?).';
          this.dom.disconnectModal.classList.remove('hidden');
          window.PaintballAudio.playHit(true);
        }
      });

      window.PaintballNetwork.onMessage((msg) => this._handleNetworkMessage(msg));

      // Mobile Twin-Stick + Dedicated Fire & Grenade Touch/Pointer Controls
      this._initMobileTouchControls();
    }

    _initMobileTouchControls() {
      const bindStick = (zoneEl, knobEl, isRightStick) => {
        const radius = 52;

        const updateFromPoint = (clientX, clientY) => {
          const rect = zoneEl.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          let dx = clientX - cx;
          let dy = clientY - cy;
          const dist = Math.hypot(dx, dy);
          if (dist > radius) {
            dx = (dx / dist) * radius;
            dy = (dy / dist) * radius;
          }
          knobEl.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
          const normX = dx / radius;
          const normY = dy / radius;

          if (!isRightStick) {
            this.mobileInput.leftX = normX;
            this.mobileInput.leftY = normY;
          } else {
            this.mobileInput.rightX = normX;
            this.mobileInput.rightY = normY;
            if (Math.hypot(normX, normY) > 0.22) {
              const local = this.getLocalPlayer();
              local.angle = Math.atan2(normY, normX);
            }
          }
        };

        const resetStick = () => {
          knobEl.style.transform = 'translate(0px, 0px)';
          if (!isRightStick) {
            this.mobileInput.leftActive = false;
            this.mobileInput.leftId = null;
            this.mobileInput.leftX = 0;
            this.mobileInput.leftY = 0;
          } else {
            this.mobileInput.rightActive = false;
            this.mobileInput.rightId = null;
            this.mobileInput.rightX = 0;
            this.mobileInput.rightY = 0;
          }
        };

        zoneEl.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.PaintballAudio.initContext();
          zoneEl.setPointerCapture(e.pointerId);
          if (!isRightStick) {
            this.mobileInput.leftActive = true;
            this.mobileInput.leftId = e.pointerId;
          } else {
            this.mobileInput.rightActive = true;
            this.mobileInput.rightId = e.pointerId;
          }
          updateFromPoint(e.clientX, e.clientY);
          // Right stick is purely for aiming / looking around (no auto-fire!)
        });

        zoneEl.addEventListener('pointermove', (e) => {
          if (!isRightStick && this.mobileInput.leftActive && e.pointerId === this.mobileInput.leftId) {
            updateFromPoint(e.clientX, e.clientY);
          } else if (isRightStick && this.mobileInput.rightActive && e.pointerId === this.mobileInput.rightId) {
            updateFromPoint(e.clientX, e.clientY);
          }
        });

        zoneEl.addEventListener('pointerup', (e) => {
          if (!isRightStick && e.pointerId === this.mobileInput.leftId) resetStick();
          if (isRightStick && e.pointerId === this.mobileInput.rightId) resetStick();
        });

        zoneEl.addEventListener('pointercancel', () => resetStick());
      };

      bindStick(this.dom.leftStickZone, this.dom.leftStickKnob, false);
      bindStick(this.dom.rightStickZone, this.dom.rightStickKnob, true);

      // Dedicated Mobile FIRE button (tap or hold to fire normal paintballs)
      this.dom.mobileFireBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.PaintballAudio.initContext();
        this.dom.mobileFireBtn.setPointerCapture(e.pointerId);
        this.mobileInput.fireButtonHeld = true;
        this.tryFireLocalBullet();
      });
      this.dom.mobileFireBtn.addEventListener('pointerup', () => {
        this.mobileInput.fireButtonHeld = false;
      });
      this.dom.mobileFireBtn.addEventListener('pointercancel', () => {
        this.mobileInput.fireButtonHeld = false;
      });

      // Dedicated Mobile GRENADE button
      this.dom.mobileGrenadeBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.PaintballAudio.initContext();
        this.tryThrowLocalGrenade(false);
      });
    }

    setMobileControlsVisible(visible) {
      this.mobileInput.enabled = visible;
      if (visible) {
        this.dom.mobileControls.classList.remove('hidden');
      } else {
        this.dom.mobileControls.classList.add('hidden');
      }
    }

    _resizeCanvas() {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      const isMobileViewport =
        window.innerWidth <= 900 ||
        window.matchMedia('(pointer: coarse)').matches ||
        'ontouchstart' in window;
      if (this.mode !== 'menu' && isMobileViewport) {
        this.setMobileControlsVisible(true);
      }
    }

    _updateMuteUI() {
      const muted = window.PaintballAudio.muted;
      this.dom.muteBtn.textContent = muted ? 'Sound: OFF' : 'Sound: ON';
    }

    _enterArenaUI() {
      this.dom.lobbyOverlay.classList.add('hidden');
      this.dom.hud.classList.remove('hidden');
      this.dom.restartModal.classList.add('hidden');
      this.dom.roundOverModal.classList.add('hidden');
      this.dom.disconnectModal.classList.add('hidden');

      if (this.localPlayerId === 'p1') {
        this.dom.p1Label.textContent = 'Player 1 (YOU)';
        this.dom.p2Label.textContent = this.mode === 'bot' ? 'AI Bot (P2)' : 'Player 2';
      } else {
        this.dom.p1Label.textContent = 'Player 1';
        this.dom.p2Label.textContent = 'Player 2 (YOU)';
      }

      const isMobileViewport =
        window.innerWidth <= 900 ||
        window.matchMedia('(pointer: coarse)').matches ||
        'ontouchstart' in window;
      this.setMobileControlsVisible(isMobileViewport);
      this._updateHUD();
    }

    returnToLobby() {
      window.PaintballNetwork.cleanup();
      this.mode = 'menu';
      this.roundOver = false;
      this.dom.disconnectModal.classList.add('hidden');
      this.dom.restartModal.classList.add('hidden');
      this.dom.roundOverModal.classList.add('hidden');
      this.dom.hud.classList.add('hidden');
      this.dom.mobileControls.classList.add('hidden');
      this.dom.lobbyOverlay.classList.remove('hidden');
      this.dom.lobbyStatus.textContent =
        'Ready. Enter port (default 60001) and click Start Server, Join Server, or Practice vs. AI Bot.';
    }

    startBotMatch() {
      window.PaintballNetwork.cleanup();
      this.mode = 'bot';
      this.localPlayerId = 'p1';
      this.mapSeed = (Date.now() & 0x7fffffff) || 54321;
      window.PaintballBotAI.reset();
      this.resetMatch(this.mapSeed);
      this._enterArenaUI();
    }

    resetMatch(seed) {
      this.mapSeed = seed;
      this.generateMap(seed);

      // Player 1 always spawns far left, Player 2 always spawns far right
      this.players.p1 = this._createPlayer('p1', 110, ARENA_H / 2, 0, '#ff6b2b', '#ff9e73');
      this.players.p2 = this._createPlayer(
        'p2',
        ARENA_W - 110,
        ARENA_H / 2,
        Math.PI,
        '#76e024',
        '#b4f57f'
      );

      this.bullets = [];
      this.grenades = [];
      this.splatters = [];
      this.particles = [];
      this.floatingTexts = [];
      this.roundOver = false;
      this.winnerId = null;
      this.pendingRestartRequest = false;

      this.dom.restartModal.classList.add('hidden');
      this.dom.roundOverModal.classList.add('hidden');
      this.dom.restartBtn.textContent = 'Restart Game';
      this._updateHUD();
    }

    // Procedurally generate obstacles (crates, containers, trees) with guaranteed freedom of movement
    generateMap(seed) {
      const rng = createSeededRandom(seed);
      const obstacles = [];

      // Keep spawn zones clear on far left and far right
      const leftSpawnClearX = 235;
      const rightSpawnClearX = ARENA_W - 235;
      const wallMargin = 92;
      const minClearance = 84; // Guarantees generous player freedom of movement around every obstacle

      const containerVariants = ['container_rust', 'container_ochre', 'container_olive'];

      // Attempt to place a balanced tactical mix of containers, crates, and trees
      const templates = [
        // 6 Shipping Containers (Tall cover - grenades bounce off!)
        { type: 'container', heightType: 'tall', w: 150, h: 68 },
        { type: 'container', heightType: 'tall', w: 68, h: 150 },
        { type: 'container', heightType: 'tall', w: 150, h: 68 },
        { type: 'container', heightType: 'tall', w: 68, h: 150 },
        { type: 'container', heightType: 'tall', w: 150, h: 68 },
        { type: 'container', heightType: 'tall', w: 68, h: 150 },
        // 8 Wooden Crates (Low cover - grenades lob OVER these!)
        { type: 'crate', heightType: 'low', w: 64, h: 64 },
        { type: 'crate', heightType: 'low', w: 64, h: 64 },
        { type: 'crate', heightType: 'low', w: 64, h: 64 },
        { type: 'crate', heightType: 'low', w: 64, h: 64 },
        { type: 'crate', heightType: 'low', w: 64, h: 64 },
        { type: 'crate', heightType: 'low', w: 64, h: 64 },
        { type: 'crate', heightType: 'low', w: 64, h: 64 },
        { type: 'crate', heightType: 'low', w: 64, h: 64 },
        // 5 Trees (Tall cover - grenades bounce off!)
        { type: 'tree', heightType: 'tall', w: 68, h: 68 },
        { type: 'tree', heightType: 'tall', w: 68, h: 68 },
        { type: 'tree', heightType: 'tall', w: 68, h: 68 },
        { type: 'tree', heightType: 'tall', w: 68, h: 68 },
        { type: 'tree', heightType: 'tall', w: 68, h: 68 }
      ];

      for (let i = 0; i < templates.length; i++) {
        const tpl = templates[i];
        let placed = false;

        for (let attempt = 0; attempt < 90; attempt++) {
          const minX = leftSpawnClearX;
          const maxX = rightSpawnClearX - tpl.w;
          const minY = wallMargin;
          const maxY = ARENA_H - wallMargin - tpl.h;

          const x = Math.round(minX + rng() * (maxX - minX));
          const y = Math.round(minY + rng() * (maxY - minY));

          let overlaps = false;
          for (let j = 0; j < obstacles.length; j++) {
            const ob = obstacles[j];
            if (
              x < ob.x + ob.w + minClearance &&
              x + tpl.w + minClearance > ob.x &&
              y < ob.y + ob.h + minClearance &&
              y + tpl.h + minClearance > ob.y
            ) {
              overlaps = true;
              break;
            }
          }

          if (!overlaps) {
            const variant =
              tpl.type === 'container'
                ? containerVariants[Math.floor(rng() * containerVariants.length)]
                : tpl.type;
            obstacles.push({
              id: `ob_${i}`,
              x,
              y,
              w: tpl.w,
              h: tpl.h,
              type: tpl.type,
              heightType: tpl.heightType, // 'low' (crate) | 'tall' (container, tree)
              variant
            });
            placed = true;
            break;
          }
        }
      }

      this.obstacles = obstacles;
    }

    getLocalPlayer() {
      return this.players[this.localPlayerId];
    }

    getRemotePlayer() {
      return this.localPlayerId === 'p1' ? this.players.p2 : this.players.p1;
    }

    // Mutual Restart Proposal
    requestRestartGame() {
      if (this.mode === 'menu') return;

      if (this.mode === 'bot') {
        // AI Bot immediately agrees to restart
        const newSeed = ((this.mapSeed * 1664525 + 1013904223) & 0x7fffffff) || Date.now();
        window.PaintballBotAI.reset();
        this.resetMatch(newSeed);
        return;
      }

      if (this.pendingRestartRequest) return;
      this.pendingRestartRequest = true;
      this.dom.restartBtn.textContent = 'Waiting for Approval...';
      window.PaintballNetwork.send({
        type: 'restart_request',
        from: this.localPlayerId
      });
    }

    confirmRestartVote(agreed) {
      this.dom.restartModal.classList.add('hidden');
      if (agreed) {
        const newSeed = (Date.now() & 0x7fffffff) || 98765;
        window.PaintballNetwork.send({
          type: 'restart_confirm',
          agreed: true,
          seed: newSeed
        });
        this.resetMatch(newSeed);
      } else {
        window.PaintballNetwork.send({
          type: 'restart_confirm',
          agreed: false
        });
      }
    }

    _handleNetworkMessage(msg) {
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'match_init':
          this.resetMatch(msg.seed);
          this._enterArenaUI();
          break;

        case 'player_state': {
          const remote = this.players[msg.id];
          if (remote && msg.id !== this.localPlayerId) {
            remote.x = msg.x;
            remote.y = msg.y;
            remote.vx = msg.vx;
            remote.vy = msg.vy;
            remote.angle = msg.angle;
          }
          break;
        }

        case 'spawn_bullet':
          this._spawnBulletInternal(msg.ownerId, msg.x, msg.y, msg.angle, msg.color, false);
          break;

        case 'spawn_grenade':
          this._spawnGrenadeInternal(
            msg.ownerId,
            msg.x,
            msg.y,
            msg.angle,
            msg.targetDist,
            msg.color,
            false
          );
          break;

        case 'damage_sync': {
          const p = this.players[msg.targetId];
          if (p) {
            p.hp = Math.max(0, msg.newHp);
            p.hitFlash = 0.25;
            this._updateHUD();
            if (p.hp <= 0 && !this.roundOver) {
              this._triggerRoundOver(msg.winnerId);
            }
          }
          break;
        }

        case 'restart_request':
          this.dom.restartPromptText.textContent =
            'Other player wants to restart the game. Agree?';
          this.dom.restartModal.classList.remove('hidden');
          break;

        case 'restart_confirm':
          this.pendingRestartRequest = false;
          this.dom.restartBtn.textContent = 'Restart Game';
          if (msg.agreed) {
            this.resetMatch(msg.seed);
          }
          break;
      }
    }

    tryFireLocalBullet() {
      if (this.mode === 'menu' || this.roundOver) return;
      const local = this.getLocalPlayer();
      if (local.hp <= 0 || local.fireCooldown > 0) return;

      local.fireCooldown = FIRE_COOLDOWN;
      const spawnDist = local.radius + 8;
      const bx = local.x + Math.cos(local.angle) * spawnDist;
      const by = local.y + Math.sin(local.angle) * spawnDist;

      this._spawnBulletInternal(local.id, bx, by, local.angle, local.color, true);
    }

    _spawnBulletInternal(ownerId, x, y, angle, color, broadcast) {
      this.bullets.push({
        ownerId,
        x,
        y,
        startX: x,
        startY: y,
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        radius: 5,
        color,
        maxRange: BULLET_MAX_RANGE
      });

      window.PaintballAudio.playShoot();

      if (broadcast && (this.mode === 'host' || this.mode === 'client')) {
        window.PaintballNetwork.send({
          type: 'spawn_bullet',
          ownerId,
          x,
          y,
          angle,
          color
        });
      }
    }

    tryThrowLocalGrenade(useMouseDistance) {
      if (this.mode === 'menu' || this.roundOver) return;
      const local = this.getLocalPlayer();
      if (local.hp <= 0 || local.grenadeCooldown > 0) return;

      let targetDist = 275;
      if (useMouseDistance) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const rawDist = Math.hypot(this.mouse.screenX - cx, this.mouse.screenY - cy);
        targetDist = Math.max(GRENADE_MIN_RANGE, Math.min(GRENADE_MAX_RANGE, rawDist));
      }

      local.grenadeCooldown = GRENADE_COOLDOWN;
      const spawnDist = local.radius + 6;
      const gx = local.x + Math.cos(local.angle) * spawnDist;
      const gy = local.y + Math.sin(local.angle) * spawnDist;

      this._spawnGrenadeInternal(local.id, gx, gy, local.angle, targetDist, local.color, true);
      this._updateHUD();
    }

    _spawnGrenadeInternal(ownerId, x, y, angle, targetDist, color, broadcast) {
      const clampedDist = Math.max(GRENADE_MIN_RANGE, Math.min(GRENADE_MAX_RANGE, targetDist));
      const speed = clampedDist / GRENADE_FLIGHT_TIME;

      this.grenades.push({
        ownerId,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        z: 10,
        elapsed: 0,
        duration: GRENADE_FLIGHT_TIME,
        radius: 8,
        color,
        bounced: false
      });

      window.PaintballAudio.playGrenadeThrow();

      if (broadcast && (this.mode === 'host' || this.mode === 'client')) {
        window.PaintballNetwork.send({
          type: 'spawn_grenade',
          ownerId,
          x,
          y,
          angle,
          targetDist: clampedDist,
          color
        });
      }
    }

    _loop(now) {
      const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;

      if (this.mode !== 'menu') {
        this._update(dt);
      }
      this._render();

      requestAnimationFrame((t) => this._loop(t));
    }

    _update(dt) {
      const local = this.getLocalPlayer();

      // Cooldowns & hit flashes
      ['p1', 'p2'].forEach((id) => {
        const p = this.players[id];
        if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
        if (p.grenadeCooldown > 0) {
          p.grenadeCooldown = Math.max(0, p.grenadeCooldown - dt);
          if (id === this.localPlayerId) this._updateGrenadeHUD();
        }
        if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
      });

      if (!this.roundOver && local.hp > 0) {
        this._updateLocalPlayerInput(dt, local);
      } else {
        local.vx = 0;
        local.vy = 0;
      }

      // Move local player and resolve collisions with arena walls & obstacles
      this._movePlayerWithCollisions(local, dt);

      // Update AI Bot if in Practice vs. Bot mode
      if (this.mode === 'bot' && !this.roundOver) {
        const bot = this.players.p2;
        window.PaintballBotAI.update(
          dt,
          bot,
          this.players.p1,
          this.obstacles,
          this.arenaW,
          this.arenaH,
          {
            shoot: (ang) => {
              if (bot.fireCooldown <= 0) {
                bot.fireCooldown = FIRE_COOLDOWN * 1.35;
                const bx = bot.x + Math.cos(ang) * (bot.radius + 8);
                const by = bot.y + Math.sin(ang) * (bot.radius + 8);
                this._spawnBulletInternal('p2', bx, by, ang, bot.color, false);
              }
            },
            throwGrenade: (ang, dist) => {
              if (bot.grenadeCooldown <= 0) {
                bot.grenadeCooldown = GRENADE_COOLDOWN * 1.25;
                const gx = bot.x + Math.cos(ang) * (bot.radius + 6);
                const gy = bot.y + Math.sin(ang) * (bot.radius + 6);
                this._spawnGrenadeInternal('p2', gx, gy, ang, dist, bot.color, false);
              }
            }
          },
          {
            fov: VIEW_FOV,
            viewRange: VIEW_RANGE,
            closeSense: CLOSE_SENSE_RADIUS,
            bulletRange: BULLET_MAX_RANGE,
            grenadeRange: GRENADE_MAX_RANGE
          }
        );
        this._movePlayerWithCollisions(bot, dt);
      }

      // Broadcast local player state to remote peer at ~30Hz
      if (this.mode === 'host' || this.mode === 'client') {
        this.netSyncTimer += dt;
        if (this.netSyncTimer >= 0.033) {
          this.netSyncTimer = 0;
          window.PaintballNetwork.send({
            type: 'player_state',
            id: local.id,
            x: local.x,
            y: local.y,
            vx: local.vx,
            vy: local.vy,
            angle: local.angle
          });
        }
      }

      // Update Normal Paintball Bullets
      this._updateBullets(dt);

      // Update Paint Grenades (arcing over crates, bouncing off tall containers/trees)
      this._updateGrenades(dt);

      // Update transient visual particles & floating combat text
      this._updateParticles(dt);
    }

    _updateLocalPlayerInput(dt, local) {
      let mx = 0;
      let my = 0;

      if (this.keys['KeyW'] || this.keys['ArrowUp']) my -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) my += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;

      if (this.mobileInput.leftActive) {
        mx += this.mobileInput.leftX;
        my += this.mobileInput.leftY;
      }

      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }

      local.vx = mx * local.speed;
      local.vy = my * local.speed;

      // Aiming: if right mobile stick is active, it controls angle ONLY (no auto-fire);
      // Mobile firing only happens when the dedicated mobile FIRE button is pressed/held!
      if (this.mobileInput.rightActive) {
        if (Math.hypot(this.mobileInput.rightX, this.mobileInput.rightY) > 0.18) {
          local.angle = Math.atan2(this.mobileInput.rightY, this.mobileInput.rightX);
        }
      } else if (!this.mobileInput.leftActive && !this.mobileInput.fireButtonHeld) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const dx = this.mouse.screenX - cx;
        const dy = this.mouse.screenY - cy;
        if (Math.hypot(dx, dy) > 4) {
          local.angle = Math.atan2(dy, dx);
        }
        if (this.mouse.leftDown) {
          this.tryFireLocalBullet();
        }
      }

      if (this.mobileInput.fireButtonHeld) {
        this.tryFireLocalBullet();
      }
    }

    _movePlayerWithCollisions(player, dt) {
      // Move X axis then resolve
      player.x += player.vx * dt;
      player.x = Math.max(player.radius + 8, Math.min(this.arenaW - player.radius - 8, player.x));
      this._resolvePlayerObstacleCollisions(player);

      // Move Y axis then resolve
      player.y += player.vy * dt;
      player.y = Math.max(player.radius + 8, Math.min(this.arenaH - player.radius - 8, player.y));
      this._resolvePlayerObstacleCollisions(player);
    }

    _resolvePlayerObstacleCollisions(player) {
      for (let i = 0; i < this.obstacles.length; i++) {
        const ob = this.obstacles[i];
        const closestX = Math.max(ob.x, Math.min(player.x, ob.x + ob.w));
        const closestY = Math.max(ob.y, Math.min(player.y, ob.y + ob.h));
        const dx = player.x - closestX;
        const dy = player.y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < player.radius * player.radius) {
          const dist = Math.sqrt(distSq);
          if (dist > 1e-4) {
            const overlap = player.radius - dist;
            player.x += (dx / dist) * overlap;
            player.y += (dy / dist) * overlap;
          } else {
            // Player center is inside AABB (rare): push out along shallowest axis
            const leftPen = player.x - ob.x;
            const rightPen = ob.x + ob.w - player.x;
            const topPen = player.y - ob.y;
            const botPen = ob.y + ob.h - player.y;
            const minPen = Math.min(leftPen, rightPen, topPen, botPen);
            if (minPen === leftPen) player.x = ob.x - player.radius;
            else if (minPen === rightPen) player.x = ob.x + ob.w + player.radius;
            else if (minPen === topPen) player.y = ob.y - player.radius;
            else player.y = ob.y + ob.h + player.radius;
          }
        }
      }
    }

    _updateBullets(dt) {
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        const stepX = b.vx * dt;
        const stepY = b.vy * dt;
        b.x += stepX;
        b.y += stepY;

        // 1. Check Arena Boundaries
        if (b.x < 8 || b.x > this.arenaW - 8 || b.y < 8 || b.y > this.arenaH - 8) {
          this._addPaintSplatter(b.x, b.y, b.color, 12, 5);
          window.PaintballAudio.playSplat();
          this.bullets.splice(i, 1);
          continue;
        }

        // 2. Check Obstacle Collisions (Bullets NEVER travel through obstacles!)
        let hitObstacle = false;
        for (let j = 0; j < this.obstacles.length; j++) {
          const ob = this.obstacles[j];
          if (
            b.x + b.radius > ob.x &&
            b.x - b.radius < ob.x + ob.w &&
            b.y + b.radius > ob.y &&
            b.y - b.radius < ob.y + ob.h
          ) {
            this._addPaintSplatter(b.x, b.y, b.color, 14, 6);
            this._spawnSplashParticles(b.x, b.y, b.color, 8);
            window.PaintballAudio.playSplat();
            hitObstacle = true;
            break;
          }
        }
        if (hitObstacle) {
          this.bullets.splice(i, 1);
          continue;
        }

        // 3. Check Player Hit
        const targetId = b.ownerId === 'p1' ? 'p2' : 'p1';
        const target = this.players[targetId];
        if (target && target.hp > 0) {
          const dist = Math.hypot(b.x - target.x, b.y - target.y);
          if (dist <= target.radius + b.radius) {
            this._addPaintSplatter(b.x, b.y, b.color, 18, 8);
            this._spawnSplashParticles(b.x, b.y, b.color, 14);
            window.PaintballAudio.playHit(false);
            this._applyDamage(targetId, NORMAL_DAMAGE, b.ownerId, false);
            this.bullets.splice(i, 1);
            continue;
          }
        }

        // 4. Check Limited Paintball Range (drops & splatters on turf at maxRange)
        const traveled = Math.hypot(b.x - b.startX, b.y - b.startY);
        if (traveled >= b.maxRange) {
          this._addPaintSplatter(b.x, b.y, b.color, 11, 4);
          this.bullets.splice(i, 1);
        }
      }
    }

    _updateGrenades(dt) {
      for (let i = this.grenades.length - 1; i >= 0; i--) {
        const g = this.grenades[i];
        g.elapsed += dt;

        const prevX = g.x;
        const prevY = g.y;
        let nextX = g.x + g.vx * dt;
        let nextY = g.y + g.vy * dt;

        // Parabolic arc height (peaks at z = 68 in the middle of the throw)
        const progress = Math.min(1, g.elapsed / g.duration);
        g.z = Math.sin(progress * Math.PI) * 68;

        // Bounce off arena boundary walls
        if (nextX < 14 || nextX > this.arenaW - 14) {
          g.vx *= -0.7;
          nextX = Math.max(14, Math.min(this.arenaW - 14, nextX));
          g.bounced = true;
          window.PaintballAudio.playGrenadeBounce();
        }
        if (nextY < 14 || nextY > this.arenaH - 14) {
          g.vy *= -0.7;
          nextY = Math.max(14, Math.min(this.arenaH - 14, nextY));
          g.bounced = true;
          window.PaintballAudio.playGrenadeBounce();
        }

        // Check obstacles:
        // - Low obstacles (wooden crates: heightType === 'low'): Grenade arcs OVER them!
        // - Tall obstacles (containers & trees: heightType === 'tall'): Grenade BOUNCES off them!
        for (let j = 0; j < this.obstacles.length; j++) {
          const ob = this.obstacles[j];
          if (ob.heightType !== 'tall') continue; // Lobs cleanly over low crates!

          const pad = g.radius;
          if (
            nextX + pad > ob.x &&
            nextX - pad < ob.x + ob.w &&
            nextY + pad > ob.y &&
            nextY - pad < ob.y + ob.h
          ) {
            // Determine whether it struck a horizontal or vertical face using previous position
            const wasLeft = prevX + pad <= ob.x;
            const wasRight = prevX - pad >= ob.x + ob.w;
            const wasAbove = prevY + pad <= ob.y;
            const wasBelow = prevY - pad >= ob.y + ob.h;

            if (wasLeft || wasRight) {
              g.vx *= -0.68;
              nextX = wasLeft ? ob.x - pad - 1 : ob.x + ob.w + pad + 1;
            } else if (wasAbove || wasBelow) {
              g.vy *= -0.68;
              nextY = wasAbove ? ob.y - pad - 1 : ob.y + ob.h + pad + 1;
            } else {
              g.vx *= -0.68;
              g.vy *= -0.68;
            }

            g.bounced = true;
            this._spawnSplashParticles(nextX, nextY, '#f5c731', 5);
            window.PaintballAudio.playGrenadeBounce();
            break;
          }
        }

        g.x = nextX;
        g.y = nextY;

        // Detonate when flight timer completes (and ensure it doesn't detonate inside a low crate)
        if (g.elapsed >= g.duration) {
          this._pushPointOutOfObstacles(g);
          this._detonateGrenade(g);
          this.grenades.splice(i, 1);
        }
      }
    }

    _pushPointOutOfObstacles(pt) {
      for (let i = 0; i < this.obstacles.length; i++) {
        const ob = this.obstacles[i];
        if (pt.x > ob.x && pt.x < ob.x + ob.w && pt.y > ob.y && pt.y < ob.y + ob.h) {
          const dLeft = pt.x - ob.x;
          const dRight = ob.x + ob.w - pt.x;
          const dTop = pt.y - ob.y;
          const dBot = ob.y + ob.h - pt.y;
          const minD = Math.min(dLeft, dRight, dTop, dBot);
          if (minD === dLeft) pt.x = ob.x - 4;
          else if (minD === dRight) pt.x = ob.x + ob.w + 4;
          else if (minD === dTop) pt.y = ob.y - 4;
          else pt.y = ob.y + ob.h + 4;
        }
      }
    }

    _detonateGrenade(g) {
      window.PaintballAudio.playGrenadeExplode();

      // Center paint burst
      this._addPaintSplatter(g.x, g.y, g.color, 28, 12);
      this._spawnSplashParticles(g.x, g.y, g.color, 28);

      // Cast paint splatter rays outward up to GRENADE_SPLASH_RADIUS, blocked by ANY obstacle!
      const rayCount = 24;
      for (let r = 0; r < rayCount; r++) {
        const ang = (r / rayCount) * Math.PI * 2;
        const hit = window.PaintballVisibility.castRay(
          g.x,
          g.y,
          ang,
          GRENADE_SPLASH_RADIUS,
          this.obstacles
        );
        const dropDist = Math.min(hit.dist - 3, (0.35 + Math.random() * 0.65) * GRENADE_SPLASH_RADIUS);
        if (dropDist > 8) {
          const sx = g.x + Math.cos(ang) * dropDist;
          const sy = g.y + Math.sin(ang) * dropDist;
          this._addPaintSplatter(sx, sy, g.color, 10 + Math.random() * 10, 4);
        }
      }

      // Check splash damage against BOTH players (including SELF-DAMAGE if owner is within splash & unobstructed!)
      ['p1', 'p2'].forEach((pid) => {
        const p = this.players[pid];
        if (!p || p.hp <= 0) return;

        const dist = Math.hypot(p.x - g.x, p.y - g.y);
        if (dist <= GRENADE_SPLASH_RADIUS + p.radius) {
          // Grenade splatter CANNOT travel through any obstacle!
          const unobstructed = window.PaintballVisibility.hasLineOfSight(
            g.x,
            g.y,
            p.x,
            p.y,
            this.obstacles
          );
          if (unobstructed) {
            const isSelfDamage = pid === g.ownerId;
            window.PaintballAudio.playHit(isSelfDamage);
            this._applyDamage(pid, GRENADE_DAMAGE, g.ownerId, isSelfDamage);
          }
        }
      });
    }

    _applyDamage(targetId, amount, attackerId, isSelfDamage) {
      const target = this.players[targetId];
      if (!target || target.hp <= 0 || this.roundOver) return;

      // Authoritative check: apply locally and sync if needed
      target.hp = Math.max(0, target.hp - amount);
      target.hitFlash = 0.28;

      this.floatingTexts.push({
        x: target.x,
        y: target.y - 26,
        text: isSelfDamage ? `SELF SPLASH! -${amount} HP` : `-${amount} HP`,
        color: isSelfDamage ? '#f5c731' : '#ef4b4b',
        life: 1.1
      });

      this._updateHUD();

      const winnerId = targetId === 'p1' ? 'p2' : 'p1';
      if (this.mode === 'host' || this.mode === 'client') {
        window.PaintballNetwork.send({
          type: 'damage_sync',
          targetId,
          newHp: target.hp,
          winnerId
        });
      }

      if (target.hp <= 0) {
        this._triggerRoundOver(winnerId);
      }
    }

    _triggerRoundOver(winnerId) {
      this.roundOver = true;
      this.winnerId = winnerId;

      const localWon = winnerId === this.localPlayerId;
      window.PaintballAudio.playRoundEnd(localWon);

      this.dom.roundWinnerTitle.textContent =
        winnerId === 'p1' ? 'Player 1 Wins!' : this.mode === 'bot' ? 'AI Bot Wins!' : 'Player 2 Wins!';
      this.dom.roundWinnerTitle.style.color = winnerId === 'p1' ? '#ff6b2b' : '#76e024';
      this.dom.roundWinnerSub.textContent = localWon
        ? 'Direct paint elimination! Ready for the next arena layout?'
        : 'You got splatted! Click below to propose a fresh round.';
      this.dom.roundOverModal.classList.remove('hidden');
    }

    _addPaintSplatter(x, y, color, radius, blobs) {
      const droplets = [];
      for (let i = 0; i < blobs; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * radius * 0.85;
        droplets.push({
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d,
          r: (0.28 + Math.random() * 0.45) * radius
        });
      }
      this.splatters.push({ x, y, color, radius, droplets });
      if (this.splatters.length > 260) {
        this.splatters.shift();
      }
    }

    _spawnSplashParticles(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 45 + Math.random() * 165;
        this.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          r: 2.5 + Math.random() * 3.5,
          color,
          life: 0.25 + Math.random() * 0.25
        });
      }
    }

    _updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) this.particles.splice(i, 1);
      }

      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.y -= 28 * dt;
        ft.life -= dt;
        if (ft.life <= 0) this.floatingTexts.splice(i, 1);
      }
    }

    _updateHUD() {
      const renderPips = (container, hp, pipClass) => {
        container.innerHTML = '';
        for (let i = 0; i < MAX_HP; i++) {
          const pip = document.createElement('div');
          pip.className = `hp-pip ${pipClass}` + (i < hp ? ' active' : '');
          container.appendChild(pip);
        }
      };

      renderPips(this.dom.p1Pips, this.players.p1.hp, 'p1-pip');
      renderPips(this.dom.p2Pips, this.players.p2.hp, 'p2-pip');

      const p1ShotsLeft = Math.ceil(this.players.p1.hp / NORMAL_DAMAGE);
      const p2ShotsLeft = Math.ceil(this.players.p2.hp / NORMAL_DAMAGE);
      this.dom.p1HpText.textContent = `${this.players.p1.hp}/${MAX_HP} HP (${p1ShotsLeft} hits)`;
      this.dom.p2HpText.textContent = `${this.players.p2.hp}/${MAX_HP} HP (${p2ShotsLeft} hits)`;

      this._updateGrenadeHUD();
    }

    _updateGrenadeHUD() {
      const local = this.getLocalPlayer();
      if (local.grenadeCooldown <= 0) {
        this.dom.grenadeDot.classList.remove('cooldown');
        this.dom.grenadeStatusText.textContent = 'Grenade: READY (RMB)';
        this.dom.mobileGrenadeBtn.classList.remove('cooldown');
        this.dom.mobileGrenadeBtn.innerHTML = 'PAINT<br>GRENADE';
      } else {
        this.dom.grenadeDot.classList.add('cooldown');
        const rem = local.grenadeCooldown.toFixed(1);
        this.dom.grenadeStatusText.textContent = `Grenade: ${rem}s`;
        this.dom.mobileGrenadeBtn.classList.add('cooldown');
        this.dom.mobileGrenadeBtn.innerHTML = `${rem}s`;
      }
    }

    // GTA 2/3 Style Top-Down Renderer with Tactical Fog of War & Dynamic Obstacle Shadows
    _render() {
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;

      ctx.fillStyle = '#141713';
      ctx.fillRect(0, 0, cw, ch);

      const local = this.getLocalPlayer();
      const remote = this.getRemotePlayer();

      // Camera keeps local player centered in the middle of the viewport
      const camX = cw / 2 - local.x;
      const camY = ch / 2 - local.y;

      // Compute exact 2D visibility polygon for local player's vision cone
      const coneResult = window.PaintballVisibility.computeVisibilityCone(
        local.x,
        local.y,
        local.angle,
        VIEW_FOV,
        VIEW_RANGE,
        this.obstacles
      );
      const visionPolygon = coneResult.points;
      const litObstacles = coneResult.litObstacles;

      ctx.save();
      ctx.translate(camX, camY);

      // 1. Draw Arena Floor & Boundaries (Dimmed baseline for Tactical Fog of War)
      this._drawArenaFloor(ctx);

      // 2. Draw Static Obstacles (Crates, Containers, Trees) in baseline tactical view
      this._drawObstacles(ctx, null);

      // 3. Apply Tactical Fog of War Shade over everything outside the viewable cone & behind obstacles
      ctx.fillStyle = 'rgba(14, 17, 13, 0.64)';
      ctx.fillRect(-1000, -1000, this.arenaW + 2000, this.arenaH + 2000);

      // 4. Clip to the Player's Viewable Cone (plus immediate body awareness circle) and render bright lit world!
      ctx.save();
      ctx.beginPath();
      if (visionPolygon.length > 2) {
        ctx.moveTo(visionPolygon[0].x, visionPolygon[0].y);
        for (let i = 1; i < visionPolygon.length; i++) {
          ctx.lineTo(visionPolygon[i].x, visionPolygon[i].y);
        }
        ctx.closePath();
      }
      ctx.arc(local.x, local.y, CLOSE_SENSE_RADIUS, 0, Math.PI * 2);
      ctx.clip();

      // Draw fully illuminated arena floor and splatters inside the viewable area
      this._drawArenaFloor(ctx);
      this._drawSplatters(ctx);

      // Subtle warm directional light tint inside viewable cone
      const coneGrad = ctx.createRadialGradient(
        local.x,
        local.y,
        20,
        local.x,
        local.y,
        VIEW_RANGE
      );
      coneGrad.addColorStop(0, 'rgba(255, 248, 220, 0.09)');
      coneGrad.addColorStop(0.85, 'rgba(255, 245, 200, 0.03)');
      coneGrad.addColorStop(1, 'rgba(255, 245, 200, 0)');
      ctx.fillStyle = coneGrad;
      ctx.fillRect(0, 0, this.arenaW, this.arenaH);

      ctx.restore();

      // 4b. Draw obstacles directly seen by the vision cone at full brightness (casting shadows behind them)
      this._drawObstacles(ctx, litObstacles);

      // 5. Outline the Viewable Cone boundary subtly (matching requirements sketches)
      this._drawVisionConeOutline(ctx, local, visionPolygon);

      // 6. Draw Enemy Player ONLY if they are in direct unobstructed line-of-sight inside the viewable area!
      const isEnemyVisible = window.PaintballVisibility.isEntityVisible(
        remote.x,
        remote.y,
        remote.radius,
        local.x,
        local.y,
        local.angle,
        VIEW_FOV,
        VIEW_RANGE,
        CLOSE_SENSE_RADIUS,
        this.obstacles
      );
      this.remotePlayerVisible = isEnemyVisible;

      if (isEnemyVisible && remote.hp > 0) {
        this._drawPlayer(ctx, remote, false);
      }

      // 7. Always Draw Local Player in the exact center
      if (local.hp > 0) {
        this._drawPlayer(ctx, local, true);
      }

      // 8. Draw Bullets & Arcing Paint Grenades (only if owned by local player OR visible inside cone)
      this._drawProjectiles(ctx, local);

      // 9. Draw Splash Particles & Floating Hit Numbers
      this._drawEffects(ctx);

      ctx.restore();
    }

    _drawArenaFloor(ctx) {
      if (window.PaintballAssets.turfPattern) {
        ctx.fillStyle = window.PaintballAssets.turfPattern;
      } else {
        ctx.fillStyle = '#333b2c';
      }
      ctx.fillRect(0, 0, this.arenaW, this.arenaH);

      // Spawn Zone Markings (Far Left = Player 1 Orange, Far Right = Player 2 Lime)
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 107, 43, 0.35)';
      ctx.fillStyle = 'rgba(255, 107, 43, 0.07)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.fillRect(24, this.arenaH / 2 - 140, 170, 280);
      ctx.strokeRect(24, this.arenaH / 2 - 140, 170, 280);

      ctx.strokeStyle = 'rgba(118, 224, 36, 0.35)';
      ctx.fillStyle = 'rgba(118, 224, 36, 0.07)';
      ctx.fillRect(this.arenaW - 194, this.arenaH / 2 - 140, 170, 280);
      ctx.strokeRect(this.arenaW - 194, this.arenaH / 2 - 140, 170, 280);
      ctx.restore();

      // Arena Outer Perimeter Timber Wall
      ctx.strokeStyle = '#6b533b';
      ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, this.arenaW, this.arenaH);
      ctx.strokeStyle = '#25211d';
      ctx.lineWidth = 3;
      ctx.strokeRect(7, 7, this.arenaW - 14, this.arenaH - 14);
    }

    _drawSplatters(ctx) {
      for (let i = 0; i < this.splatters.length; i++) {
        const s = this.splatters[i];
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.55, 0, Math.PI * 2);
        for (let j = 0; j < s.droplets.length; j++) {
          const d = s.droplets[j];
          ctx.moveTo(s.x + d.dx + d.r, s.y + d.dy);
          ctx.arc(s.x + d.dx, s.y + d.dy, d.r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }

    _drawObstacles(ctx, filterSet) {
      const sprites = window.PaintballAssets.sprites;
      for (let i = 0; i < this.obstacles.length; i++) {
        const ob = this.obstacles[i];
        if (filterSet && !filterSet.has(ob.id)) continue;

        // Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.fillRect(ob.x + 5, ob.y + 6, ob.w, ob.h);

        if (ob.type === 'crate' && sprites.crate) {
          ctx.drawImage(sprites.crate, ob.x, ob.y, ob.w, ob.h);
        } else if (ob.type === 'container') {
          const sp = sprites[ob.variant] || sprites.container_rust;
          if (sp) {
            if (ob.w >= ob.h) {
              ctx.drawImage(sp, ob.x, ob.y, ob.w, ob.h);
            } else {
              // Rotated vertical shipping container
              ctx.save();
              ctx.translate(ob.x + ob.w / 2, ob.y + ob.h / 2);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(sp, -ob.h / 2, -ob.w / 2, ob.h, ob.w);
              ctx.restore();
            }
          }
        } else if (ob.type === 'tree' && sprites.tree) {
          ctx.drawImage(sprites.tree, ob.x - 10, ob.y - 10, ob.w + 20, ob.h + 20);
        } else {
          ctx.fillStyle = '#7c5836';
          ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
        }
      }
    }

    _drawVisionConeOutline(ctx, local, visionPolygon) {
      if (visionPolygon.length < 3) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 199, 49, 0.26)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(visionPolygon[0].x, visionPolygon[0].y);
      for (let i = 1; i < visionPolygon.length; i++) {
        ctx.lineTo(visionPolygon[i].x, visionPolygon[i].y);
      }
      ctx.closePath();
      ctx.stroke();

      // Subtle range arc indicator for normal paintball max range
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(
        local.x,
        local.y,
        BULLET_MAX_RANGE,
        local.angle - VIEW_FOV / 2,
        local.angle + VIEW_FOV / 2
      );
      ctx.stroke();
      ctx.restore();
    }

    _drawPlayer(ctx, p, isLocal) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.beginPath();
      ctx.arc(2, 4, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Shoulders / Vest
      ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : p.color;
      ctx.strokeStyle = '#181a17';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-14, -18, 26, 36, 9);
      ctx.fill();
      ctx.stroke();

      // Paintball Marker (Gun + Hopper)
      ctx.fillStyle = '#2b2e29';
      ctx.fillRect(8, 3, 22, 6);
      // Colored hopper pod
      ctx.fillStyle = p.lightColor;
      ctx.beginPath();
      ctx.arc(13, 2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Helmet & Goggles
      ctx.fillStyle = '#2d322b';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Visor lens in team color
      ctx.fillStyle = p.lightColor;
      ctx.fillRect(5, -7, 6, 14);

      ctx.restore();

      // Floating mini health bar above character
      const barW = 38;
      const barH = 6;
      const bx = p.x - barW / 2;
      const by = p.y - p.radius - 15;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(bx, by, (p.hp / p.maxHp) * barW, barH);
    }

    _drawProjectiles(ctx, local) {
      // Normal Paintballs
      for (let i = 0; i < this.bullets.length; i++) {
        const b = this.bullets[i];
        const visible =
          b.ownerId === local.id ||
          window.PaintballVisibility.isEntityVisible(
            b.x,
            b.y,
            b.radius,
            local.x,
            local.y,
            local.angle,
            VIEW_FOV,
            VIEW_RANGE,
            CLOSE_SENSE_RADIUS,
            this.obstacles
          );
        if (!visible) continue;

        ctx.fillStyle = b.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Arcing Paint Grenades
      for (let i = 0; i < this.grenades.length; i++) {
        const g = this.grenades[i];
        const visible =
          g.ownerId === local.id ||
          window.PaintballVisibility.isEntityVisible(
            g.x,
            g.y,
            g.radius + 4,
            local.x,
            local.y,
            local.angle,
            VIEW_FOV,
            VIEW_RANGE,
            CLOSE_SENSE_RADIUS,
            this.obstacles
          );
        if (!visible) continue;

        // Ground shadow under arcing grenade
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(g.x, g.y + 4, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Elevated grenade body (scaled by z height so it visibly lobs over crates!)
        const visualY = g.y - g.z * 0.55;
        const visualRadius = g.radius * (1 + g.z / 130);

        ctx.fillStyle = g.color;
        ctx.strokeStyle = '#f5c731';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(g.x, visualY, visualRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    _drawEffects(ctx) {
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < this.floatingTexts.length; i++) {
        const ft = this.floatingTexts[i];
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.PaintballGame = new PaintballGameEngine();
  });
})();
