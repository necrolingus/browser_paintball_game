# Browser Paintball Game - Requirements

## Core Platform & Controls
1. **Cross-Platform Multiplayer**: Must be playable on both **Mobile** and **PC** browsers.
2. **PC Controls**:
   - `WASD` (or Arrow keys) for movement.
   - Mouse cursor aims the player's orientation and vision cone.
   - **Left Mouse Button**: Fire normal paintball shot.
   - **Right Mouse Button**: Throw paint grenade.
3. **Mobile Controls**:
   - **Twin-Stick + Action Buttons**:
     - Bottom-left virtual joystick circle for movement (`WASD` equivalent).
     - Bottom-right virtual joystick circle for aiming the view cone and firing normal paintballs, with a dedicated **Paint Grenade** button tucked right next to the right stick.

## Networking, Modes & Architecture
4. **Serverless / Static Hosting (WebRTC P2P + Local BroadcastChannel fallback)**:
   - Purely client-side `HTML` / `CSS` / `JS` (no backend server required; works by opening `index.html`, or hosting on GitHub Pages / Cloudflare Pages).
   - Uses WebRTC Peer-to-Peer (via PeerJS) where the port/room input defaults to `60001` (allowing users to enter their own custom port/room number), plus same-browser BroadcastChannel support for instant offline multi-tab testing.
   - Lobby UI presents:
     - **"Start Server"** (hosts room `60001` or custom code)
     - **"Join Server"** (connects to room `60001` or custom code)
     - **"Practice vs. AI Bot"** (solo tactical match against an AI opponent that uses cover, hunts, and throws grenades)
   - Maximum **2 players** per match (Player 1 spawns far left, Player 2 spawns far right).

## Gameplay, Combat & Health
5. **Health & Damage (HUD at Top)**:
   - **3 normal paintball hits** = Player eliminated (2 HP damage per normal shot out of 6 HP).
   - **2 paint grenade hits** = Player eliminated (3 HP damage per grenade hit out of 6 HP).
   - **Self-Damage**: If a player's own paint grenade splashes onto them (e.g., after bouncing off a tall container or tree, or throwing too close), it inflicts full grenade damage (3 HP) to themselves!
   - Top HUD displays both players' remaining lives/health, grenade cooldown status, sound mute toggle, and match controls.
6. **Projectiles, Height & Range**:
   - **Normal Paintballs**: Travel at a visible projectile speed, have a **limited range** (like real paintballs, fading/dropping off near the edge of the viewable range), and **cannot pass through any obstacles**.
   - **Paint Grenades**:
     - Lob in an arc **over low obstacles (wooden crates)** while **bouncing off tall obstacles (shipping containers and trees)** up to a limited throw range.
     - Explode in a colorful paint splash radius after landing/fuse.
     - **Grenade splatter/explosion damage is blocked by all obstacles** (cannot travel through crates, containers, or trees) and has a cooldown so players cannot spam them.
     -Persistent colorful paint splatters remain on the ground and obstacle edges for the round.
7. **Mutual Restart Proposal**:
   - Any player can click **"Restart Game"** at any time (useful if map generation feels tight or after a round).
   - In multiplayer, the other player receives an on-screen prompt and must agree (**"Yes, Restart Game"**) before the level regenerates and resets both players (in Bot mode, the AI immediately agrees).

## Camera, Map & Tactical Fog of War
8. **GTA 2/3 Style Top-Down Camera**:
   - Top-down view with the local player always centered in the middle of the viewport.
9. **Procedural Obstacles & Freedom of Movement**:
   - Randomly placed obstacles on level start/restart: **wooden crates (low cover), shipping containers (tall cover), and trees (tall cover)**.
   - Map generation must guarantee freedom of movement (minimum clearance corridors between all obstacles) and clear spawn zones on the far left (Player 1) and far right (Player 2).
10. **Tactical Fog of War & 2D Shadow Casting** (see `game.png` & `game2.png`):
    - Each player has a directional **vision cone** ("viewable" area) extending in the direction they are aiming.
    - **Obstacle Occlusion**: When an obstacle (crate, container, tree) is inside the vision cone, it casts a dynamic 2D shadow behind it.
    - Areas outside the vision cone or behind obstacles are dimmed/shaded (Tactical Fog of War): static map obstacles remain dimly visible so players can navigate, while the **enemy player and enemy projectiles are completely invisible** unless in direct, unobstructed line-of-sight inside the vision cone (plus a small immediate proximity awareness radius around the player's body).

## Audio, Visual Style & Testing
11. **Procedural Sound Effects (Web Audio API)**:
    - Crisp synthesized paintball marker *pop*, paint *splat* impacts, grenade bounce *clank/thud*, grenade *splash/burst*, and hit/elimination cues.
    - Includes a **Mute / Unmute toggle button** in the top HUD.
12. **All-Ages Aesthetic & Color Palette**:
    - Family-friendly for all ages: **no blood** — only vibrant, colorful paint splatters!
    - Realistic, tactile paintball arena feel (earthy turf/sand, wood crates, weathered industrial containers, lush foliage, bright orange/lime/yellow/coral paint) while **steering clear of generic AI blue/purple UI themes**.
13. **Testing**:
    - Fully tested across desktop and mobile viewports (including multiplayer P2P synchronization, restart voting, grenade bounce & self-damage, and Fog of War occlusion) using Playwright browsers.
