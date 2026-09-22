import WebSocket from 'ws';
import { createServer } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import RoomManager from './game/RoomManager.js';

async function runTest() {
  console.log('🧪 Starting Wordle Duel End-to-End Test...\n');

  // Setup test server
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const roomManager = new RoomManager();

  wss.on('connection', (ws) => {
    let playerId = null;
    let playerName = null;
    let currentRoom = null;

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'auth') {
        playerId = msg.playerId;
        playerName = msg.playerName;
        ws.send(JSON.stringify({ type: 'auth_ok', playerId, playerName }));
      } else if (msg.type === 'create_room') {
        currentRoom = roomManager.createRoom(playerId, playerName);
        currentRoom.setWebSocket(playerId, ws);
        ws.send(JSON.stringify({ type: 'room_created', roomId: currentRoom.id }));
      } else if (msg.type === 'join_room') {
        const result = roomManager.joinRoom(msg.roomId, playerId, playerName);
        if (result.error) return ws.send(JSON.stringify({ type: 'error', error: result.error }));
        currentRoom = result.room;
        currentRoom.setWebSocket(playerId, ws);
        ws.send(JSON.stringify({ type: 'room_joined', roomId: msg.roomId, opponentName: result.opponentName }));
        currentRoom.broadcastAll({ type: 'word_selection_start', timeLimit: 60000 });
      } else if (msg.type === 'select_word') {
        const result = currentRoom.selectWord(playerId, msg.word);
        if (result.error) return ws.send(JSON.stringify({ type: 'error', error: result.error }));
        ws.send(JSON.stringify({ type: 'word_accepted' }));
      } else if (msg.type === 'guess') {
        currentRoom.submitGuess(playerId, msg.word);
      }
    });
  });

  await new Promise(r => server.listen(3999, r));
  console.log('✓ Test server listening on :3999');

  function createClient(id, name) {
    const ws = new WebSocket('ws://localhost:3999/ws');
    const messages = [];
    const listeners = new Map();

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      const cb = listeners.get(msg.type);
      if (cb) cb(msg);
    });

    const send = (type, data = {}) => ws.send(JSON.stringify({ type, ...data }));
    const waitFor = (type) => new Promise(resolve => {
      const idx = messages.findIndex(m => m.type === type);
      if (idx !== -1) {
        const msg = messages.splice(idx, 1)[0];
        return resolve(msg);
      }
      listeners.set(type, (msg) => {
        listeners.delete(type);
        resolve(msg);
      });
    });

    return { ws, send, waitFor, messages };
  }

  const p1 = createClient('p1', 'Alice');
  const p2 = createClient('p2', 'Bob');

  await new Promise(r => p1.ws.on('open', r));
  await new Promise(r => p2.ws.on('open', r));
  console.log('✓ Both players connected via WebSocket');

  // Auth
  p1.send('auth', { playerId: 'p1', playerName: 'Alice' });
  await p1.waitFor('auth_ok');
  p2.send('auth', { playerId: 'p2', playerName: 'Bob' });
  await p2.waitFor('auth_ok');
  console.log('✓ Both players authenticated');

  // P1 creates room
  p1.send('create_room');
  const roomMsg = await p1.waitFor('room_created');
  const roomId = roomMsg.roomId;
  console.log(`✓ Room created: ${roomId}`);

  // P2 joins room
  p2.send('join_room', { roomId });
  await Promise.all([
    p2.waitFor('room_joined'),
    p1.waitFor('word_selection_start'),
    p2.waitFor('word_selection_start'),
  ]);
  console.log('✓ P2 joined, word selection phase started');

  // Both pick words:
  // Alice picks "react" for Bob to guess
  // Bob picks "crane" for Alice to guess
  p1.send('select_word', { word: 'react' });
  await p1.waitFor('word_accepted');
  console.log('✓ Alice chose word "react"');

  p2.send('select_word', { word: 'crane' });
  await p2.waitFor('word_accepted');
  console.log('✓ Bob chose word "crane"');

  // Game start
  await Promise.all([
    p1.waitFor('game_start'),
    p2.waitFor('game_start'),
  ]);
  console.log('✓ Game started with 3-minute timer!');

  // Alice makes a guess: "stare" against Bob's "crane"
  p1.send('guess', { word: 'stare' });
  const guessResult = await p1.waitFor('guess_result');
  console.log('✓ Alice guessed "stare", result:', guessResult.tiles.map(t => `${t.letter}:${t.status}`).join(' '));

  // Alice makes winning guess: "crane"
  p1.send('guess', { word: 'crane' });
  const [p1GameOver, p2GameOver] = await Promise.all([
    p1.waitFor('game_over'),
    p2.waitFor('game_over'),
  ]);

  console.log('✓ Alice received game_over:', p1GameOver.result); // should be 'win'
  console.log('✓ Bob received game_over:', p2GameOver.result);     // should be 'lose'

  if (p1GameOver.result === 'win' && p2GameOver.result === 'lose') {
    console.log('\n🎉 ALL TESTS PASSED! Game logic and multiplayer WebSocket flow 100% verified!\n');
  } else {
    throw new Error('Test failed: unexpected game outcomes');
  }

  p1.ws.close();
  p2.ws.close();
  wss.close();
  server.close();
  roomManager.destroy();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
