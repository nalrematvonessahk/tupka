'use strict';
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Game } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map(); // code -> Game

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcastState(room) {
  const game = rooms.get(room);
  if (!game) return;
  for (const p of game.players) {
    io.to(p.id).emit('state', game.serializeFor(p.id));
  }
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('createRoom', ({ name }, cb) => {
    try {
      const code = genCode();
      const game = new Game(code);
      game.addPlayer(socket.id, (name || 'Игрок').trim().slice(0, 20));
      rooms.set(code, game);
      currentRoom = code;
      socket.join(code);
      cb({ ok: true, roomCode: code });
      broadcastState(code);
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  socket.on('joinRoom', ({ name, roomCode }, cb) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const game = rooms.get(code);
      if (!game) return cb({ ok: false, error: 'Комната не найдена' });
      game.addPlayer(socket.id, (name || 'Игрок').trim().slice(0, 20));
      currentRoom = code;
      socket.join(code);
      cb({ ok: true, roomCode: code });
      broadcastState(code);
    } catch (e) {
      cb({ ok: false, error: e.message });
    }
  });

  socket.on('startGame', (_, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return cb && cb({ ok: false, error: 'Нет комнаты' });
    try {
      game.start();
      cb && cb({ ok: true });
      broadcastState(currentRoom);
    } catch (e) {
      cb && cb({ ok: false, error: e.message });
    }
  });

  socket.on('attack', ({ cardIdx }, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return;
    const res = game.attack(socket.id, cardIdx);
    cb && cb(res);
    broadcastState(currentRoom);
  });

  socket.on('defend', ({ attackIdx, cardIdx }, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return;
    const res = game.defend(socket.id, attackIdx, cardIdx);
    cb && cb(res);
    broadcastState(currentRoom);
  });

  socket.on('translate', ({ cardIdx }, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return;
    const res = game.translate(socket.id, cardIdx);
    cb && cb(res);
    broadcastState(currentRoom);
  });

  socket.on('take', (_, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return;
    const res = game.take(socket.id);
    cb && cb(res);
    broadcastState(currentRoom);
  });

  socket.on('givePenaltyCard', ({ cardIdx }, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return;
    const res = game.givePenaltyCard(socket.id, cardIdx);
    cb && cb(res);
    broadcastState(currentRoom);
  });

  socket.on('done', (_, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return;
    const res = game.done(socket.id);
    cb && cb(res);
    broadcastState(currentRoom);
  });

  socket.on('declareLowCards', (_, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return;
    const res = game.declareLowCards(socket.id);
    cb && cb(res);
    broadcastState(currentRoom);
  });

  socket.on('callOutLowCards', ({ targetId }, cb) => {
    const game = rooms.get(currentRoom);
    if (!game) return;
    const res = game.callOutLowCards(socket.id, targetId);
    cb && cb(res);
    broadcastState(currentRoom);
  });

  socket.on('disconnect', () => {
    const game = rooms.get(currentRoom);
    if (game) {
      game.removePlayerBySocket(socket.id);
      broadcastState(currentRoom);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Тупка-сервер запущен на порту ${PORT}`));
