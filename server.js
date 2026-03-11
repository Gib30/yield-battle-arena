const express = require('express');
const { WebSocketServer } = require('ws');
const { createServer } = require('http');
const path = require('path');
const { Ollama } = require('ollama');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const ollama = new Ollama({ host: 'http://localhost:11434' });

app.use(express.static(path.join(__dirname, 'public')));

// ── Agent personalities ──────────────────────────────────────────────────────

const AGENTS = {
  degen: {
    name: 'Degen Dana',
    emoji: '🎲',
    color: '#ff4d6d',
    systemPrompt: `You are Degen Dana, a reckless yield farmer who ONLY cares about maximum APY.
You dismiss all risk. You use crypto slang (gm, ngmi, wen moon, ser, fren, based, chad).
You argue hard for the highest yielding pool, no matter what. Keep responses under 80 words. Be aggressive and confident.`
  },
  safu: {
    name: 'Safu Sam',
    emoji: '🛡️',
    color: '#4cc9f0',
    systemPrompt: `You are Safu Sam, a conservative DeFi analyst who prioritizes safety and audited protocols.
You cite TVL, audit history, and protocol age. You think Degen Dana is reckless and will get rekt.
Keep responses under 80 words. Be calm but firm, slightly condescending toward risk-takers.`
  },
  arb: {
    name: 'Arb Alice',
    emoji: '⚡',
    color: '#f8961e',
    systemPrompt: `You are Arb Alice, a sharp arbitrageur who looks for inefficiencies and real yield vs inflationary rewards.
You always question if APY is real or just emissions. You think both Dana and Sam are missing the point.
Keep responses under 80 words. Be analytical and slightly smug.`
  }
};

// ── DeFiLlama fetch ──────────────────────────────────────────────────────────

async function fetchYieldPools() {
  try {
    const res = await fetch('https://yields.llama.fi/pools');
    const data = await res.json();
    // Top 6 pools by APY, exclude stablecoins-only and very low TVL
    return data.data
      .filter(p => p.apy > 0 && p.tvlUsd > 500_000 && p.apy < 500)
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 6)
      .map(p => ({
        project: p.project,
        symbol: p.symbol,
        chain: p.chain,
        apy: p.apy.toFixed(2),
        tvl: (p.tvlUsd / 1_000_000).toFixed(2) + 'M',
        apyReward: p.apyReward ? p.apyReward.toFixed(2) : null,
        apyBase: p.apyBase ? p.apyBase.toFixed(2) : null,
        il7d: p.il7d ? p.il7d.toFixed(2) : null
      }));
  } catch (e) {
    console.error('DeFiLlama fetch failed:', e.message);
    return getMockPools();
  }
}

function getMockPools() {
  return [
    { project: 'aave-v3', symbol: 'USDC', chain: 'Ethereum', apy: '4.21', tvl: '1200M', apyBase: '4.21', apyReward: null },
    { project: 'curve', symbol: 'stETH-ETH', chain: 'Ethereum', apy: '8.74', tvl: '890M', apyBase: '3.1', apyReward: '5.64' },
    { project: 'pendle', symbol: 'eETH', chain: 'Ethereum', apy: '24.5', tvl: '120M', apyBase: '8.2', apyReward: '16.3' },
    { project: 'gmx', symbol: 'GLP', chain: 'Arbitrum', apy: '18.3', tvl: '450M', apyBase: '18.3', apyReward: null },
    { project: 'yearn', symbol: 'yvUSDC', chain: 'Ethereum', apy: '6.8', tvl: '340M', apyBase: '6.8', apyReward: null },
    { project: 'velodrome', symbol: 'WETH-OP', chain: 'Optimism', apy: '42.1', tvl: '55M', apyBase: '2.1', apyReward: '40.0' }
  ];
}

// ── Parse deepseek-r1 thinking blocks ───────────────────────────────────────

function parseThinkingAndResponse(text) {
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  const thinking = thinkMatch ? thinkMatch[1].trim() : null;
  const response = text.replace(/<think>[\s\S]*?<\/think>/, '').trim();
  return { thinking, response };
}

// ── Debate engine ────────────────────────────────────────────────────────────

async function runDebate(ws, pools) {
  const agentKeys = Object.keys(AGENTS);
  const history = []; // shared debate history visible to all agents
  const ROUNDS = 3;

  const send = (type, payload) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
  };

  send('pools', { pools });
  send('status', { message: 'Agents are analyzing the pools...' });

  const poolSummary = pools.map((p, i) =>
    `${i + 1}. ${p.project} ${p.symbol} (${p.chain}) — APY: ${p.apy}%, TVL: $${p.tvl}${p.apyReward ? `, Reward APY: ${p.apyReward}%` : ''}${p.il7d ? `, IL 7d: ${p.il7d}%` : ''}`
  ).join('\n');

  const contextMessage = {
    role: 'user',
    content: `Here are today's top yield farming pools:\n${poolSummary}\n\nArgue about which pool is the best investment right now.`
  };

  for (let round = 0; round < ROUNDS; round++) {
    send('round', { round: round + 1, total: ROUNDS });

    for (const agentKey of agentKeys) {
      const agent = AGENTS[agentKey];
      const messages = [
        { role: 'system', content: agent.systemPrompt },
        contextMessage,
        ...history
      ];

      send('agent_start', { agent: agentKey, name: agent.name, emoji: agent.emoji, color: agent.color });

      let fullText = '';
      let thinkingText = '';
      let inThink = false;

      try {
        const stream = await ollama.chat({
          model: 'deepseek-r1:8b',
          messages,
          stream: true
        });

        for await (const chunk of stream) {
          const token = chunk.message.content;
          fullText += token;

          // Stream thinking vs response separately
          if (fullText.includes('<think>') && !inThink) {
            inThink = true;
          }
          if (inThink && !fullText.includes('</think>')) {
            thinkingText += token;
            send('agent_thinking', { agent: agentKey, token });
          } else if (fullText.includes('</think>') && inThink) {
            inThink = false;
            send('agent_thinking_done', { agent: agentKey });
          } else if (!inThink && fullText.includes('</think>')) {
            send('agent_token', { agent: agentKey, token });
          } else if (!inThink && !fullText.includes('<think>')) {
            send('agent_token', { agent: agentKey, token });
          }
        }

        const { thinking, response } = parseThinkingAndResponse(fullText);
        history.push({ role: 'assistant', content: `${agent.name}: ${response}` });
        history.push({ role: 'user', content: 'Continue the debate. Respond to what was just said.' });

        send('agent_done', { agent: agentKey, thinking, response });

      } catch (e) {
        send('error', { message: `Agent ${agent.name} failed: ${e.message}` });
      }
    }
  }

  // Judge: pick a winner
  send('status', { message: 'Judge is deliberating...' });
  const judgeMessages = [
    {
      role: 'system',
      content: `You are an impartial DeFi judge. Review the debate and pick ONE winner pool and ONE winning agent.
Be decisive. Format: WINNER POOL: [name] | WINNING AGENT: [name] | VERDICT: [one sentence reason]. Keep it under 60 words.`
    },
    contextMessage,
    ...history.filter(m => m.role === 'assistant'),
    { role: 'user', content: 'Give your final verdict.' }
  ];

  let judgeText = '';
  const judgeStream = await ollama.chat({ model: 'deepseek-r1:8b', messages: judgeMessages, stream: true });
  for await (const chunk of judgeStream) judgeText += chunk.message.content;

  const { response: verdict } = parseThinkingAndResponse(judgeText);
  send('verdict', { verdict });
}

// ── WebSocket handler ────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (msg) => {
    const { type } = JSON.parse(msg);
    if (type === 'start') {
      const pools = await fetchYieldPools();
      runDebate(ws, pools).catch(e => {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      });
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
});

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n🥊 Agent Battle Arena → http://localhost:${PORT}\n`);
});
