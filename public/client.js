'use strict';
const socket = io();

const RANK_NAMES = { 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
const SUIT_SYMBOL = { H: '♥', D: '♦', C: '♣', S: '♠' };
const RED_SUITS = ['H', 'D'];
const EMOJI_COUNT = 25; // картинки лежат в /emoji/1.png … /emoji/25.png

let myId = null;
let selectedHandIdx = null;
let selectedTargetAttackIdx = null; // при отбое: какую карту на столе бьём
let lastState = null;

const $ = (sel) => document.querySelector(sel);
const show = (el) => el.hidden = false;
const hide = (el) => el.hidden = true;

function toast(msg, danger = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (danger ? ' danger' : '');
  show(t);
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => hide(t), 3200);
}

function cardEl(card, { small = false, faceDown = false } = {}) {
  const div = document.createElement('div');
  div.className = 'card' + (small ? ' small' : '');
  if (faceDown) { div.classList.add('back'); return div; }
  const isRed = RED_SUITS.includes(card.suit);
  div.classList.add(isRed ? 'red' : 'black');
  const rankTxt = RANK_NAMES[card.rank];
  const suitTxt = SUIT_SYMBOL[card.suit];
  div.innerHTML = `<span class="rank-top">${rankTxt}${suitTxt}</span><span class="suit-mid">${suitTxt}</span><span class="rank-bot">${rankTxt}${suitTxt}</span>`;
  return div;
}

// ---------- Screens ----------
function goScreen(name) {
  ['home', 'lobby', 'game'].forEach(s => {
    $(`#screen-${s}`).hidden = (s !== name);
  });
}

// ---------- Home ----------
$('#btn-create').addEventListener('click', () => {
  const name = $('#input-name').value.trim();
  if (!name) return $('#home-error').textContent = 'Введите имя';
  socket.emit('createRoom', { name }, (res) => {
    if (!res.ok) return $('#home-error').textContent = res.error;
    myId = socket.id;
    $('#lobby-code-text').textContent = res.roomCode;
    goScreen('lobby');
  });
});

$('#btn-join').addEventListener('click', () => {
  const name = $('#input-name').value.trim();
  const code = $('#input-code').value.trim().toUpperCase();
  if (!name) return $('#home-error').textContent = 'Введите имя';
  if (code.length !== 4) return $('#home-error').textContent = 'Код комнаты — 4 символа';
  socket.emit('joinRoom', { name, roomCode: code }, (res) => {
    if (!res.ok) return $('#home-error').textContent = res.error;
    myId = socket.id;
    $('#lobby-code-text').textContent = res.roomCode;
    goScreen('lobby');
  });
});

$('#btn-copy').addEventListener('click', () => {
  navigator.clipboard.writeText($('#lobby-code-text').textContent).then(() => toast('Код скопирован'));
});

$('#btn-start').addEventListener('click', () => {
  socket.emit('startGame', {}, (res) => {
    if (res && !res.ok) $('#lobby-error').textContent = res.error;
  });
});

// ---------- Emoji ----------
(function initEmojiPicker() {
  const grid = $('#emoji-grid');
  for (let i = 1; i <= EMOJI_COUNT; i++) {
    const id = String(i);
    const img = document.createElement('img');
    img.src = `/emoji/${id}.png`;
    img.alt = 'emoji';
    img.dataset.id = id;
    img.addEventListener('click', () => {
      socket.emit('sendEmoji', { emojiId: id });
      hide($('#emoji-picker'));
    });
    grid.appendChild(img);
  }
})();

$('#btn-emoji').addEventListener('click', () => show($('#emoji-picker')));
$('#emoji-picker-close').addEventListener('click', () => hide($('#emoji-picker')));
$('#emoji-picker').addEventListener('click', (e) => {
  if (e.target.id === 'emoji-picker') hide($('#emoji-picker'));
});

function findEmojiAnchor(playerId) {
  if (lastState && playerId === lastState.me) return $('#self-marker');
  return document.querySelector(`.opp-card[data-player-id="${playerId}"]`);
}

function showEmojiBubble(playerId, emojiId) {
  const anchor = findEmojiAnchor(playerId);
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.className = 'emoji-bubble';
  bubble.style.left = (rect.left + rect.width / 2) + 'px';
  bubble.style.top = rect.top + 'px';
  const img = document.createElement('img');
  img.src = `/emoji/${emojiId}.png`;
  bubble.appendChild(img);
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 2300);
}

socket.on('emojiReaction', ({ playerId, emojiId }) => {
  showEmojiBubble(playerId, emojiId);
});

// ---------- Socket state ----------
socket.on('connect', () => { myId = socket.id; });

socket.on('state', (state) => {
  lastState = state;
  myId = state.me || myId;

  if (!state.started) {
    renderLobby(state);
    goScreen('lobby');
    return;
  }
  goScreen('game');
  renderGame(state);
});

function renderLobby(state) {
  $('#lobby-code-text').textContent = state.roomCode;
  const ul = $('#lobby-players');
  ul.innerHTML = '';
  state.players.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span><span class="status-dot" style="background:${p.connected ? '#6ad48b' : '#888'}"></span>${p.name}${p.id === state.me ? ' (вы)' : ''}</span>`;
    ul.appendChild(li);
  });
  $('#btn-start').disabled = state.players.length < 2;
}

function renderGame(state) {
  $('#hdr-room').textContent = state.roomCode;
  $('#hdr-deck').textContent = state.deckCount;

  const me = state.players.find(p => p.id === state.me);
  const isDefender = state.players[state.defenderIdx] && state.players[state.defenderIdx].id === state.me;
  const isAttackSide = !isDefender && state.players.findIndex(p => p.id === state.me) !== state.defenderIdx;

  let statusTxt;
  if (state.gameOver) {
    statusTxt = 'Игра окончена';
  } else if (isDefender) {
    statusTxt = 'Вы защищаетесь';
  } else if (state.players[state.attackerIdx] && state.players[state.attackerIdx].id === state.me) {
    statusTxt = 'Вы атакуете';
  } else {
    statusTxt = 'Ожидание хода…';
  }
  $('#hdr-status').textContent = statusTxt;

  if (me) $('#self-marker-name').textContent = `Вы: ${me.name}`;

  // opponents strip (all players except me, in seat order starting after me)
  const oppWrap = $('#opponents');
  oppWrap.innerHTML = '';
  state.players.forEach((p, idx) => {
    if (p.id === state.me) return;
    const div = document.createElement('div');
    div.className = 'opp-card';
    div.dataset.playerId = p.id;
    if (idx === state.defenderIdx) div.classList.add('is-defender');
    if (idx === state.attackerIdx) div.classList.add('is-attacker');
    if (!p.connected) div.classList.add('offline');
    if (p.out) div.classList.add('is-out');
    const role = idx === state.defenderIdx ? 'Защита' : (idx === state.attackerIdx ? 'Атака' : '');
    div.innerHTML = `${role ? `<span class="opp-role">${role}</span>` : ''}<span class="opp-name">${p.name}</span><span class="opp-count">${p.out ? 'вышел' : p.handCount + ' карт'}</span>`;

    if (!p.out && !state.gameOver && !state.pendingPenalty && (p.handCount === 1 || p.handCount === 2)) {
      const askBtn = document.createElement('button');
      askBtn.className = 'btn btn--ghost btn--tiny';
      askBtn.textContent = 'Сколько у тебя карт?';
      askBtn.addEventListener('click', () => {
        socket.emit('callOutLowCards', { targetId: p.id }, (res) => {
          if (!res.ok) toast(res.error, true);
        });
      });
      div.appendChild(askBtn);
    }
    oppWrap.appendChild(div);
  });

  // table
  const tableWrap = $('#table-cards');
  tableWrap.innerHTML = '';
  state.table.forEach((slot, i) => {
    const cell = document.createElement('div');
    cell.className = 'table-slot';
    const atkEl = cardEl(slot.attack);
    atkEl.classList.add('stack-card', 'atk');
    atkEl.style.cursor = 'default';
    cell.appendChild(atkEl);
    if (slot.defend) {
      const defEl = cardEl(slot.defend);
      defEl.classList.add('stack-card', 'def');
      defEl.style.cursor = 'default';
      cell.appendChild(defEl);
    } else if (isDefender && !state.gameOver && !state.pendingPenalty) {
      cell.style.cursor = 'pointer';
      cell.title = 'Отбить этой картой';
      cell.addEventListener('click', () => {
        if (selectedHandIdx === null) return toast('Сначала выберите карту в руке');
        socket.emit('defend', { attackIdx: i, cardIdx: selectedHandIdx }, (res) => {
          if (!res.ok) toast(res.error, true); else { selectedHandIdx = null; }
        });
      });
    }
    tableWrap.appendChild(cell);
  });

  // Намеренно не показываем игрокам баннер о том, что после дамы подкидывать
  // нельзя — это часть правил «Тупки»: спалиться на нарушении можно только
  // на собственной внимательности.

  renderPenaltyBanner(state);

  // log
  const logPanel = $('#log-panel');
  logPanel.innerHTML = state.log.map(l => `<div>${escapeHtml(l.msg)}</div>`).join('');
  logPanel.scrollTop = logPanel.scrollHeight;

  // my hand
  const handWrap = $('#hand-cards');
  handWrap.innerHTML = '';
  const myHand = me && me.hand ? me.hand : [];
  myHand.forEach((card, idx) => {
    const el = cardEl(card);
    if (selectedHandIdx === idx) el.classList.add('selected');
    el.addEventListener('click', () => {
      selectedHandIdx = (selectedHandIdx === idx) ? null : idx;
      renderGame(lastState);
    });
    handWrap.appendChild(el);
  });

  // actions
  const actions = $('#hand-actions');
  actions.innerHTML = '';
  if (state.gameOver) {
    showGameOver(state);
    return;
  }

  if (state.pendingPenalty) {
    renderPenaltyActions(state, actions);
    return;
  }

  if (me && (me.hand ? me.hand.length : 0) <= 2 && (me.hand ? me.hand.length : 0) > 0 && !me.lowCardAnnounced) {
    const declareBtn = document.createElement('button');
    declareBtn.className = 'btn btn--primary';
    declareBtn.textContent = me.hand.length === 1 ? 'У меня одна карта!' : 'У меня две карты!';
    declareBtn.addEventListener('click', () => {
      socket.emit('declareLowCards', {}, (res) => { if (!res.ok) toast(res.error, true); });
    });
    actions.appendChild(declareBtn);
  }

  if (isDefender) {
    const takeBtn = document.createElement('button');
    takeBtn.className = 'btn btn--ghost';
    takeBtn.textContent = 'Взять карты';
    takeBtn.disabled = state.table.length === 0;
    takeBtn.addEventListener('click', () => socket.emit('take', {}, (res) => { if (!res.ok) toast(res.error, true); }));
    actions.appendChild(takeBtn);

    const canTranslate = state.table.length > 0 && !state.table.some(t => t.defend);
    const transBtn = document.createElement('button');
    transBtn.className = 'btn btn--ghost';
    transBtn.textContent = 'Перевести';
    transBtn.disabled = !canTranslate;
    transBtn.addEventListener('click', () => {
      if (selectedHandIdx === null) return toast('Выберите карту для перевода');
      socket.emit('translate', { cardIdx: selectedHandIdx }, (res) => {
        if (!res.ok) toast(res.error, true); else selectedHandIdx = null;
      });
    });
    actions.appendChild(transBtn);
  } else {
    const throwBtn = document.createElement('button');
    throwBtn.className = 'btn btn--primary';
    throwBtn.textContent = 'Подкинуть';
    throwBtn.addEventListener('click', () => {
      if (selectedHandIdx === null) return toast('Выберите карту');
      socket.emit('attack', { cardIdx: selectedHandIdx }, (res) => {
        if (!res.ok) toast(res.error, true); else selectedHandIdx = null;
      });
    });
    actions.appendChild(throwBtn);

    const allDefended = state.table.length > 0 && state.table.every(t => t.defend);
    const doneBtn = document.createElement('button');
    doneBtn.className = 'btn btn--ghost';
    doneBtn.textContent = 'Бито (завершить раунд)';
    doneBtn.disabled = !allDefended;
    doneBtn.addEventListener('click', () => socket.emit('done', {}, (res) => { if (!res.ok) toast(res.error, true); }));
    actions.appendChild(doneBtn);
  }
}

function renderPenaltyBanner(state) {
  const banner = $('#penalty-banner');
  const p = state.pendingPenalty;
  if (!p) { hide(banner); return; }
  if (p.youOwe) {
    banner.textContent = `⚠ Нарушение: ${p.reason}. Выберите карту в руке и отдайте её игроку ${p.violatorName}.`;
  } else if (p.violatorId === state.me) {
    banner.textContent = `⚠ Вы нарушили правило (${p.reason}). Остальные сейчас выбирают, какую карту вам отдать…`;
  } else {
    banner.textContent = `⚠ ${p.violatorName} нарушил(а) правило. Ждём, пока остальные отдадут штрафные карты…`;
  }
  show(banner);
}

function renderPenaltyActions(state, actionsEl) {
  const p = state.pendingPenalty;
  if (!p.youOwe) {
    const info = document.createElement('p');
    info.style.color = 'rgba(247,241,225,.7)';
    info.style.fontSize = '.85rem';
    info.textContent = 'Ожидаем штрафные карты от остальных игроков…';
    actionsEl.appendChild(info);
    return;
  }
  const giveBtn = document.createElement('button');
  giveBtn.className = 'btn btn--primary';
  giveBtn.textContent = `Отдать карту игроку ${p.violatorName}`;
  giveBtn.addEventListener('click', () => {
    if (selectedHandIdx === null) return toast('Выберите карту, которую отдадите');
    socket.emit('givePenaltyCard', { cardIdx: selectedHandIdx }, (res) => {
      if (!res.ok) toast(res.error, true); else selectedHandIdx = null;
    });
  });
  actionsEl.appendChild(giveBtn);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showGameOver(state) {
  const modal = $('#gameover-modal');
  const loser = state.players.find(p => p.id === state.loserId);
  $('#gameover-title').textContent = 'Игра окончена!';
  $('#gameover-text').textContent = loser
    ? `Тупка — ${loser.name}${loser.id === state.me ? ' (это вы)' : ''}. Остальные победили!`
    : 'Ничья — карты закончились у всех одновременно.';
  show(modal);
}
