// ── State ────────────────────────────────────────────────────────────────────
let ws = null;
let battling = false;
let currentRound = 0;
let pools = [];

const agentState = {
  degen: { thinkingEl: null, responseEl: null, blockEl: null },
  safu:  { thinkingEl: null, responseEl: null, blockEl: null },
  arb:   { thinkingEl: null, responseEl: null, blockEl: null }
};

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connect() {
  ws = new WebSocket('ws://localhost:3000');
  ws.onopen  = () => { setLive(true);  setStatus('CONNECTED — READY TO DEPLOY AGENTS'); };
  ws.onclose = () => {
    setLive(false); setStatus('DISCONNECTED — RETRYING...');
    battling = false; enableBtn();
    setTimeout(connect, 3000);
  };
  ws.onerror  = () => setStatus('CONNECTION ERROR');
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'pools':              renderPools(msg.pools);              break;
    case 'status':             setStatus(msg.message.toUpperCase()); break;
    case 'round':              updateRound(msg.round, msg.total);   break;
    case 'agent_start':        onAgentStart(msg);                   break;
    case 'agent_thinking':     onAgentThinking(msg);                break;
    case 'agent_thinking_done':onAgentThinkingDone(msg);            break;
    case 'agent_token':        onAgentToken(msg);                   break;
    case 'agent_done':         onAgentDone(msg);                    break;
    case 'verdict':            onVerdict(msg.verdict);              break;
    case 'error':
      setStatus('ERROR: ' + msg.message);
      enableBtn(); battling = false;
      break;
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
function startBattle() {
  if (!ws || ws.readyState !== WebSocket.OPEN || battling) return;
  battling = true;
  disableBtn(); clearFeeds(); hideVerdict(); resetRound();
  setStatus('INITIALIZING AGENTS...');
  ws.send(JSON.stringify({ type: 'start' }));
}

// ── Pools ─────────────────────────────────────────────────────────────────────
function renderPools(data) {
  pools = data;
  const grid = document.getElementById('poolsGrid');
  grid.innerHTML = '';

  data.forEach(pool => {
    const apy = parseFloat(pool.apy);
    const apyClass = apy < 10 ? 'low' : apy < 25 ? 'mid' : 'high';
    const topColor = apy < 10 ? 'var(--green)' : apy < 25 ? 'var(--yellow)' : 'var(--red)';

    const card = document.createElement('div');
    card.className = 'pool-card';
    card.id = 'pool-' + slugify(pool.project + '-' + pool.symbol);
    card.style.borderTopColor = topColor;

    // Chain badge
    const chain = el('div', 'pool-chain-badge');
    chain.textContent = pool.chain.toUpperCase();

    // APY
    const apyNum = el('div', 'pool-apy ' + apyClass);
    apyNum.textContent = pool.apy + '%';
    const apyLabel = el('div', 'pool-apy-label');
    apyLabel.textContent = 'ANNUAL YIELD';

    // Name/project
    const name = el('div', 'pool-name');
    name.textContent = pool.symbol;
    const project = el('div', 'pool-project');
    project.textContent = pool.project;

    // Stats
    const stats = el('div', 'pool-stats');
    statRow(stats, 'TVL', '$' + pool.tvl);
    if (pool.apyBase)   statRow(stats, 'BASE APY',   pool.apyBase + '%');
    if (pool.apyReward) statRow(stats, 'REWARD APY', pool.apyReward + '%');
    if (pool.il7d)      statRow(stats, 'IL 7D',      pool.il7d + '%');

    card.append(chain, apyNum, apyLabel, name, project, stats);
    grid.appendChild(card);
  });
}

function statRow(parent, label, value) {
  const row = el('div', 'pool-stat');
  const l = el('span'); l.textContent = label;
  const v = el('span'); v.textContent = value;
  row.append(l, v);
  parent.appendChild(row);
}

function highlightWinnerPool(verdictText) {
  const lower = verdictText.toLowerCase();
  pools.forEach(pool => {
    if (lower.includes(pool.project.toLowerCase()) || lower.includes(pool.symbol.toLowerCase())) {
      const card = document.getElementById('pool-' + slugify(pool.project + '-' + pool.symbol));
      if (card) card.classList.add('winner-glow');
    }
  });
}

// ── Round ─────────────────────────────────────────────────────────────────────
function updateRound(round, total) {
  currentRound = round;
  document.getElementById('roundNum').textContent = round;
  document.getElementById('roundTotalNum').textContent = total;
  for (let i = 0; i < 3; i++) {
    const pip = document.getElementById('pip' + i);
    pip.className = 'pip' + (i < round - 1 ? ' done' : i === round - 1 ? ' active' : '');
  }
}

function resetRound() {
  document.getElementById('roundNum').textContent = '—';
  document.getElementById('roundTotalNum').textContent = '—';
  for (let i = 0; i < 3; i++) document.getElementById('pip' + i).className = 'pip';
}

// ── Agent streaming ───────────────────────────────────────────────────────────
function onAgentStart({ agent, name }) {
  setStatus(name.toUpperCase() + ' IS DELIBERATING...');

  ['degen', 'safu', 'arb'].forEach(a =>
    document.getElementById('col-' + a).classList.toggle('active-col', a === agent)
  );

  const badge = document.getElementById('badge-' + agent);
  badge.textContent = 'THINKING';
  badge.className = 'agent-badge thinking';

  const feed = document.getElementById('feed-' + agent);
  const block = el('div', 'msg-block');
  const roundTag = el('div', 'msg-round-tag');
  roundTag.textContent = '— ROUND ' + currentRound + ' —';
  block.appendChild(roundTag);
  feed.appendChild(block);

  agentState[agent].blockEl    = block;
  agentState[agent].thinkingEl = null;
  agentState[agent].responseEl = null;

  scrollFeed(feed);
}

function onAgentThinking({ agent, token }) {
  const state = agentState[agent];
  if (!state.thinkingEl) {
    const bubble = el('div', 'thinking-bubble thinking-cursor');
    state.blockEl.appendChild(bubble);
    state.thinkingEl = bubble;
  }
  state.thinkingEl.textContent += token;
  scrollFeed(document.getElementById('feed-' + agent));
}

function onAgentThinkingDone({ agent }) {
  const state = agentState[agent];
  if (state.thinkingEl) state.thinkingEl.classList.remove('thinking-cursor');
  const badge = document.getElementById('badge-' + agent);
  badge.textContent = 'SPEAKING';
  badge.className = 'agent-badge speaking';
}

function onAgentToken({ agent, token }) {
  const state = agentState[agent];
  if (!state.responseEl) {
    const bubble = el('div', 'response-bubble');
    state.blockEl.appendChild(bubble);
    state.responseEl = bubble;
  }
  state.responseEl.textContent += token;
  scrollFeed(document.getElementById('feed-' + agent));
}

function onAgentDone({ agent }) {
  const badge = document.getElementById('badge-' + agent);
  badge.textContent = 'DONE';
  badge.className = 'agent-badge';
  document.getElementById('col-' + agent).classList.remove('active-col');
}

// ── Verdict ───────────────────────────────────────────────────────────────────
function onVerdict(verdict) {
  battling = false;
  enableBtn();
  setStatus('VERDICT DELIVERED — BATTLE COMPLETE');
  for (let i = 0; i < 3; i++) document.getElementById('pip' + i).className = 'pip done';

  const zone = document.getElementById('verdictZone');
  const textEl = document.getElementById('verdictText');
  textEl.textContent = '';

  // Safely build verdict DOM: split by | and bold known labels
  const parts = verdict.split('|').map(s => s.trim());
  const labels = ['WINNER POOL:', 'WINNING AGENT:', 'VERDICT:'];

  parts.forEach((part, i) => {
    if (i > 0) textEl.appendChild(document.createElement('br'));
    let matched = false;
    for (const label of labels) {
      if (part.toUpperCase().startsWith(label)) {
        const strong = document.createElement('strong');
        strong.textContent = label + ' ';
        const rest = document.createTextNode(part.slice(label.length).trim());
        textEl.appendChild(strong);
        textEl.appendChild(rest);
        matched = true;
        break;
      }
    }
    if (!matched) textEl.appendChild(document.createTextNode(part));
  });

  zone.classList.add('visible');
  zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
  highlightWinnerPool(verdict);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function slugify(str) {
  return str.replace(/[^a-zA-Z0-9-]/g, '-');
}

function setStatus(msg) {
  document.getElementById('statusDisplay').textContent = msg;
}

function setLive(online) {
  document.getElementById('livePill').classList.toggle('online', online);
  document.getElementById('liveText').textContent = online ? 'LIVE' : 'OFFLINE';
}

function clearFeeds() {
  ['degen', 'safu', 'arb'].forEach(a => {
    document.getElementById('feed-' + a).textContent = '';
    const badge = document.getElementById('badge-' + a);
    badge.textContent = 'IDLE';
    badge.className = 'agent-badge';
    document.getElementById('col-' + a).classList.remove('active-col');
  });
  document.querySelectorAll('.pool-card').forEach(c => c.classList.remove('winner-glow'));
}

function hideVerdict() {
  document.getElementById('verdictZone').classList.remove('visible');
  document.getElementById('verdictText').textContent = '';
}

function scrollFeed(feed) { feed.scrollTop = feed.scrollHeight; }

function disableBtn() {
  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  btn.querySelector('.btn-main').textContent = 'BATTLE IN PROGRESS';
}

function enableBtn() {
  const btn = document.getElementById('startBtn');
  btn.disabled = false;
  btn.querySelector('.btn-main').textContent = 'START BATTLE';
}

// ── Init ──────────────────────────────────────────────────────────────────────
connect();
