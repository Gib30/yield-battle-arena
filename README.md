# ⚔ Yield Battle Arena

Three AI agents debate live DeFiLlama yield pools in real-time. Watch **Degen Dana**, **Safu Sam**, and **Arb Alice** argue about which farm to ape into — powered by a local `deepseek-r1:8b` model via Ollama, streamed over WebSockets.

![yield-battle-arena](https://img.shields.io/badge/model-deepseek--r1%3A8b-blue) ![yield-battle-arena](https://img.shields.io/badge/data-DeFiLlama-green) ![yield-battle-arena](https://img.shields.io/badge/stack-Node.js%20%2B%20WebSockets-yellow)

---

## Agents

| Agent | Personality | Color |
|---|---|---|
| 🎲 **Degen Dana** | APY maxi, dismisses all risk, full crypto slang | Red |
| 🛡️ **Safu Sam** | Conservative, cites TVL + audits, thinks Dana is reckless | Blue |
| ⚡ **Arb Alice** | Looks for real yield vs emissions, questions everything | Orange |

Each agent runs 3 rounds of debate, then a judge delivers a final verdict with the winning pool highlighted.

---

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Ollama](https://ollama.com) installed and running

---

## Setup

**1. Clone the repo**
```bash
git clone https://github.com/Gib30/yield-battle-arena.git
cd yield-battle-arena
```

**2. Install dependencies**
```bash
npm install
```

**3. Pull the model**

Open a terminal and run:
```bash
ollama pull deepseek-r1:8b
```
> Requires ~5GB disk space. Works well on 16GB RAM + dedicated GPU (RTX 4060+).
> For lower-end machines, swap `deepseek-r1:8b` → `gemma3:4b` in `server.js`.

**4. Make sure Ollama is running**

On Windows, Ollama runs as a system tray app after installation. Verify it's up:
```bash
curl http://localhost:11434/api/tags
```

**5. Start the server**
```bash
npm start
```

Open **http://localhost:3000** and hit **START BATTLE**.

---

## Dev mode (auto-reload)

```bash
npm run dev
```

---

## How it works

```
DeFiLlama API → top 6 pools by APY
       ↓
WebSocket server (Express + ws)
       ↓
3 agents × 3 rounds via Ollama chat API
  - Each agent sees the full debate history
  - deepseek-r1 <think> blocks streamed separately as thought bubbles
  - Responses streamed token-by-token to the browser
       ↓
Judge agent picks winner pool + winning agent
       ↓
Winner pool card glows on the frontend
```

---

## Swapping the model

Edit line in `server.js`:
```js
model: 'deepseek-r1:8b'   // change to any model you have pulled
```

Any Ollama-compatible model works. Reasoning models (deepseek-r1, qwen3) show thinking bubbles; standard models skip that step.

---

## Deploying remotely

This app uses **WebSockets** and a **local Ollama instance**, so Vercel/Netlify won't work. For cloud deployment:

| Platform | Free tier | Notes |
|---|---|---|
| [Railway](https://railway.app) | 500hr/mo | Best option — supports WebSockets, easy deploy |
| [Render](https://render.com) | Yes (spins down) | Works, but cold starts |
| [Fly.io](https://fly.io) | Yes | Can even run Ollama container alongside |

For any cloud deploy you'll need to replace the Ollama calls in `server.js` with a remote LLM API (Anthropic, OpenAI, etc.) since `localhost:11434` won't be available on a remote server.

---

## Stack

- **Backend**: Node.js, Express, `ws` (WebSockets), `ollama` npm package
- **Frontend**: Vanilla HTML/CSS/JS — no build step
- **AI**: Ollama (local) with deepseek-r1:8b
- **Data**: [DeFiLlama Yields API](https://yields.llama.fi/pools) (free, no key needed)
