(function () {
  class AssetLibrary {
    constructor() {
      this.sprites = {};
      this.turfPattern = null;
      this.initialized = false;
    }

    init(ctx) {
      if (this.initialized) return;
      this.sprites.crate = this._createCrateSprite(64, 64);
      this.sprites.container_rust = this._createContainerSprite(150, 68, '#9e472a', '#78321b', 'PB-01');
      this.sprites.container_ochre = this._createContainerSprite(150, 68, '#b88428', '#8c6218', 'PB-04');
      this.sprites.container_olive = this._createContainerSprite(150, 68, '#4e633b', '#384729', 'PB-09');
      this.sprites.tree = this._createTreeSprite(88, 88);
      this.turfTile = this._createTurfTile(256, 256);
      if (ctx) {
        this.turfPattern = ctx.createPattern(this.turfTile, 'repeat');
      }
      this.initialized = true;
    }

    _createTurfTile(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');

      // Base earthy arena turf
      g.fillStyle = '#333b2c';
      g.fillRect(0, 0, w, h);

      // Subtle organic dirt/grass patches
      const patches = [
        { x: 40, y: 50, r: 34, color: 'rgba(64, 74, 52, 0.45)' },
        { x: 180, y: 120, r: 46, color: 'rgba(43, 49, 36, 0.5)' },
        { x: 110, y: 210, r: 38, color: 'rgba(72, 66, 48, 0.35)' },
        { x: 210, y: 40, r: 28, color: 'rgba(60, 71, 49, 0.4)' }
      ];
      patches.forEach((p) => {
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      });

      // Fine turf texture flecks
      for (let i = 0; i < 140; i++) {
        const px = (i * 73) % w;
        const py = (i * 139) % h;
        g.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
        g.fillRect(px, py, 2, 2);
      }

      // Subtle tactical grid chalk lines
      g.strokeStyle = 'rgba(244, 241, 234, 0.04)';
      g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, w - 1, h - 1);

      return c;
    }

    // Wooden Crate (Low obstacle: grenades lob OVER this!)
    _createCrateSprite(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');

      // Outer wood frame
      g.fillStyle = '#8c6239';
      g.fillRect(0, 0, w, h);

      // Inner planks
      g.fillStyle = '#a67646';
      g.fillRect(6, 6, w - 12, h - 12);

      // Plank seams
      g.strokeStyle = '#604123';
      g.lineWidth = 2;
      for (let y = 18; y < h - 8; y += 14) {
        g.beginPath();
        g.moveTo(6, y);
        g.lineTo(w - 6, y);
        g.stroke();
      }

      // Diagonal cross brace
      g.strokeStyle = '#78522d';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(8, 8);
      g.lineTo(w - 8, h - 8);
      g.moveTo(w - 8, 8);
      g.lineTo(8, h - 8);
      g.stroke();

      // Outer border & corner metal brackets
      g.strokeStyle = '#4a3119';
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, w - 3, h - 3);

      g.fillStyle = '#3d352e';
      const corners = [
        [4, 4],
        [w - 8, 4],
        [4, h - 8],
        [w - 8, h - 8]
      ];
      corners.forEach(([cx, cy]) => {
        g.fillRect(cx, cy, 4, 4);
      });

      return c;
    }

    // Corrugated Shipping Container (Tall obstacle: grenades BOUNCE off this!)
    _createContainerSprite(w, h, mainColor, ribColor, stencil) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');

      // Base body
      g.fillStyle = mainColor;
      g.fillRect(0, 0, w, h);

      // Corrugated ribs along length
      g.fillStyle = ribColor;
      for (let x = 10; x < w - 10; x += 12) {
        g.fillRect(x, 4, 5, h - 8);
      }

      // Heavy steel end-frames
      g.fillStyle = '#2d2f2b';
      g.fillRect(0, 0, 7, h);
      g.fillRect(w - 7, 0, 7, h);

      // Top highlight bar
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(7, 5, w - 14, 5);

      // Industrial stencil markings
      g.fillStyle = 'rgba(244, 241, 234, 0.65)';
      g.font = 'bold 11px monospace';
      g.fillText(stencil, 14, h - 10);

      // Outer metallic outline
      g.strokeStyle = '#1e201d';
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, w - 3, h - 3);

      return c;
    }

    // Lush Top-Down Arena Tree (Tall obstacle: grenades BOUNCE off this!)
    _createTreeSprite(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      const cx = w / 2;
      const cy = h / 2;

      // Drop shadow
      g.fillStyle = 'rgba(0, 0, 0, 0.28)';
      g.beginPath();
      g.arc(cx + 3, cy + 4, 36, 0, Math.PI * 2);
      g.fill();

      // Outer dark foliage clusters
      const outerClusters = [
        [cx - 14, cy - 12, 22],
        [cx + 15, cy - 10, 21],
        [cx - 12, cy + 14, 21],
        [cx + 14, cy + 13, 22],
        [cx, cy - 18, 20],
        [cx, cy + 18, 20]
      ];
      g.fillStyle = '#2d4c23';
      outerClusters.forEach(([x, y, r]) => {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      });

      // Mid foliage layer
      const midClusters = [
        [cx - 8, cy - 8, 19],
        [cx + 10, cy - 6, 18],
        [cx - 6, cy + 9, 18],
        [cx + 8, cy + 8, 19],
        [cx, cy, 24]
      ];
      g.fillStyle = '#3f6a30';
      midClusters.forEach(([x, y, r]) => {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      });

      // Sunlit canopy highlights
      g.fillStyle = '#568c41';
      g.beginPath();
      g.arc(cx - 5, cy - 5, 13, 0, Math.PI * 2);
      g.arc(cx + 6, cy + 4, 11, 0, Math.PI * 2);
      g.fill();

      // Center trunk peek
      g.fillStyle = '#4f3722';
      g.beginPath();
      g.arc(cx, cy, 6, 0, Math.PI * 2);
      g.fill();

      return c;
    }
  }

  window.PaintballAssets = new AssetLibrary();
})();
