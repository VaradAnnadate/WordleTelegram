import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import RoomManager from './game/RoomManager.js';
import TelegramBot from './bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : `http://localhost:${PORT}`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ─── Express App ───────────────────────────────────────
const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// Serve static client build in production
app.use(express.static(join(__dirname, '../client/dist')));

const server = createServer(app);

// ─── Room Manager ──────────────────────────────────────
const roomManager = new RoomManager();

// ─── Health Check ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: roomManager.getStats() });
});

// ─── WebSocket Server ──────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  let playerId = null;
  let playerName = null;
  let currentRoom = null;

  console.log('[WS] New connection');

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    console.log(`[WS] Disconnected: ${playerId}`);
    if (currentRoom && playerId) {
      currentRoom.handleDisconnect(playerId);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${playerId}:`, err.message);
  });

  function sendMsg(message) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  function handleMessage(ws, msg) {
    switch (msg.type) {
      case 'auth': {
        // Simple auth — in production, validate Telegram initData here
        playerId = msg.playerId || `player_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        playerName = msg.playerName || 'Anonymous';
        console.log(`[WS] Authenticated: ${playerName} (${playerId})`);
        sendMsg({ type: 'auth_ok', playerId, playerName });
        break;
      }

      case 'create_room': {
        if (!playerId) {
          sendMsg({ type: 'error', error: 'Not authenticated' });
          return;
        }
        currentRoom = roomManager.createRoom(playerId, playerName, msg.options || {});
        currentRoom.setWebSocket(playerId, ws);
        console.log(`[Room] Created: ${currentRoom.id} by ${playerName}`);
        sendMsg({
          type: 'room_created',
          roomId: currentRoom.id,
        });
        break;
      }

      case 'join_room': {
        if (!playerId) {
          sendMsg({ type: 'error', error: 'Not authenticated' });
          return;
        }
        const { roomId } = msg;
        if (!roomId) {
          sendMsg({ type: 'error', error: 'Room ID required' });
          return;
        }

        const result = roomManager.joinRoom(roomId, playerId, playerName);
        if (result.error) {
          sendMsg({ type: 'error', error: result.error });
          return;
        }

        currentRoom = result.room;
        currentRoom.setWebSocket(playerId, ws);
        console.log(`[Room] ${playerName} joined ${roomId}`);

        sendMsg({
          type: 'room_joined',
          roomId,
          opponentName: result.opponentName,
        });

        // Both players now get word_selection_start
        currentRoom.broadcastAll({
          type: 'word_selection_start',
          timeLimit: 60000,
        });
        break;
      }

      case 'select_word': {
        if (!currentRoom || !playerId) {
          sendMsg({ type: 'error', error: 'Not in a room' });
          return;
        }
        const result = currentRoom.selectWord(playerId, msg.word);
        if (result.error) {
          sendMsg({ type: 'error', error: result.error });
          return;
        }
        sendMsg({ type: 'word_accepted' });
        break;
      }

      case 'guess': {
        if (!currentRoom || !playerId) {
          sendMsg({ type: 'error', error: 'Not in a room' });
          return;
        }
        const result = currentRoom.submitGuess(playerId, msg.word);
        if (result.error && result.error !== 'Invalid word') {
          sendMsg({ type: 'error', error: result.error });
        }
        break;
      }

      case 'ping': {
        sendMsg({ type: 'pong' });
        break;
      }

      default:
        sendMsg({ type: 'error', error: `Unknown message type: ${msg.type}` });
    }
  }
});

// ─── Heartbeat Interval ────────────────────────────────
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

// ─── SPA Fallback ──────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

// ─── Telegram Bot (Optional) ─────────────────────────
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, WEBAPP_URL);

// ─── Start ─────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🟩 Wordle Duel server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   WS:     ws://localhost:${PORT}/ws\n`);
  bot.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  bot.stop();
  roomManager.destroy();
  wss.close();
  server.close();
  process.exit(0);
});
