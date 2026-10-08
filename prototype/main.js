// THROWAWAY UI PROTOTYPE: three poker/clock layouts on /prototype/?variant=A|B|C.
// Question: which hierarchy makes recording spoken actions easiest at a physical table?
// In-memory demonstration only. This is not the production poker rules engine or P2P transport.
import './style.css';

const app = document.querySelector('#app');
const variants = ['A', 'B', 'C'];
const titles = { A: 'Table Club', B: 'Score Sheet', C: 'Your Turn' };
let variant = new URLSearchParams(location.search).get('variant') || 'A';
if (!variants.includes(variant)) variant = 'A';
let game = new URLSearchParams(location.search).get('game') === 'chess' ? 'chess' : 'poker';
let mode = 'shared';
let drawer = null;
let raiseOpen = false;
let toast = '';
let toastTimer;
let undo = [];
let cardsLoaded = false;
let mucked = [];
const colors = ['blue', 'coral', 'green', 'yellow'];
const names = ['Alex', 'Jordan', 'Taylor', 'Casey'];
const fresh = () => ({ players: names.map((name, i) => ({ name, stack: [960, 940, 960, 960][i], bet: [0, 20, 0, 0][i], folded: false })), pot: 180, target: 20, queue: [0, 2, 3], street: 'Flop', phase: 'betting', revision: 0, hand: 8, history: ['Jordan bet 20', 'Flop dealt', 'Preflop complete · 160 chips'] });
let state = fresh();
let clock = { minutes: 5, remaining: [300000, 300000], increment: 2000, active: 0, running: false, last: performance.now(), started: false };

const icon = (name, size = 20) => {
  const paths = {
    poker: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m6 6 3 3m6 6 3 3M6 18l3-3m6-6 3-3"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v5l3 2M9 2h6M12 2v3m5 2 2-2"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    undo: '<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12"/>',
    link: '<path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v7l4 2"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.poker}</svg>`;
};
const button = (label, action, cls = '', disabled = false) => {
  const accessibleNames = { 'drawer:settings': 'Table settings', 'drawer:state': 'Inspect prototype state', 'undo': 'Undo last action', 'variant:prev': 'Previous variant', 'variant:next': 'Next variant', 'close': 'Close dialog' };
  return `<button class="${cls}" data-action="${action}" ${accessibleNames[action] ? `aria-label="${accessibleNames[action]}"` : ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
};
const logo = () => '<a class="brand" href="/prototype/" aria-label="PlayKit home"><img src="/prototype/mark.svg" alt=""/><span>Play<span>Kit</span></span></a>';
const avatar = (i, large = false) => `<span class="avatar ${colors[i]} ${large ? 'large' : ''}">${names[i][0]}<span class="avatar-shape"></span></span>`;
const chip = (color, count) => `<span class="chip-stack ${color}" aria-hidden="true"><i></i><i></i><i></i><b>${count}</b></span>`;
const chips = () => `<div class="chip-art">${chip('coral', 25)}${chip('blue', 50)}${chip('green', 5)}<span class="spark s1"></span><span class="spark s2"></span></div>`;
const current = () => state.queue[0] ?? 0;
const canOperate = () => mode === 'shared' || current() === 0;
const streetStep = () => ['Preflop', 'Flop', 'Turn', 'River'].indexOf(state.street);

function header(sidebar = false) {
  return `<${sidebar ? 'aside' : 'header'} class="${sidebar ? 'sidebar' : 'header'}">
    ${logo()}<nav class="game-nav" aria-label="Games">${button(`${icon('poker')} Poker`, 'game:poker', game === 'poker' ? 'selected' : '')}${button(`${icon('clock')} Chess clock`, 'game:chess', game === 'chess' ? 'selected' : '')}</nav>
    ${sidebar ? '<div class="sidebar-note"><span class="small-mark">✦</span><strong>Less screen.<br/>More play.</strong><p>Tools for the good times<br/>around your table.</p></div>' : ''}
    <div class="header-end"><span class="online-dot"></span><span>Friday game night</span>${button(icon('settings'), 'drawer:settings', 'icon-button', false)}</div>
  </${sidebar ? 'aside' : 'header'}>`;
}
function topbar() {
  return `<div class="session-bar"><div class="breadcrumbs">Your toolkit <span>/</span> ${game === 'poker' ? 'Poker table' : 'Chess clock'}</div><div class="device-switch" aria-label="Preview device role">${button('Shared device', 'mode:shared', mode === 'shared' ? 'selected' : '')}${button('Player phone', 'mode:player', mode === 'player' ? 'selected' : '', game === 'chess')}</div></div>`;
}
function intro(title, subtitle, mini = false) {
  return `<div class="page-intro ${mini ? 'mini' : ''}"><div><div class="eyebrow">${game === 'poker' ? 'THE CARDS ARE ON THE TABLE' : 'MAKE YOUR NEXT MOVE'}</div><h1>${title}<span class="title-dot">.</span></h1><p>${subtitle}</p></div><div class="intro-actions">${game === 'poker' ? `<span class="live-label"><i></i> Hand #${state.hand}</span>${button(`${icon('people')} Invite players`, 'drawer:invite', 'button button-white', mode !== 'shared')}` : '<span class="live-label"><i></i> Offline & ready</span>'}</div></div>`;
}
function streetBar() {
  return `<div class="street-bar">${['Preflop', 'Flop', 'Turn', 'River'].map((s, i) => `<span class="${i < streetStep() ? 'done' : i === streetStep() ? 'current' : ''}"><i>${i < streetStep() ? '✓' : i + 1}</i>${s}</span>`).join('<div class="street-line"></div>')}</div>`;
}
function playerRow(i, compact = false) {
  const p = state.players[i];
  const acting = current() === i && state.phase === 'betting' && !p.folded;
  return `<div class="player-row ${acting ? 'acting' : ''} ${p.folded ? 'folded' : ''}">${avatar(i)}<div class="player-info"><strong>${p.name} ${i === 3 ? '<em class="dealer">D</em>' : ''}${mode === 'player' && i === 0 ? '<small>YOU</small>' : ''}</strong><span>${p.folded ? 'Folded' : acting ? 'Their turn' : p.stack === 0 ? 'All-in' : 'At the table'}</span></div><div class="player-money"><strong>${p.stack.toLocaleString()}</strong><span>${compact ? 'chips' : p.bet ? `${p.bet} in this street` : 'No bet yet'}</span></div>${acting ? '<span class="turn-dot"></span>' : ''}</div>`;
}
function historyPanel() {
  return `<div class="history-panel"><div class="section-heading"><h3>At the table</h3>${button('Full history ↗', 'drawer:history', 'text-button')}</div><div class="last-action"><span class="history-icon">${icon('history')}</span><div><strong>${state.history[0]}</strong><span>Latest action · just now</span></div>${button(icon('undo'), 'undo', 'icon-button', !undo.length || mode !== 'shared')}</div></div>`;
}
function actionPanel(focus = false) {
  if (state.phase !== 'betting') return transitionPanel();
  const p = state.players[current()];
  const owed = Math.max(0, state.target - p.bet);
  const disabled = !canOperate();
  return `<section class="action-panel ${focus ? 'focus-actions' : ''}">
    ${!focus ? `<div class="action-heading"><span class="pill green">${disabled ? 'WAITING' : 'UP NEXT'}</span><span>Blinds 5 / 10</span></div><div class="actor-title">${avatar(current())}<div><h2>${p.name}'s turn</h2><p>${disabled ? 'Alex, your controls unlock on your turn.' : 'Record their action. Keep the game moving.'}</p></div></div>` : ''}
    <div class="call-summary"><span>To ${owed ? 'call' : 'check'}</span><strong>${owed || '0'} <small>chips</small></strong></div>
    <div class="action-buttons">${button('Fold', 'fold', 'button fold-button', disabled)}${button(`${owed ? `Call ${Math.min(owed, p.stack)}` : 'Check'} ${icon('arrow')}`, 'call', 'button primary', disabled)}</div>
    ${button(`${icon('poker')} ${state.target ? 'Raise' : 'Bet'} amount`, 'raise', 'button raise-button', disabled || p.stack <= owed)}
    ${raiseOpen ? `<form id="raise-form" class="raise-form"><label for="raise-amount">Total chips this street</label><div><input id="raise-amount" name="amount" type="number" min="${state.target + 10}" max="${p.stack + p.bet}" value="${Math.min(state.target + 20, p.stack + p.bet)}" step="10" required/><button class="button primary" type="submit">Confirm</button></div><small>Demo raise controls · not a complete rules engine</small></form>` : ''}
    <div class="action-footnote">${icon('shield', 15)} ${mode === 'shared' ? 'One device. Everyone plays.' : 'Player phone preview · you are Alex'}</div>
  </section>`;
}
function transitionPanel() {
  const disabled = mode !== 'shared';
  if (state.phase === 'awaiting') return `<section class="action-panel transition"><span class="pill green">BETTING COMPLETE</span><span class="transition-art">✦</span><h2>Deal the ${state.street === 'Flop' ? 'turn' : 'river'}.</h2><p>Keep the cards on the table.<br/>Tap below once they're dealt.</p>${button(`${state.street === 'Flop' ? 'Turn' : 'River'} dealt ${icon('arrow')}`, 'deal', 'button primary', disabled)}</section>`;
  if (state.phase === 'showdown') return `<section class="action-panel transition"><span class="pill yellow">SHOWDOWN</span><span class="transition-art">♠</span><h2>Cards on the table.</h2><p>Enter the board and shown hands<br/>to preview the payout.</p>${button(`Enter cards ${icon('arrow')}`, 'drawer:showdown', 'button primary', disabled)}</section>`;
  return `<section class="action-panel transition"><span class="pill green">HAND SETTLED</span>${chips()}<h2>${state.winner || 'Alex'} takes the pot.</h2><p>Stacks updated. Time for another hand?</p>${button(`Next hand ${icon('arrow')}`, 'next', 'button primary', disabled)}${button('Undo settlement', 'undo', 'text-button', !undo.length || disabled)}</section>`;
}
function VariantA() {
  return `${header()}<main class="layout-a">${topbar()}${game === 'chess' ? chess('A') : `${intro('Good company. Great hands', 'Physical cards. Digital chips. All together.')}<div class="a-grid"><section class="table-panel"><div class="table-panel-top"><span>${icon('poker')} Texas Hold’em <b>NO LIMIT</b></span><span>4 players <i class="online-dot"></i></span></div>${streetBar()}<div class="poker-table"><div class="felt-ring"></div><div class="table-center"><span class="eyebrow">TOTAL POT</span><strong>${state.pot}</strong><span class="pot-unit">chips in play</span>${chips()}<div class="physical-reminder">${icon('check', 14)} Cards stay on your table</div></div>${state.players.map((p, i) => `<div class="table-seat seat-${i} ${current() === i && state.phase === 'betting' ? 'active' : ''} ${p.folded ? 'folded' : ''}">${avatar(i)}<div><strong>${p.name}${i === 3 ? '<em class="dealer">D</em>' : ''}</strong><span>${p.stack.toLocaleString()} chips</span></div><span class="seat-status">${p.folded ? 'Folded' : current() === i && state.phase === 'betting' ? 'Your turn' : p.bet ? `${p.bet} bet` : 'Ready'}</span></div>`).join('')}</div><div class="table-bottom"><span>Dealer <strong>Casey</strong></span><span>Buy-in <strong>1,000</strong></span>${button(`${icon('settings', 16)} Table settings`, 'drawer:settings', 'text-button')}</div></section><aside class="right-column">${actionPanel()}${historyPanel()}</aside></div><div class="bottom-note"><span>✦</span> The best part of game night is already here. <strong>Each other.</strong></div>`}</main>`;
}
function VariantB() {
  return `<div class="b-shell">${header(true)}<main class="layout-b">${topbar()}${game === 'chess' ? chess('B') : `${intro('The night, in good hands', 'A little less bookkeeping. A lot more playing.', true)}<div class="ledger-stats"><div><span>Total pot</span><strong>${state.pot}<small>chips</small></strong></div><div><span>Playing now</span><strong>${state.street}<small>Hand ${state.hand}</small></strong></div><div><span>Table stakes</span><strong>5 / 10<small>blinds</small></strong></div></div><div class="b-grid"><section class="ledger-panel"><div class="section-heading"><h2>The lineup <span>04</span></h2><span class="pill green">ALL TOGETHER</span></div><div class="ledger-labels"><span>PLAYER / STATUS</span><span>STACK / BET</span></div>${state.players.map((_, i) => playerRow(i)).join('')}<div class="ledger-progress">${streetBar()}</div><div class="ledger-history"><div class="section-heading"><h3>Hand history</h3>${button(`${icon('undo', 16)} Undo`, 'undo', 'text-button', !undo.length || mode !== 'shared')}</div>${state.history.slice(0, 3).map((item, i) => `<div class="timeline-item"><span class="timeline-dot ${i === 0 ? 'blue' : ''}"></span><span>${item}</span><small>${i ? 'Earlier' : 'Just now'}</small></div>`).join('')}</div></section><aside class="ledger-console"><div class="console-top"><span class="eyebrow">KEEP THE TABLE MOVING</span><span>↗</span></div>${actionPanel()}<div class="console-note"><span>✦</span><p>Real cards.<br/>Real people.<br/><strong>Really good times.</strong></p></div></aside></div>`}</main></div>`;
}
function VariantC() {
  const p = state.players[current()];
  return `${header()}<main class="layout-c">${topbar()}${game === 'chess' ? chess('C') : `<div class="focus-top"><div><span class="eyebrow">FRIDAY GAME NIGHT</span><h1>One turn at a time<span class="title-dot">.</span></h1></div><div class="focus-pot"><span>Total pot</span><strong>${state.pot}<small>chips</small></strong></div></div><div class="focus-shell"><section class="focus-stage"><div class="focus-stage-top"><span class="pill">HAND ${state.hand} · ${state.street.toUpperCase()}</span>${button(`${icon('people', 17)} Invite`, 'drawer:invite', 'text-button', mode !== 'shared')}</div>${state.phase === 'betting' ? `<div class="focus-actor"><div class="focus-avatar-wrap">${avatar(current(), true)}<i class="burst burst-one"></i><i class="burst burst-two"></i><i class="burst burst-three"></i></div><span class="eyebrow">${canOperate() ? 'THE FLOOR IS YOURS' : 'WAITING FOR THE TABLE'}</span><h2>${p.name}, you're up<span>.</span></h2><p>${p.stack.toLocaleString()} chips behind you. What’s the move?</p></div>` : '<div class="focus-actor settled-art">✦<h2>Keep the good times going.</h2></div>'}<div class="focus-street">${streetBar()}</div></section><aside class="focus-control">${actionPanel(true)}</aside></div><section class="turn-queue"><div class="section-heading"><h3>Everyone at the table</h3>${button(`${icon('undo', 16)} Undo action`, 'undo', 'text-button', !undo.length || mode !== 'shared')}</div><div class="queue-players">${state.players.map((_, i) => playerRow(i, true)).join('')}</div></section><div class="focus-recent"><span class="online-dot"></span>${state.history[0]}${button('View history →', 'drawer:history', 'text-button')}</div>`}</main>`;
}
function formatTime(ms) {
  const secs = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
function clockFace(i, circle = false) {
  return `<button class="clock-face clock-${i} ${clock.active === i ? 'active' : ''} ${circle ? 'circle-clock' : ''}" data-action="clock:${i}" aria-label="${names[i]} clock: tap to end turn"><div class="clock-player">${avatar(i)}<span>${names[i]}</span><span class="clock-turn-label">${clock.active === i ? clock.running ? 'YOUR MOVE' : 'READY' : 'UP NEXT'}</span></div><div class="clock-time" data-clock="${i}">${formatTime(clock.remaining[i])}</div><div class="clock-caption">${clock.active === i ? clock.running ? 'Tap to end your turn' : 'Start when you’re ready' : 'Take a breath. Your turn is next.'}</div></button>`;
}
function chess(v) {
  return `${intro('Make time for a good game', 'A real board. Two players. One shared clock.', true)}<div class="clock-meta"><span>${icon('clock')} ${clock.minutes} + ${clock.increment / 1000} · Shared clock</span>${button(`${icon('settings', 17)} Time controls`, 'drawer:clock-settings', 'text-button')}</div><section class="chess-layout chess-${v}">${v === 'B' ? `<div class="clock-ledger-intro"><span class="eyebrow">THE LITTLE THINGS THAT COUNT</span><h2>Stay in<br/>the moment<span>.</span></h2><p>We’ll watch the time.</p><span class="chess-knight">♞</span></div>` : ''}<div class="clocks">${clockFace(0, v === 'A')}${clockFace(1, v === 'A')}</div></section><div class="clock-controls">${button(`${icon(clock.running ? 'pause' : 'play')} ${clock.running ? 'Pause' : clock.started ? 'Resume game' : 'Start game'}`, 'clock-toggle', 'button primary')}${button(`${icon('undo', 17)} Reset`, 'clock-reset', 'button button-white')}</div><p class="clock-note">${icon('shield', 16)} Pauses when you leave the app. Stay here, stay together.</p>`;
}
function card(code) {
  if (!code) return '<span class="playing-card empty">+</span>';
  const red = code.includes('♥') || code.includes('♦');
  return `<span class="playing-card ${red ? 'red' : ''}"><b>${code.slice(0, -1)}</b><span>${code.slice(-1)}</span></span>`;
}
function renderDrawer() {
  if (!drawer) return '';
  let title = '', content = '';
  if (drawer === 'history') {
    title = 'Every move, accounted for';
    content = `<p class="muted">Hand ${state.hand} · latest first</p>${state.history.map((s, i) => `<div class="timeline-item"><span class="timeline-dot ${!i ? 'blue' : ''}"></span><strong>${s}</strong></div>`).join('')}`;
  }
  if (drawer === 'invite') {
    title = 'Everyone at the same table';
    content = `<div class="invite-art">${icon('people', 64)}</div><p>Personal phones are optional. The shared device can record everyone’s actions.</p><div class="demo-disclaimer">UI demonstration · no live connections</div><div class="invite-code"><small>EXAMPLE ROOM</small><strong>PLAY · 4826</strong></div><div class="pending-player">${avatar(0)}<div><strong>Alex’s phone</strong><span>Requesting seat 1</span></div>${button('Approve', 'approve', 'button primary')}</div><p class="muted">Future flow: scan a QR/link → claim a seat → host approves. No account needed.</p>`;
  }
  if (drawer === 'settings') {
    title = 'A table for your people';
    content = `<div class="settings-summary"><span>Game</span><strong>No-limit Texas Hold’em</strong><span>Blinds</span><strong>5 / 10 chips</strong><span>Buy-in</span><strong>1,000 chips</strong><span>Device</span><strong>${mode === 'shared' ? 'Shared host' : 'Alex’s phone preview'}</strong></div><p class="muted">These settings are fixed sample data for layout comparison.</p>${button('Reset demo hand', 'reset', 'button primary')}<div class="demo-disclaimer">Throwaway prototype · no persistence · no live multiplayer</div>`;
  }
  if (drawer === 'showdown') {
    title = 'Show your cards';
    const board = ['A♠', 'K♦', '7♣', '4♥', '2♠'];
    const hands = [['A♥', 'Q♥'], ['K♣', 'Q♣'], ['Q♦', 'J♦'], ['10♣', '9♣']];
    content = `<p class="muted">Cards are entered together after physical play. This prototype uses a fixed example deal.</p>${button(cardsLoaded ? 'Example cards loaded ✓' : 'Load example cards', 'load-cards', 'button button-white')}<h3>Community cards</h3><div class="board-cards">${board.map(c => card(cardsLoaded ? c : null)).join('')}</div><h3>Shown hands</h3>${state.players.map((p, i) => p.folded ? '' : `<div class="showdown-player">${avatar(i)}<strong>${p.name}</strong><div>${hands[i].map(c => card(cardsLoaded && !mucked.includes(i) ? c : null)).join('')}</div>${button(mucked.includes(i) ? 'Show hand' : 'Muck', `muck:${i}`, 'text-button', mode !== 'shared')}</div>`).join('')}<div class="demo-disclaimer">Illustrative payout only · no hand evaluator or side pots</div>${button('Preview payout →', 'payout', 'button primary full-width', !cardsLoaded || mode !== 'shared')}`;
  }
  if (drawer === 'payout') {
    title = 'A little round of applause';
    const winner = state.players.findIndex((p, i) => !p.folded && !mucked.includes(i));
    content = `<div class="payout-celebration">${avatar(winner, true)}<span class="pill green">EXAMPLE WINNER</span><h2>${names[winner]} wins ${state.pot}</h2><p>Fixed demo ranking · no side pots</p></div><div class="payout-list">${state.players.map((p, i) => `<div><span>${p.name}</span><strong>${p.stack} ${i === winner ? `<span class="gain">+ ${state.pot}</span> → ${p.stack + state.pot}` : ''}</strong></div>`).join('')}</div>${button('Confirm settlement', 'settle', 'button primary full-width', mode !== 'shared')}`;
  }
  if (drawer === 'clock-settings') {
    title = 'Set the pace';
    content = '<form id="clock-form"><label class="field-label" for="minutes">Starting time per player (minutes)</label><input id="minutes" type="number" name="minutes" min="1" max="180" value="5" required/><label class="field-label" for="increment">Increment per move (seconds)</label><input id="increment" type="number" name="increment" min="0" max="60" value="2" required/><p class="muted">Applying controls resets both clocks.</p><button type="submit" class="button primary full-width">Apply time controls</button></form>';
  }
  return `<div class="drawer-backdrop" data-action="close"></div><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><div class="drawer-top"><span class="eyebrow">PLAYKIT · ${game.toUpperCase()}</span>${button(icon('x'), 'close', 'icon-button')}</div><h2 id="drawer-title">${title}</h2>${content}</section>`;
}
function switcher() {
  if (!import.meta.env.DEV) return '';
  return `<div class="prototype-toolbar"><div class="prototype-switcher" aria-label="UI variant switcher">${button('←', 'variant:prev', 'switch-arrow')}<div><span>UI PROTOTYPE · ${variants.indexOf(variant) + 1} / 3</span><strong>${variant} — ${titles[variant]}</strong></div>${button('→', 'variant:next', 'switch-arrow')}<span class="switch-divider"></span>${button(icon('settings', 18), 'drawer:state', 'switch-arrow state-button')}</div><div class="switch-hint">← → to compare · same in-memory session</div></div>`;
}
function stateDrawer() {
  return `<div class="drawer-backdrop" data-action="close"></div><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><div class="drawer-top"><span class="eyebrow">PROTOTYPE INSPECTOR</span>${button(icon('x'), 'close', 'icon-button')}</div><h2 id="drawer-title">What changed?</h2><p class="muted">All data lives in memory. Switching variants preserves it; reloading resets it.</p><pre>${JSON.stringify({ variant, game, role: mode, ...state, shownCards: cardsLoaded, mucked, clock: { ...clock, last: undefined } }, null, 2)}</pre></section>`;
}
function render() {
  app.innerHTML = `<div class="app variant-${variant}">${variant === 'A' ? VariantA() : variant === 'B' ? VariantB() : VariantC()}${drawer === 'state' ? stateDrawer() : renderDrawer()}${switcher()}${toast ? `<div class="toast" role="status">${icon('check', 18)} ${toast}</div>` : ''}<div class="sr-only" aria-live="polite">${game === 'poker' ? `${state.street}. ${state.phase === 'betting' ? `${names[current()]}'s turn.` : state.phase}. Pot ${state.pot}.` : clock.running ? 'Clock running' : 'Clock paused'}</div></div>`;
  document.title = `PlayKit — ${titles[variant]} · ${game === 'poker' ? 'Poker' : 'Chess clock'}`;
}
function message(text) {
  toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = ''; render(); }, 2600);
}
function save() { undo.push(JSON.stringify({ state, cardsLoaded, mucked })); }
function record(text) { state.history.unshift(text); state.revision++; }
function finishAction() {
  state.queue = state.queue.filter(i => !state.players[i].folded && state.players[i].stack > 0);
  if (state.players.filter(p => !p.folded).length === 1) {
    const winner = state.players.find(p => !p.folded);
    winner.stack += state.pot; state.winner = winner.name; state.pot = 0; state.phase = 'settled'; record(`${winner.name} wins by folds`);
  } else if (!state.queue.length) {
    state.phase = state.street === 'River' ? 'showdown' : 'awaiting';
    message(state.phase === 'showdown' ? 'Betting complete. Time for showdown.' : 'Betting complete. Deal the next card.');
  }
  raiseOpen = false;
}
function action(kind) {
  if (state.phase !== 'betting' || !canOperate()) return;
  save();
  const p = state.players[current()];
  if (kind === 'fold') { p.folded = true; record(`${p.name} folded`); }
  else { const amount = Math.min(p.stack, Math.max(0, state.target - p.bet)); p.stack -= amount; p.bet += amount; state.pot += amount; record(`${p.name} ${amount ? `called ${amount}` : 'checked'}`); }
  state.queue.shift(); finishAction();
}
function syncUrl() {
  const url = new URL(location.href); url.pathname = '/prototype/'; url.searchParams.set('variant', variant); url.searchParams.set('game', game); history.replaceState(null, '', url);
}
function switchVariant(dir) {
  variant = variants[(variants.indexOf(variant) + dir + variants.length) % variants.length];
  syncUrl(); console.info('Prototype state', { variant, game, mode, state: structuredClone(state) }); render();
}
function clockTick() {
  const now = performance.now();
  if (clock.running) {
    clock.remaining[clock.active] = Math.max(0, clock.remaining[clock.active] - (now - clock.last));
    if (!clock.remaining[clock.active]) { clock.running = false; message(`${names[clock.active]}'s time is up`); render(); }
  }
  clock.last = now;
}
app.addEventListener('click', event => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const [type, value] = el.dataset.action.split(':');
  if (type === 'variant') return switchVariant(value === 'next' ? 1 : -1);
  if (type === 'game') { if (game === 'chess' && clock.running) { clockTick(); clock.running = false; } game = value; drawer = null; mode = 'shared'; syncUrl(); }
  if (type === 'mode') { mode = value; raiseOpen = false; message(mode === 'player' ? 'Phone preview: controls belong to Alex' : 'Shared device: record anyone’s turn'); }
  if (type === 'drawer') drawer = value;
  if (type === 'close') drawer = null;
  if (type === 'call' || type === 'fold') action(type);
  if (type === 'raise') raiseOpen = !raiseOpen;
  if (type === 'undo' && undo.length && mode === 'shared') { const old = JSON.parse(undo.pop()); const revision = state.revision + 1; ({ state, cardsLoaded, mucked } = old); state.revision = revision; state.history.unshift('Host undid the last action'); drawer = null; raiseOpen = false; message('Last action undone'); }
  if (type === 'deal' && state.phase === 'awaiting' && mode === 'shared') { save(); state.street = state.street === 'Flop' ? 'Turn' : 'River'; state.players.forEach(p => p.bet = 0); state.target = 0; state.queue = state.players.map((p, i) => p.folded || p.stack === 0 ? -1 : i).filter(i => i >= 0); state.phase = state.queue.length > 1 ? 'betting' : state.street === 'River' ? 'showdown' : 'awaiting'; record(`${state.street} dealt`); }
  if (type === 'load-cards' && mode === 'shared') { save(); cardsLoaded = true; record('Example showdown cards entered'); }
  if (type === 'muck' && mode === 'shared') { const i = Number(value); if (mucked.includes(i)) { save(); mucked = mucked.filter(x => x !== i); record(`${names[i]} showed their hand`); } else if (state.players.filter((p, j) => !p.folded && !mucked.includes(j)).length <= 1) message('At least one eligible shown hand is needed'); else { save(); mucked.push(i); record(`${names[i]} mucked`); } }
  if (type === 'payout' && cardsLoaded && mode === 'shared') drawer = 'payout';
  if (type === 'settle' && mode === 'shared' && state.phase === 'showdown') { save(); const winner = state.players.find((p, i) => !p.folded && !mucked.includes(i)); winner.stack += state.pot; record(`${winner.name} won ${state.pot} chips · demo settlement`); state.winner = winner.name; state.pot = 0; state.phase = 'settled'; drawer = null; message('Payout confirmed. Stacks updated.'); }
  if ((type === 'next' || type === 'reset') && mode === 'shared') { const hand = type === 'next' ? state.hand + 1 : 8; state = fresh(); state.hand = hand; undo = []; cardsLoaded = false; mucked = []; drawer = null; message('Sample hand reset · stacks are demo values'); }
  if (type === 'approve') { drawer = null; message('Sample seat approved · no connection created'); }
  if (type === 'clock-toggle') { clockTick(); if (clock.remaining.some(ms => ms <= 0)) message('Reset the clock to start another game'); else { clock.running = !clock.running; clock.started = true; } }
  if (type === 'clock' && clock.running && clock.active === Number(value)) { clockTick(); if (clock.running) { clock.remaining[clock.active] += clock.increment; clock.active = 1 - clock.active; } }
  if (type === 'clock-reset') { if (!clock.started || confirm('Reset both clocks?')) { clock = { minutes: clock.minutes, remaining: [clock.minutes * 60000, clock.minutes * 60000], increment: clock.increment, active: 0, running: false, last: performance.now(), started: false }; message('Clocks reset'); } }
  render();
});
app.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.id === 'raise-form' && canOperate()) {
    const total = Number(data.get('amount')); const i = current(); const p = state.players[i];
    if (total < state.target + 10 || total > p.bet + p.stack) return;
    save(); const delta = total - p.bet; p.stack -= delta; p.bet = total; state.pot += delta; state.target = total;
    state.queue = [1, 2, 3].map(step => (i + step) % 4).filter(j => !state.players[j].folded && state.players[j].stack > 0);
    record(`${p.name} raised to ${total}`); finishAction();
  }
  if (event.target.id === 'clock-form') { const minutes = Number(data.get('minutes')); const increment = Number(data.get('increment')); clock = { minutes, remaining: [minutes * 60000, minutes * 60000], increment: increment * 1000, active: 0, running: false, last: performance.now(), started: false }; drawer = null; message('Time controls updated'); }
  render();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') { drawer = null; render(); return; }
  if (event.target.closest('input, textarea, select, [contenteditable]') || drawer) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); switchVariant(event.key === 'ArrowLeft' ? -1 : 1); }
});
window.addEventListener('popstate', () => { const p = new URLSearchParams(location.search); variant = variants.includes(p.get('variant')) ? p.get('variant') : 'A'; game = p.get('game') === 'chess' ? 'chess' : 'poker'; render(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && clock.running) { clockTick(); clock.running = false; message('Clock paused while you were away'); render(); } });
setInterval(() => { clockTick(); if (game === 'chess') document.querySelectorAll('[data-clock]').forEach(el => el.textContent = formatTime(clock.remaining[Number(el.dataset.clock)])); }, 100);
syncUrl(); render();
