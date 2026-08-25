'use strict';

/**
 * Игра «Тупка» — вариант «Дурака» для 2-6 игроков.
 *
 * Правила, зашитые в движок:
 *  - Колода 36 карт, козырь — ВСЕГДА черви (H), независимо от раздачи.
 *  - Старшинство карт как в дураке: 6 7 8 9 10 В Д К Т.
 *  - Пики (S) — особая масть: отбить карту пик можно ТОЛЬКО пикой старше.
 *    Козырем (черви) пику бить нельзя.
 *  - Перевод карты — как в дураке: если у отбивающегося есть карта такого же
 *    достоинства, как атакующая, он может «перевести» — вся атака уходит
 *    следующему игроку по кругу вместе с переведённой картой, а он становится
 *    отбивающимся. Перевести можно только пока сам ещё не отбил ни одной карты
 *    в этом раунде. При игре ВДВОЁМ перевод разрешён и возвращает атаку
 *    первому атакующему — тот становится защитником переведённой карты.
 *  - Если игрок отбился дамой (рангом «Д»), после этого в данном раунде
 *    подкидывать карты запрещается ВСЕМ (включая атакующего).
 *  - Шестёрки может подкинуть в любой момент раунда ЛЮБОЙ игрок (атакующей
 *    стороны), даже если на столе ещё нет шестёрки и даже после «дамского»
 *    запрета — шестёрки выведены из-под этого запрета намеренно.
 *  - При нарушении правила (подкидывание после дамы, попытка отбить пику
 *    козырем, подкидывание карты не того ранга и т.п.) ход отклоняется,
 *    нарушивший игрок сразу поднимает все карты, которые лежали на столе
 *    (были подкинуты в этом раунде), после чего игра приостанавливается и
 *    КАЖДЫЙ живой игрок (кроме нарушителя) сам выбирает и отдаёт нарушителю
 *    ещё одну карту из своей руки. Раунд завершается как обычное «взятие».
 *  - Если карта переводилась несколько раз подряд (перевод за переводом) и
 *    итоговый защитник в конце концов законно отбился дамой, стол не идёт
 *    в отбой целиком: пара «атака-дама» считается закрытой, а ВСЕ остальные
 *    карты, лежавшие на столе, забирает себе игрок, который перевёл карту
 *    последним. Само по себе поражение дамой в интерфейсе никак не
 *    анонсируется заранее — это намеренно, чтобы игроки следили за столом
 *    сами и не подкидывали вслепую.
 *  - Если у игрока в руке остаётся 1 или 2 карты, он обязан сам объявить
 *    об этом («У меня одна/две карты!»). Если он забыл, а кто-то другой из
 *    игроков заметил это первым и спросил его «сколько у тебя карт?» —
 *    все остальные живые игроки отдают зазевавшемуся по одной карте
 *    (сам раунд при этом не прерывается, это отдельный маленький штраф).
 *  - Побеждает тот, кто первым избавился от карт (при пустой колоде).
 *    Игра заканчивается, когда остаётся один игрок с картами — он и есть
 *    «тупка» (проигравший).
 */

const SUITS = ['H', 'D', 'C', 'S']; // Черви, Бубны, Трефы, Пики
const SUIT_NAMES = { H: 'Черви', D: 'Бубны', C: 'Трефы', S: 'Пики' };
const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=В 12=Д 13=К 14=Т
const RANK_NAMES = { 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
const TRUMP_SUIT = 'H';
const HAND_SIZE = 6;
const QUEEN_RANK = 12;
const SIX_RANK = 6;

function cardId(c) { return `${c.rank}${c.suit}`; }
function cardLabel(c) { return `${RANK_NAMES[c.rank]}${suitSymbol(c.suit)}`; }
function suitSymbol(s) { return { H: '♥', D: '♦', C: '♣', S: '♠' }[s]; }

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r });
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Может ли карта def отбить карту atk (без учёта пиковых/козырных особых правил)
function beatsPlain(atk, def) {
  if (def.suit === atk.suit) return def.rank > atk.rank;
  if (def.suit === TRUMP_SUIT && atk.suit !== TRUMP_SUIT) return true;
  return false;
}

/**
 * Проверка отбоя с учётом правила пик:
 * пику может отбить только старшая пика — козырем пику бить нельзя.
 */
function canBeat(atk, def) {
  if (atk.suit === 'S') {
    return def.suit === 'S' && def.rank > atk.rank;
  }
  return beatsPlain(atk, def);
}

class Game {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = []; // {id, name, hand:[card], connected, out:false}
    this.started = false;
    this.deck = [];
    this.discardCount = 0;
    this.table = []; // [{attack: card, defend: card|null}]
    this.attackerIdx = null;
    this.defenderIdx = null;
    this.queenLock = false; // true -> подкидывать больше нельзя (кроме шестёрок)
    this.translateChain = []; // id игроков, переводивших карту подряд в текущем раунде (по порядку)
    this.finishedOrder = []; // id игроков, вышедших из игры (без карт)
    this.log = [];
    this.awaitingTake = false; // отбивающийся решил взять — ждём завершения раунда
    this.gameOver = false;
    this.loserId = null;
    this.pendingPenalty = null; // {violatorId, violatorName, reason, owingIds: [id,...]}
  }

  addPlayer(id, name) {
    if (this.started) throw new Error('Игра уже началась');
    if (this.players.length >= 6) throw new Error('Комната заполнена (максимум 6 игроков)');
    if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Такое имя уже занято в этой комнате');
    }
    this.players.push({
      id, name, hand: [], connected: true, out: false,
      lowCardLen: null, lowCardAnnounced: false, // "У меня одна/две карты!"
    });
  }

  removePlayerBySocket(id) {
    const p = this.players.find(p => p.id === id);
    if (p) p.connected = false;
  }

  getPlayer(id) { return this.players.find(p => p.id === id); }

  activePlayers() { return this.players.filter(p => !p.out); }

  pushLog(msg) {
    this.log.push({ msg, t: Date.now() });
    if (this.log.length > 200) this.log.shift();
  }

  /**
   * Правило «последняя карта»: когда у игрока остаётся 1 или 2 карты, он
   * обязан сам об этом сказать (declareLowCards). Флаг «объявлено» сбрасывается
   * каждый раз, когда количество карт у игрока меняется и снова попадает
   * в зону 1-2 (например: было 2, взял штрафную и стало 3, потом сыграл и
   * снова стало 2 — надо объявлять заново).
   */
  syncLowCardState(player) {
    const len = player.hand.length;
    if (len === 1 || len === 2) {
      if (player.lowCardLen !== len) {
        player.lowCardLen = len;
        player.lowCardAnnounced = false;
      }
    } else {
      player.lowCardLen = null;
      player.lowCardAnnounced = false;
    }
  }

  syncAllLowCardStates() {
    this.players.forEach(p => this.syncLowCardState(p));
  }

  start() {
    if (this.players.length < 2) throw new Error('Нужно минимум 2 игрока');
    this.started = true;
    this.deck = shuffle(makeDeck());
    for (const p of this.players) {
      p.hand = this.deck.splice(0, HAND_SIZE);
      p.out = false;
    }
    // Первый ход у того, у кого младший козырь (классическое правило), иначе — случайно
    let starter = 0;
    let bestTrumpRank = Infinity;
    this.players.forEach((p, idx) => {
      p.hand.forEach(c => {
        if (c.suit === TRUMP_SUIT && c.rank < bestTrumpRank) {
          bestTrumpRank = c.rank;
          starter = idx;
        }
      });
    });
    this.attackerIdx = starter;
    this.defenderIdx = this.nextActiveIdx(starter);
    this.table = [];
    this.queenLock = false;
    this.translateChain = [];
    this.gameOver = false;
    this.loserId = null;
    this.syncAllLowCardStates();
    this.pushLog(`Игра началась. Козырь — черви. Ходит ${this.players[starter].name}.`);
  }

  nextActiveIdx(fromIdx) {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      if (!this.players[idx].out) return idx;
    }
    return fromIdx;
  }

  playersInAttackOrderIdx() {
    // Порядок подкидывания: атакующий, затем все остальные по кругу, кроме защитника
    const n = this.players.length;
    const order = [];
    let idx = this.attackerIdx;
    for (let step = 0; step < n; step++) {
      if (idx !== this.defenderIdx && !this.players[idx].out) order.push(idx);
      idx = (idx + 1) % n;
    }
    return order;
  }

  undefeatedCount() {
    return this.table.filter(t => !t.defend).length;
  }

  tableRanksInPlay() {
    const set = new Set();
    this.table.forEach(t => {
      set.add(t.attack.rank);
      if (t.defend) set.add(t.defend.rank);
    });
    return set;
  }

  maxThrowInAllowed() {
    // Нельзя подкинуть больше карт, чем может принять защитник (изначальный размер руки)
    const defender = this.players[this.defenderIdx];
    return defender.hand.length + this.table.filter(t => t.defend).length; // сколько всего может лежать максимум
  }

  serializeFor(playerId) {
    const me = this.getPlayer(playerId);
    return {
      roomCode: this.roomCode,
      started: this.started,
      gameOver: this.gameOver,
      loserId: this.loserId,
      trump: TRUMP_SUIT,
      deckCount: this.deck.length,
      queenLock: this.queenLock,
      pendingPenalty: this.pendingPenalty ? {
        violatorId: this.pendingPenalty.violatorId,
        violatorName: this.pendingPenalty.violatorName,
        reason: this.pendingPenalty.reason,
        owingIds: this.pendingPenalty.owingIds,
        youOwe: this.pendingPenalty.owingIds.includes(playerId),
      } : null,
      attackerIdx: this.attackerIdx,
      defenderIdx: this.defenderIdx,
      table: this.table.map(t => ({
        attack: t.attack,
        defend: t.defend || null,
      })),
      log: this.log.slice(-30),
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        out: p.out,
        handCount: p.hand.length,
        lowCardAnnounced: p.lowCardAnnounced,
        hand: p.id === playerId ? p.hand : undefined,
      })),
      me: me ? me.id : null,
    };
  }

  // ---- Игровые действия ----

  isAttackTurn(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return false;
    if (idx === this.defenderIdx) return false;
    if (this.players[idx].out) return false;
    return true;
  }

  canThrowRank(rank) {
    if (this.table.length === 0) return true; // первая карта раунда — любая
    if (rank === SIX_RANK) return true; // шестёрки — всегда можно
    if (this.queenLock) return false;
    return this.tableRanksInPlay().has(rank);
  }

  /** Игрок подкидывает/атакует картой. Возвращает {ok, penalty, error} */
  attack(playerId, cardIdx) {
    if (this.pendingPenalty) return { ok: false, error: 'Дождитесь, пока все отдадут штрафные карты' };
    const pIdx = this.players.findIndex(p => p.id === playerId);
    const player = this.players[pIdx];
    if (!player || player.out) return { ok: false, error: 'Вы не в игре' };
    if (pIdx === this.defenderIdx) return { ok: false, error: 'Защитник не может подкидывать' };
    if (this.awaitingTake) return { ok: false, error: 'Раунд завершается' };

    const card = player.hand[cardIdx];
    if (!card) return { ok: false, error: 'Нет такой карты' };

    const defender = this.players[this.defenderIdx];
    const roomForMore = this.maxThrowInAllowedNow();
    if (this.table.length > 0 && roomForMore <= 0) {
      return { ok: false, error: 'У защитника недостаточно карт, чтобы принять подкидывание' };
    }

    const ranksOk = this.canThrowRank(card.rank);
    if (!ranksOk) {
      // Нарушение правил: подкидывание карты не того ранга, либо после дамского запрета
      this.applyPenalty(player, this.queenLock
        ? `${player.name} попытался подкинуть карту после отбоя дамой`
        : `${player.name} попытался подкинуть карту не того достоинства`);
      return { ok: false, error: 'Нарушение: так подкидывать нельзя', penalty: true };
    }

    // всё ок
    player.hand.splice(cardIdx, 1);
    this.table.push({ attack: card, defend: null });
    this.pushLog(`${player.name} подкидывает ${cardLabel(card)}`);
    this.checkAutoOut(player);
    this.syncAllLowCardStates();
    return { ok: true };
  }

  maxThrowInAllowedNow() {
    const defender = this.players[this.defenderIdx];
    const undefeated = this.undefeatedCount();
    return defender.hand.length - undefeated;
  }

  /** Защитник пытается отбить attackTableIdx карту картой cardIdx из своей руки */
  defend(playerId, attackTableIdx, cardIdx) {
    if (this.pendingPenalty) return { ok: false, error: 'Дождитесь, пока все отдадут штрафные карты' };
    const pIdx = this.players.findIndex(p => p.id === playerId);
    const player = this.players[pIdx];
    if (!player) return { ok: false, error: 'Вы не в игре' };
    if (pIdx !== this.defenderIdx) return { ok: false, error: 'Вы не защищаетесь в этом раунде' };
    const slot = this.table[attackTableIdx];
    if (!slot || slot.defend) return { ok: false, error: 'Нечего отбивать' };
    const card = player.hand[cardIdx];
    if (!card) return { ok: false, error: 'Нет такой карты' };

    const legal = canBeat(slot.attack, card);
    if (!legal) {
      const isSpadeTrumpViolation = slot.attack.suit === 'S' && card.suit === TRUMP_SUIT;
      this.applyPenalty(player, isSpadeTrumpViolation
        ? `${player.name} попытался отбить пику козырем`
        : `${player.name} попытался отбить карту неправильной картой`);
      return { ok: false, error: 'Нарушение: так отбивать нельзя', penalty: true };
    }

    player.hand.splice(cardIdx, 1);
    slot.defend = card;
    this.pushLog(`${player.name} отбивает ${cardLabel(slot.attack)} картой ${cardLabel(card)}`);

    if (card.rank === QUEEN_RANK) {
      this.queenLock = true;
      if (this.translateChain.length > 0) {
        const lastTranslatorId = this.translateChain[this.translateChain.length - 1];
        const collector = this.getPlayer(lastTranslatorId);
        if (collector && collector.id !== player.id) {
          const collected = [];
          this.table.forEach((t, i) => {
            if (i === attackTableIdx) return;
            collected.push(t.attack);
            if (t.defend) collected.push(t.defend);
          });
          if (collected.length > 0) {
            collector.hand.push(...collected);
            this.table = [slot];
            this.pushLog(`${player.name} отбивает дамой. ${collector.name} забирает ${collected.length} карт со стола.`);
          } else {
            this.pushLog(`${player.name} отбивает дамой.`);
          }
        } else {
          this.pushLog(`${player.name} отбивает дамой.`);
        }
      } else {
        this.pushLog(`${player.name} отбивает дамой.`);
      }
    }

    this.checkAutoOut(player);

    if (this.undefeatedCount() === 0) {
      // всё отбито — можно либо завершать раунд (бито), либо ждать возможных подкидываний
    }
    this.syncAllLowCardStates();
    return { ok: true };
  }

  /**
   * Перевод карты: защитник переводит атаку на следующего игрока, если ещё
   * не отбил ни одной карты в этом раунде и есть карта такого же ранга, как
   * одна из атакующих карт на столе.
   */
  translate(playerId, cardIdx) {
    if (this.pendingPenalty) return { ok: false, error: 'Дождитесь, пока все отдадут штрафные карты' };
    const pIdx = this.players.findIndex(p => p.id === playerId);
    const player = this.players[pIdx];
    if (!player) return { ok: false, error: 'Вы не в игре' };
    if (pIdx !== this.defenderIdx) return { ok: false, error: 'Переводить может только защитник' };
    if (this.table.some(t => t.defend)) {
      return { ok: false, error: 'Нельзя перевести — вы уже отбивали карту в этом раунде' };
    }
    const card = player.hand[cardIdx];
    if (!card) return { ok: false, error: 'Нет такой карты' };
    const matches = this.table.every(t => t.attack.rank === this.table[0].attack.rank);
    if (!matches || card.rank !== this.table[0].attack.rank) {
      this.applyPenalty(player, `${player.name} попытался перевести карту неправильного достоинства`);
      return { ok: false, error: 'Нарушение: перевести можно только той же картой, что лежит на столе', penalty: true };
    }
    const nextIdx = this.nextActiveIdx(this.defenderIdx);
    player.hand.splice(cardIdx, 1);
    this.table.push({ attack: card, defend: null });
    this.pushLog(`${player.name} переводит карту ${cardLabel(card)} следующему игроку`);
    this.attackerIdx = pIdx;
    this.defenderIdx = nextIdx;
    this.translateChain.push(player.id);
    this.checkAutoOut(player);
    this.syncAllLowCardStates();
    return { ok: true, translated: true };
  }

  /** Защитник берёт все карты со стола */
  take(playerId) {
    if (this.pendingPenalty) return { ok: false, error: 'Дождитесь, пока все отдадут штрафные карты' };
    const pIdx = this.players.findIndex(p => p.id === playerId);
    const player = this.players[pIdx];
    if (!player) return { ok: false, error: 'Вы не в игре' };
    if (pIdx !== this.defenderIdx) return { ok: false, error: 'Брать может только защитник' };
    const cards = [];
    this.table.forEach(t => { cards.push(t.attack); if (t.defend) cards.push(t.defend); });
    player.hand.push(...cards);
    this.pushLog(`${player.name} забирает карты со стола (${cards.length} шт.)`);
    this.table = [];
    this.queenLock = false;
    this.translateChain = [];
    this.syncAllLowCardStates();
    this.endRound({ taken: true });
    return { ok: true };
  }

  /** Атакующая сторона объявляет "бито" — завершить раунд без подкидывания */
  done(playerId) {
    if (this.pendingPenalty) return { ok: false, error: 'Дождитесь, пока все отдадут штрафные карты' };
    if (this.undefeatedCount() > 0) {
      return { ok: false, error: 'Ещё есть неотбитые карты' };
    }
    const order = this.playersInAttackOrderIdx();
    const pIdx = this.players.findIndex(p => p.id === playerId);
    if (!order.includes(pIdx)) return { ok: false, error: 'Только атакующая сторона может завершить раунд' };
    this.discardCount += this.table.length * 2;
    this.pushLog('Раунд завершён — карты биты и уходят в отбой.');
    this.table = [];
    this.queenLock = false;
    this.translateChain = [];
    this.endRound({ taken: false });
    return { ok: true };
  }

  endRound({ taken }) {
    // Добор карт до 6, начиная с атакующего по кругу, защитник — последним (если брал не он)
    const n = this.players.length;
    const drawOrder = [];
    let idx = this.attackerIdx;
    for (let s = 0; s < n; s++) {
      if (!this.players[idx].out) drawOrder.push(idx);
      idx = (idx + 1) % n;
    }
    // защитник должен добирать последним
    const defIdxPos = drawOrder.indexOf(this.defenderIdx);
    if (defIdxPos !== -1) {
      drawOrder.splice(defIdxPos, 1);
      drawOrder.push(this.defenderIdx);
    }
    for (const i of drawOrder) {
      const p = this.players[i];
      while (p.hand.length < HAND_SIZE && this.deck.length > 0) {
        p.hand.push(this.deck.pop());
      }
    }

    // Проверка выхода из игры (пустая рука при пустой колоде)
    this.players.forEach(p => this.checkAutoOut(p));
    this.syncAllLowCardStates();

    const remaining = this.activePlayers();
    if (remaining.length <= 1) {
      this.gameOver = true;
      this.loserId = remaining.length === 1 ? remaining[0].id : null;
      this.pushLog(remaining.length === 1
        ? `Игра окончена! Тупка — ${remaining[0].name}.`
        : 'Игра окончена вничью (карты закончились у всех одновременно).');
      return;
    }

    if (!taken) {
      this.attackerIdx = this.defenderIdx;
    }
    // если taken=true, атакующий остаётся прежним индексом-владельцем роли,
    // но т.к. состав "out" мог измениться, нормализуем через nextActiveIdx ниже
    if (this.players[this.attackerIdx].out) {
      this.attackerIdx = this.nextActiveIdx(this.attackerIdx);
    }
    this.defenderIdx = this.nextActiveIdx(this.attackerIdx);
  }

  checkAutoOut(player) {
    if (this.deck.length === 0 && player.hand.length === 0 && !player.out) {
      player.out = true;
      this.pushLog(`${player.name} избавился от всех карт и выходит из игры!`);
    }
  }

  /**
   * Штраф: каждый живой игрок (кроме нарушителя) должен сам выбрать и отдать
   * нарушителю одну карту из своей руки. Игра приостанавливается до тех пор,
   * пока все должники не отдадут карту (см. givePenaltyCard).
   */
  applyPenalty(violator, reasonMsg) {
    // Нарушивший сразу поднимает карты, которые были подкинуты на стол в этом раунде.
    const pickedUp = [];
    this.table.forEach(t => { pickedUp.push(t.attack); if (t.defend) pickedUp.push(t.defend); });
    if (pickedUp.length > 0) {
      violator.hand.push(...pickedUp);
      this.table = [];
      this.queenLock = false;
      this.translateChain = [];
    }
    const prefix = pickedUp.length > 0 ? `${violator.name} поднимает карты со стола (${pickedUp.length} шт.). ` : '';
    this.startCardDebt(violator, reasonMsg, { prefix, endsRound: true });
  }

  /**
   * Правило «последней карты»: если у кого-то осталась 1 или 2 карты и он не
   * объявил об этом сам, любой другой игрок может первым спросить «сколько у
   * тебя карт?». Если действительно поймал — каждый живой игрок отдаёт
   * зазевавшемуся по одной карте (раунд при этом не прерывается).
   */
  declareLowCards(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return { ok: false, error: 'Вы не в игре' };
    if (player.hand.length !== 1 && player.hand.length !== 2) {
      return { ok: false, error: 'У вас сейчас не 1 и не 2 карты — объявлять нечего' };
    }
    if (player.lowCardAnnounced) {
      return { ok: false, error: 'Вы уже объявили' };
    }
    player.lowCardAnnounced = true;
    const word = player.hand.length === 1 ? 'одна карта' : 'две карты';
    this.pushLog(`📣 ${player.name}: у меня осталась ${word}!`);
    return { ok: true };
  }

  callOutLowCards(callerId, targetId) {
    if (this.pendingPenalty) return { ok: false, error: 'Дождитесь, пока все отдадут штрафные карты' };
    const caller = this.getPlayer(callerId);
    const target = this.getPlayer(targetId);
    if (!caller) return { ok: false, error: 'Вы не в игре' };
    if (!target || target.out) return { ok: false, error: 'Такого игрока нет в игре' };
    if (caller.id === target.id) return { ok: false, error: 'Себя окликать нельзя' };
    if (target.hand.length !== 1 && target.hand.length !== 2) {
      return { ok: false, error: 'У этого игрока сейчас не 1 и не 2 карты' };
    }
    if (target.lowCardAnnounced) {
      return { ok: false, error: 'Мимо — этот игрок уже объявил' };
    }
    this.pushLog(`👉 ${caller.name} спрашивает ${target.name}: «Сколько у тебя карт?» — а тот не сказал!`);
    this.startCardDebt(target, `${target.name} не объявил вовремя, что у него мало карт`, { endsRound: false });
    return { ok: true, caught: true };
  }

  /** Общий механизм карточного долга: остальные живые игроки отдают по 1 карте адресату. */
  startCardDebt(target, reasonMsg, { prefix = '', endsRound = false } = {}) {
    const owingIds = this.players
      .filter(p => p.id !== target.id && !p.out && p.hand.length > 0)
      .map(p => p.id);
    this.pushLog(`⚠ ${reasonMsg}. ${prefix}${owingIds.length > 0 ? 'Каждый игрок должен отдать по 1 карте.' : ''}`);

    if (owingIds.length === 0) {
      if (endsRound) this.finalizePenalty(target);
      else this.syncAllLowCardStates();
      return;
    }
    this.pendingPenalty = {
      violatorId: target.id,
      violatorName: target.name,
      reason: reasonMsg,
      owingIds,
      endsRound,
    };
  }

  /** Завершает раунд после того, как штраф полностью выплачен (карты добираются как после обычного "взятия"). */
  finalizePenalty(violator) {
    this.checkAutoOut(violator);
    this.endRound({ taken: true });
  }

  /** Игрок-должник сам выбирает карту cardIdx из своей руки и отдаёт её адресату штрафа */
  givePenaltyCard(playerId, cardIdx) {
    const pending = this.pendingPenalty;
    if (!pending) return { ok: false, error: 'Сейчас нет ожидающего штрафа' };
    if (!pending.owingIds.includes(playerId)) {
      return { ok: false, error: 'Вы не должны отдавать штрафную карту' };
    }
    const player = this.getPlayer(playerId);
    const violator = this.getPlayer(pending.violatorId);
    const card = player.hand[cardIdx];
    if (!card) return { ok: false, error: 'Нет такой карты' };

    player.hand.splice(cardIdx, 1);
    violator.hand.push(card);
    this.pushLog(`${player.name} отдаёт карту ${cardLabel(card)} игроку ${violator.name} (штраф)`);

    pending.owingIds = pending.owingIds.filter(id => id !== playerId);
    if (pending.owingIds.length === 0) {
      this.pendingPenalty = null;
      if (pending.endsRound) {
        this.pushLog('Штраф выплачен полностью, раунд продолжается.');
        this.finalizePenalty(violator);
      } else {
        this.pushLog('Карты за невнимательность розданы.');
        this.syncAllLowCardStates();
      }
    }
    return { ok: true };
  }
}

module.exports = { Game, cardId, cardLabel, canBeat, TRUMP_SUIT, RANK_NAMES, SUIT_NAMES, HAND_SIZE };
