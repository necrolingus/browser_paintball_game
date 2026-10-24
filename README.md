# SplatZone — Top-Down Tactical Browser Paintball Game

A 2-player cross-platform (PC & Mobile) top-down paintball arena game built with pure HTML5 Canvas, CSS, and vanilla JavaScript — requiring zero server-side backend.

## Features
- **GTA-2 Style Centered Camera & Tactical Fog of War**:
  - Local player is always centered on screen with a directional vision cone (`viewable` area).
  - Real-time 2D raycast shadows behind **wooden crates, shipping containers, and trees**.
  - Static cover outside your cone is dimmed for navigation, while the **enemy player and enemy projectiles completely disappear** when behind an obstacle or outside your line-of-sight.
- **Tactical Paintball & Paint Grenade Physics**:
  - **Health / Lives HUD**: 6 HP per player — **3 normal paintball hits** (2 HP each) or **2 paint grenade hits** (3 HP each) eliminates a player.
  - **Limited Range & Obstacle Blocking**: Normal paintballs have a realistic marker range and never pass through obstacles.
  - **Cover Height Mechanics & Self-Damage**: Paint grenades arc **over low obstacles (wooden crates)** while **bouncing off tall obstacles (shipping containers & trees)**. Watch your angles — if your own grenade bounces back and splashes on you, it deals **full self-damage**! Grenade explosion splatter is also blocked by all obstacles.
- **Serverless Multiplayer (`60001` Default Port) + AI Bot Mode**:
  - **Start Server / Join Server**: Defaults to port `60001` (or custom port/room code) using WebRTC Peer-to-Peer (PeerJS) + `BroadcastChannel` for instant local multi-tab or cross-device play.
  - **Practice vs. AI Bot**: Solo mode against an autonomous cover-using tactical bot.
  - **Mutual Restart Game Vote**: Either player can click **Restart Game**, prompting the other player to agree (**Yes, Restart Game**) to regenerate a new random obstacle layout with guaranteed freedom of movement.
- **PC & Mobile Twin-Stick Controls**:
  - **PC**: `WASD` / Arrow keys to move, Mouse to aim vision cone, **Left-Click** to fire paintballs, **Right-Click** to lob a paint grenade.
  - **Mobile**: Bottom-left `WASD` joystick circle, bottom-right `Aim & Fire` joystick circle, and a dedicated **Paint Grenade** button tucked next to the right stick.
- **Procedural Web Audio SFX**: Synthesized CO2 marker *pop*, paint *splat*, container *clank* bounce, and grenade *splash* sound effects with a HUD **Sound: ON/OFF** toggle.

## How to Run
1. **Direct Local Play**: Double-click [`index.html`](index.html) to open in any browser.
2. **Static Hosting**: Deploy the root folder directly to GitHub Pages or Cloudflare Pages.
