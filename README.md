# 🎨🔫 SplatZone — Top-Down Tactical Paintball Arena 💥

Welcome to **SplatZone**! 🏃‍♂️💨 A fast-paced, 2-player cross-platform (**PC 💻 & Mobile 📱**) top-down paintball arena game inspired by classic *GTA 2* top-down action — built with pure HTML5 Canvas, CSS, and vanilla JavaScript with **zero backend servers required**! 🎉

---

## 🌟 Why SplatZone Rocks

- 🔦 **Real-Time 2D Raycast Fog of War & Stealth**:
  - Your character is always locked dead-center on your screen with a directional **vision cone** (`viewable` zone).
  - Crates 📦, shipping containers 🚢, and trees 🌲 cast **real-time dynamic 2D shadows**.
  - Sneak behind a shipping container and you **completely vanish** from your opponent's screen — even if that container is right inside their vision cone! 🥷✨ *(Will you pop out left or right? They have no idea!)*
- 💣 **High-IQ Paint Grenade Physics (& Hilarious Self-Damage!)**:
  - **Low Cover vs. Tall Cover**: Lob paint grenades in a high arc **OVER low wooden crates** 📦 to splash campers hiding in the shadows!
  - **Watch Your Angles!** Grenades **BOUNCE (`CLANK!`) off tall shipping containers and trees** 🌲 — throw one poorly and it'll ricochet right back into your own face for **full self-damage**! 🤦‍♂️💥
  - **Solid Cover Protection**: Neither normal paintballs nor grenade explosion splatters can penetrate through obstacles.
- ❤️ **Simple, High-Stakes Health Math**:
  - Every player has **6 HP** shown in the top HUD bar:
    - 🟠 **3 Normal Paintball Hits** (`2 HP` each) = **SPLAT! You're Out!**
    - 💣 **2 Paint Grenade Hits** (`3 HP` each) = **BOOM! You're Out!**
- 🌐 **Instant Serverless Multiplayer (Default Port `60001`) + Rage-Quit Detection**:
  - 🟢 **Start Server / Join Server**: Defaults to port `60001` (or type your own custom port/room code) using WebRTC Peer-to-Peer + `BroadcastChannel`.
  - 🚨 **Rage-Quit / Server Drop Alert**: If the host or opponent closes their tab or loses connection mid-match, you get an immediate **"Server Dropped! / Opponent Disconnected!"** alert instead of wandering around an empty arena alone!
  - 🤝 **Mutual Restart Vote**: Stuck in a tight corner or ready for a fresh map? Click **Restart Game** — once the other player clicks **"Yes, Restart Game"**, a brand-new random obstacle layout is generated with guaranteed freedom of movement!
- 🤖 **Practice vs. Tactical AI Bot**:
  - Flying solo? Jump into **Practice vs. AI Bot** to battle an autonomous opponent that uses cover, sweeps its vision cone, strafes, and lobs grenades over crates!
- 🔊 **Synthesized Web Audio SFX**:
  - Crisp CO2 marker *pops*, wet paint *splats*, metallic container *clanks*, and grenade *bursts* generated in real time via the Web Audio API (with a handy **Sound: ON/OFF** toggle in the HUD 🔇).

---

## 🎮 Controls

### 🖥️ PC Controls
| Input | Action |
| :--- | :--- |
| **`W` `A` `S` `D`** or **Arrow Keys** | Move around the arena 🏃 |
| **Mouse Cursor** | Aim your marker & sweep your Fog of War vision cone 🔦 |
| **Left Mouse Button (LMB)** | Fire normal paintball shot 🎨 |
| **Right Mouse Button (RMB)** | Lob a paint grenade 💣 |

### 📱 Mobile Touch Controls
| Control | Action |
| :--- | :--- |
| **Bottom-Left Circle (`MOVE WASD`)** | Virtual thumbstick for 360° movement 🕹️ |
| **Bottom-Right Circle (`AIM / LOOK`)** | Virtual thumbstick to silently aim & sweep your vision cone without wasting shots 👀 |
| **`FIRE SHOT` Button (Top-Left of Right Circle)** | Tap or hold to fire normal paintballs 🔫 |
| **`PAINT GRENADE` Button (Top-Right of Right Circle)** | Tap to lob an arcing paint grenade 💣 |

---

## 🚀 How to Play

1. **Double-Click & Play Locally**: Simply open [`index.html`](index.html) in any modern browser — no `npm install`, no build step, no server setup!
2. **Host Free Anywhere**: Drop the project folder straight onto **GitHub Pages** or **Cloudflare Pages** and share the link with a friend! 🌍🎨
