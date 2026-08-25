const { Game, canBeat } = require('./game');

// 1. Пика бьётся только пикой
console.assert(canBeat({suit:'S',rank:8},{suit:'S',rank:10}) === true, 'пика бьёт пику старше');
console.assert(canBeat({suit:'S',rank:8},{suit:'H',rank:14}) === false, 'козырь НЕ должен бить пику');
console.assert(canBeat({suit:'D',rank:8},{suit:'H',rank:6}) === true, 'козырь бьёт не-пику');
console.assert(canBeat({suit:'D',rank:8},{suit:'D',rank:14}) === true, 'старшая карта той же масти бьёт');

// 2. Симуляция игры: штраф за нарушение (бить пику козырем)
const g = new Game('TEST');
g.addPlayer('p1', 'Alice');
g.addPlayer('p2', 'Bob');
g.start();
// подстроим руки вручную для теста
const alice = g.getPlayer('p1');
const bob = g.getPlayer('p2');
g.attackerIdx = g.players.findIndex(p=>p.id==='p1');
g.defenderIdx = g.players.findIndex(p=>p.id==='p2');
alice.hand = [{suit:'S',rank:9}, {suit:'C',rank:7}];
bob.hand = [{suit:'H',rank:14}]; // козырь туз - не должен пробить пику

let r = g.attack('p1', 0);
console.assert(r.ok, 'атака пикой должна пройти');
r = g.defend('p2', 0, 0);
console.assert(r.ok === false && r.penalty === true, 'попытка бить пику козырем должна быть нарушением со штрафом');
console.assert(g.pendingPenalty && g.pendingPenalty.violatorId === 'p2', 'должен появиться ожидающий штраф на Bob');
console.assert(g.pendingPenalty.owingIds.includes('p1'), 'Alice должна быть в списке должников');

// действия должны блокироваться, пока штраф не выплачен
r = g.attack('p1', 0);
console.assert(r.ok === false, 'нельзя атаковать, пока штраф не выплачен');

const aliceHandBefore = alice.hand.length;
const bobHandBefore = bob.hand.length;
r = g.givePenaltyCard('p1', 0);
console.assert(r.ok, 'Alice должна суметь сама выбрать и отдать карту');
console.assert(g.pendingPenalty === null, 'штраф должен закрыться после выплаты единственным должником');
// После выплаты штрафа раунд завершается как обычное "взятие" — у всех идёт
// добор карт из колоды до 6, так что проверяем итоговый размер руки, а не дельту.
console.assert(alice.hand.length === 6, 'у Alice рука должна добраться до 6 после завершения раунда');
console.assert(bob.hand.length === 6, 'у Bob (он поднял пику + получил штрафную) рука тоже добирается до 6');

// ---- Нарушение: нарушивший сразу поднимает карты со стола ----
const g1b = new Game('TEST1B');
g1b.addPlayer('x1', 'Xenia');
g1b.addPlayer('x2', 'Yan');
g1b.start();
const xenia = g1b.getPlayer('x1');
const yan = g1b.getPlayer('x2');
g1b.attackerIdx = g1b.players.findIndex(p => p.id === 'x1');
g1b.defenderIdx = g1b.players.findIndex(p => p.id === 'x2');
xenia.hand = [{ suit: 'D', rank: 9 }, { suit: 'D', rank: 8 }];
yan.hand = [{ suit: 'D', rank: 6 }]; // заведомо слабее — попытка отбить будет нарушением
g1b.attack('x1', 1); // Xenia кидает 8♦, у неё остаётся 9♦ — есть чем заплатить штраф
const yanHandBeforeViolation = yan.hand.length;
const r1b = g1b.defend('x2', 0, 0);
console.assert(r1b.ok === false && r1b.penalty === true, 'слабая карта — нарушение');
console.assert(yan.hand.length === yanHandBeforeViolation + 1, 'Yan сразу поднимает подкинутую карту со стола (8♦)');
console.assert(g1b.table.length === 0, 'стол должен опустеть после того, как нарушитель забрал карты');

// ---- Правило "последней карты": не объявил — все отдают по карте ----
const g3 = new Game('TEST3');
g3.addPlayer('m1', 'Mila');
g3.addPlayer('m2', 'Nick');
g3.addPlayer('m3', 'Olga');
g3.start();
const mila = g3.getPlayer('m1');
const nick = g3.getPlayer('m2');
const olga = g3.getPlayer('m3');
nick.hand = [{ suit: 'H', rank: 8 }]; // у Ника осталась 1 карта, он не объявил
g3.syncAllLowCardStates();
console.assert(nick.lowCardAnnounced === false, 'Ник ещё не объявил про 1 карту');
const rCatch = g3.callOutLowCards('m3', 'm2');
console.assert(rCatch.ok && rCatch.caught, 'Ольга должна успешно поймать Ника');
console.assert(g3.pendingPenalty && g3.pendingPenalty.violatorId === 'm2', 'штраф навешивается на Ника');
console.assert(g3.pendingPenalty.endsRound === false, 'штраф за молчание не должен завершать раунд');
const nickHandBeforeDebt = nick.hand.length;
g3.givePenaltyCard('m1', 0);
g3.givePenaltyCard('m3', 0);
console.assert(nick.hand.length === nickHandBeforeDebt + 2, 'Ник получил по карте от каждого из двух других игроков');
console.assert(g3.pendingPenalty === null, 'штраф закрылся, как только все отдали карты');

// объявивший вовремя игрок не должен ловиться
const g4 = new Game('TEST4');
g4.addPlayer('q1', 'Quin');
g4.addPlayer('q2', 'Rita');
g4.start();
const quin = g4.getPlayer('q1');
quin.hand = [{ suit: 'H', rank: 7 }, { suit: 'H', rank: 6 }];
g4.syncAllLowCardStates();
console.assert(g4.declareLowCards('q1').ok, 'Квин объявляет про 2 карты');
const rMiss = g4.callOutLowCards('q2', 'q1');
console.assert(rMiss.ok === false, 'Рита не должна поймать того, кто уже объявил');

// ---- Перевод несколько раз подряд + финальный отбой дамой ----
const g5 = new Game('TEST5');
g5.addPlayer('s1', 'Sam');
g5.addPlayer('s2', 'Tom');
g5.addPlayer('s3', 'Uma');
g5.start();
const sam = g5.getPlayer('s1');
const tom = g5.getPlayer('s2');
const uma = g5.getPlayer('s3');
g5.deck = [{ suit: 'H', rank: 6 }]; // непустая колода, чтобы никто не вышел раньше времени
sam.hand = [{ suit: 'H', rank: 9 }, { suit: 'D', rank: 7 }, { suit: 'S', rank: 12 }];
tom.hand = [{ suit: 'H', rank: 9 }, { suit: 'C', rank: 7 }];
uma.hand = [{ suit: 'H', rank: 9 }, { suit: 'S', rank: 7 }, { suit: 'S', rank: 12 }];
g5.attackerIdx = 0; g5.defenderIdx = 1; g5.table = []; g5.translateChain = [];
g5.attack('s1', 1); // Sam кидает 7♦
g5.translate('s2', 1); // Tom переводит 7♣
g5.translate('s3', 1); // Uma переводит 7♠ (7♦ и 7♣ ей же придётся забрать, если Sam отобьётся дамой)
const attackTableIdxSpade = g5.table.findIndex(t => t.attack.suit === 'S' && t.attack.rank === 7);
const queenIdx = sam.hand.findIndex(c => c.suit === 'S' && c.rank === 12);
const rQueen = g5.defend('s1', attackTableIdxSpade, queenIdx);
console.assert(rQueen.ok, 'Sam легально отбивается дамой пик');
console.assert(g5.table.length === 1, 'на столе должна остаться только закрытая пара с дамой');
console.assert(uma.hand.some(c => c.suit === 'D' && c.rank === 7) && uma.hand.some(c => c.suit === 'C' && c.rank === 7),
  'Uma (последняя переводившая) должна забрать 7♦ и 7♣ со стола');

// ---- Перевод карты вдвоём ----
const g2 = new Game('TEST2');
g2.addPlayer('a1', 'Anna');
g2.addPlayer('a2', 'Boris');
g2.start();
const anna = g2.getPlayer('a1');
const boris = g2.getPlayer('a2');
g2.attackerIdx = g2.players.findIndex(p => p.id === 'a1');
g2.defenderIdx = g2.players.findIndex(p => p.id === 'a2');
anna.hand = [{ suit: 'D', rank: 8 }];
boris.hand = [{ suit: 'D', rank: 10 }]; // тот же ранг 8? нет — поправим ниже
anna.hand = [{ suit: 'D', rank: 8 }];
boris.hand = [{ suit: 'C', rank: 8 }, { suit: 'H', rank: 6 }];
r = g2.attack('a1', 0);
console.assert(r.ok, 'Anna атакует восьмёркой');
r = g2.translate('a2', 0);
console.assert(r.ok && r.translated, 'Boris должен суметь перевести карту вдвоём');
console.assert(g2.defenderIdx === g2.players.findIndex(p => p.id === 'a1'), 'после перевода вдвоём защитником снова становится Anna');
console.assert(g2.attackerIdx === g2.players.findIndex(p => p.id === 'a2'), 'атакующим становится Boris (тот, кто перевёл)');

console.log('Все проверки пройдены ✅');
