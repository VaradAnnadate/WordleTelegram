import { isValidGuess, isValidAnswer, evaluateGuess, isWinningGuess } from './wordValidator.js';

const MAX_GUESSES = 6;
// Default 3 minutes (180,000 ms), fully configurable via environment variable
const DEFAULT_GAME_TIME_LIMIT = process.env.GAME_TIME_LIMIT_SECONDS
  ? parseInt(process.env.GAME_TIME_LIMIT_SECONDS, 10) * 1000
  : (process.env.GAME_TIME_LIMIT_MS ? parseInt(process.env.GAME_TIME_LIMIT_MS, 10) : 180_000);
const WORD_SELECTION_TIME = process.env.WORD_SELECTION_TIME_MS
  ? parseInt(process.env.WORD_SELECTION_TIME_MS, 10)
  : 60_000;    // 60 seconds for word selection

/**
 * Room states:
 *   WAITING        - Room created, waiting for Player 2
 *   WORD_SELECTION  - Both players picking challenge words
 *   PLAYING         - Active Wordle game
 *   FINISHED        - Game over
 */
const STATES = {
  WAITING: 'WAITING',
  WORD_SELECTION: 'WORD_SELECTION',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
};

export default class Room {
  constructor(id, creatorId, creatorName, options = {}) {
    this.id = id;
    this.state = STATES.WAITING;
    this.createdAt = Date.now();
    this.gameTimeLimit = options.gameTimeLimit || DEFAULT_GAME_TIME_LIMIT;

    // Players keyed by their ID
    this.players = new Map();
    this.playerOrder = []; // [player1Id, player2Id]

    // Game state per player
    this.words = {};      // { playerId: word they chose for opponent }
    this.boards = {};     // { playerId: [ [tiles], [tiles], ... ] }
    this.guessCount = {}; // { playerId: number }
    this.solved = {};     // { playerId: boolean }
    this.solveTime = {};  // { playerId: timestamp | null }

    // Rematch tracking
    this.rematchRequests = new Set();

    // Add creator
    this._addPlayer(creatorId, creatorName);

    // Timers
    this.wordSelectionTimer = null;
    this.gameTimer = null;
    this.gameStartTime = null;
    this.gameEndTime = null;

    // Callbacks
    this.onBroadcast = null;   // (playerId, message) => void
    this.onRoomFinished = null; // (roomId) => void
    this.onRematchReady = null; // (roomId, players) => void
  }

  _addPlayer(id, name) {
    this.players.set(id, {
      id,
      name: name || `Player ${this.players.size + 1}`,
      ws: null,
      connected: false,
    });
    this.playerOrder.push(id);
    this.boards[id] = [];
    this.guessCount[id] = 0;
    this.solved[id] = false;
    this.solveTime[id] = null;
  }

  getOpponentId(playerId) {
    return this.playerOrder.find(id => id !== playerId);
  }

  setWebSocket(playerId, ws) {
    const player = this.players.get(playerId);
    if (player) {
      player.ws = ws;
      player.connected = true;
    }
  }

  send(playerId, message) {
    const player = this.players.get(playerId);
    if (player?.ws?.readyState === 1) { // WebSocket.OPEN
      player.ws.send(JSON.stringify(message));
    }
  }

  broadcast(message, excludeId = null) {
    for (const [id] of this.players) {
      if (id !== excludeId) {
        this.send(id, message);
      }
    }
  }

  broadcastAll(message) {
    for (const [id] of this.players) {
      this.send(id, message);
    }
  }

  // ─── Join ────────────────────────────────────────────
  join(playerId, playerName) {
    if (this.state !== STATES.WAITING) {
      return { error: 'Room is not accepting players' };
    }
    if (this.players.size >= 2) {
      return { error: 'Room is full' };
    }
    if (this.players.has(playerId)) {
      return { error: 'Already in room' };
    }

    this._addPlayer(playerId, playerName);

    // Notify existing player
    const creatorId = this.playerOrder[0];
    this.send(creatorId, {
      type: 'player_joined',
      opponentName: playerName,
    });

    // Transition to word selection
    this.state = STATES.WORD_SELECTION;
    this._startWordSelectionTimer();

    return {
      success: true,
      opponentName: this.players.get(creatorId).name,
    };
  }

  // ─── Reconnect ───────────────────────────────────────
  reconnect(playerId, ws) {
    if (!this.players.has(playerId)) return { error: 'Not in this room' };

    const player = this.players.get(playerId);

    // Clear disconnect timeout if exists
    if (player.disconnectTimeout) {
      clearTimeout(player.disconnectTimeout);
      player.disconnectTimeout = null;
    }

    this.setWebSocket(playerId, ws);

    // Send current state to reconnecting player
    const opponentId = this.getOpponentId(playerId);
    const stateMsg = {
      type: 'room_state',
      roomId: this.id,
      state: this.state,
      opponentName: opponentId ? this.players.get(opponentId)?.name : null,
      board: this.boards[playerId] || [],
      guessCount: this.guessCount[playerId] || 0,
      opponentGuessCount: opponentId ? (this.guessCount[opponentId] || 0) : 0,
      timeRemaining: this.gameEndTime ? Math.max(0, this.gameEndTime - Date.now()) : null,
      wordSelected: !!this.words[playerId],
      opponentReady: opponentId ? !!this.words[opponentId] : false,
    };

    this.send(playerId, stateMsg);

    // Notify opponent that player reconnected
    if (opponentId) {
      this.send(opponentId, {
        type: 'opponent_reconnected',
        message: 'Opponent reconnected!',
      });
    }

    return { success: true };
  }

  // ─── Word Selection ──────────────────────────────────
  selectWord(playerId, word) {
    if (this.state !== STATES.WORD_SELECTION) {
      return { error: 'Not in word selection phase' };
    }
    if (!this.players.has(playerId)) {
      return { error: 'Not in this room' };
    }

    const normalized = word.toLowerCase().trim();
    if (!isValidGuess(normalized)) {
      return { error: 'Not a valid 5-letter word' };
    }

    this.words[playerId] = normalized;

    // Notify opponent
    const opponentId = this.getOpponentId(playerId);
    if (opponentId) {
      this.send(opponentId, { type: 'opponent_ready' });
    }

    // Check if both players selected
    if (this.words[this.playerOrder[0]] && this.words[this.playerOrder[1]]) {
      this._startGame();
    }

    return { success: true };
  }

  _startWordSelectionTimer() {
    this.wordSelectionTimer = setTimeout(() => {
      if (this.state === STATES.WORD_SELECTION) {
        // If neither selected, cancel the game
        const p1Selected = !!this.words[this.playerOrder[0]];
        const p2Selected = !!this.words[this.playerOrder[1]];

        if (!p1Selected && !p2Selected) {
          this._finishGame(null, 'Both players failed to select a word');
        } else if (!p1Selected) {
          this._finishGame(this.playerOrder[1], 'Opponent failed to select a word');
        } else if (!p2Selected) {
          this._finishGame(this.playerOrder[0], 'Opponent failed to select a word');
        }
      }
    }, WORD_SELECTION_TIME);
  }

  // ─── Game Play ───────────────────────────────────────
  _startGame() {
    if (this.wordSelectionTimer) {
      clearTimeout(this.wordSelectionTimer);
      this.wordSelectionTimer = null;
    }

    this.state = STATES.PLAYING;
    this.gameStartTime = Date.now();
    this.gameEndTime = this.gameStartTime + this.gameTimeLimit;

    // Each player gets the word chosen BY their opponent
    this.broadcastAll({
      type: 'game_start',
      timeLimit: this.gameTimeLimit,
    });

    // Start game timer
    this.gameTimer = setTimeout(() => {
      this._onTimeUp();
    }, this.gameTimeLimit);
  }

  submitGuess(playerId, word) {
    if (this.state !== STATES.PLAYING) {
      return { error: 'Game is not active' };
    }
    if (!this.players.has(playerId)) {
      return { error: 'Not in this room' };
    }
    const player = this.players.get(playerId);
    if (!player.connected) {
      return { error: 'You are disconnected. Please refresh to reconnect.' };
    }
    if (this.solved[playerId]) {
      return { error: 'Already solved' };
    }
    if (this.guessCount[playerId] >= MAX_GUESSES) {
      return { error: 'No guesses remaining' };
    }

    const normalized = word.toLowerCase().trim();
    if (!isValidGuess(normalized)) {
      this.send(playerId, {
        type: 'guess_result',
        valid: false,
        error: 'Not a valid word',
      });
      return { error: 'Invalid word' };
    }

    // The answer for this player is the word chosen by their opponent
    const opponentId = this.getOpponentId(playerId);
    const answer = this.words[opponentId];

    const tiles = evaluateGuess(normalized, answer);
    const won = isWinningGuess(tiles);

    this.boards[playerId].push(tiles);
    this.guessCount[playerId]++;

    if (won) {
      this.solved[playerId] = true;
      this.solveTime[playerId] = Date.now();
    }

    // Send result to the guesser
    this.send(playerId, {
      type: 'guess_result',
      valid: true,
      row: this.guessCount[playerId] - 1,
      tiles,
      guessCount: this.guessCount[playerId],
      solved: won,
    });

    // Notify opponent of progress (don't reveal the actual guess)
    this.send(opponentId, {
      type: 'opponent_progress',
      guessCount: this.guessCount[playerId],
      solved: won,
    });

    // Check game end conditions
    this._checkGameEnd();

    return { success: true };
  }

  _checkGameEnd() {
    const [p1, p2] = this.playerOrder;
    const p1Solved = this.solved[p1];
    const p2Solved = this.solved[p2];
    const p1Exhausted = this.guessCount[p1] >= MAX_GUESSES;
    const p2Exhausted = this.guessCount[p2] >= MAX_GUESSES;

    // Case 1: Both solved - faster solver wins
    if (p1Solved && p2Solved) {
      if (this.solveTime[p1] <= this.solveTime[p2]) {
        this._finishGame(p1, 'Solved first!');
      } else {
        this._finishGame(p2, 'Solved first!');
      }
      return;
    }

    // Case 2: One solved, other exhausted
    if (p1Solved && p2Exhausted) {
      this._finishGame(p1, 'Guessed the word!');
      return;
    }
    if (p2Solved && p1Exhausted) {
      this._finishGame(p2, 'Guessed the word!');
      return;
    }

    // Case 3: Both exhausted - draw
    if (p1Exhausted && p2Exhausted) {
      this._finishGame(null, 'Both players ran out of guesses');
      return;
    }

    // Case 4: One solved, other still playing — 
    // the solver wins immediately
    if (p1Solved && !p2Solved) {
      this._finishGame(p1, 'Guessed the word!');
      return;
    }
    if (p2Solved && !p1Solved) {
      this._finishGame(p2, 'Guessed the word!');
      return;
    }
  }

  _onTimeUp() {
    if (this.state !== STATES.PLAYING) return;

    const [p1, p2] = this.playerOrder;
    const p1Solved = this.solved[p1];
    const p2Solved = this.solved[p2];

    if (p1Solved && !p2Solved) {
      this._finishGame(p1, 'Time\'s up! Solved the word.');
    } else if (p2Solved && !p1Solved) {
      this._finishGame(p2, 'Time\'s up! Solved the word.');
    } else if (p1Solved && p2Solved) {
      // Both solved before time up - faster wins
      if (this.solveTime[p1] <= this.solveTime[p2]) {
        this._finishGame(p1, 'Both solved, but faster!');
      } else {
        this._finishGame(p2, 'Both solved, but faster!');
      }
    } else {
      this._finishGame(null, 'Time\'s up! Neither player guessed the word.');
    }
  }

  _finishGame(winnerId, reason) {
    if (this.state === STATES.FINISHED) return;

    this.state = STATES.FINISHED;

    if (this.gameTimer) {
      clearTimeout(this.gameTimer);
      this.gameTimer = null;
    }
    if (this.wordSelectionTimer) {
      clearTimeout(this.wordSelectionTimer);
      this.wordSelectionTimer = null;
    }

    const [p1, p2] = this.playerOrder;

    // Send game_over to each player
    for (const playerId of this.playerOrder) {
      const opponentId = this.getOpponentId(playerId);

      let result;
      if (winnerId === null) {
        result = 'draw';
      } else if (winnerId === playerId) {
        result = 'win';
      } else {
        result = 'lose';
      }

      this.send(playerId, {
        type: 'game_over',
        result,
        reason,
        winnerName: winnerId ? this.players.get(winnerId)?.name : null,
        yourWord: this.words[playerId] || null,          // word you chose
        opponentWord: this.words[opponentId] || null,    // word you were guessing
        yourBoard: this.boards[playerId],
        opponentBoard: this.boards[opponentId],
        yourGuesses: this.guessCount[playerId],
        opponentGuesses: this.guessCount[opponentId],
      });
    }

    if (this.onRoomFinished) {
      this.onRoomFinished(this.id);
    }
  }

  // ─── Disconnect ──────────────────────────────────────
  handleDisconnect(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
      player.ws = null;
    }

    if (this.state === STATES.PLAYING || this.state === STATES.WORD_SELECTION) {
      // Give 60 seconds to reconnect (increased from 30)
      const disconnectTimeout = setTimeout(() => {
        const p = this.players.get(playerId);
        if (p && !p.connected && this.state !== STATES.FINISHED) {
          const opponentId = this.getOpponentId(playerId);
          this._finishGame(opponentId, 'Opponent disconnected');
        }
      }, 60_000);

      // Store timeout so we can clear it on reconnection
      player.disconnectTimeout = disconnectTimeout;

      // Notify opponent
      const opponentId = this.getOpponentId(playerId);
      if (opponentId) {
        this.send(opponentId, {
          type: 'opponent_disconnected',
          message: 'Opponent disconnected. You can continue playing while waiting for reconnection (60s).',
        });
      }
    }
  }

  // ─── Rematch ─────────────────────────────────────────
  requestRematch(playerId) {
    if (this.state !== STATES.FINISHED) {
      return { error: 'Game not finished' };
    }
    if (!this.players.has(playerId)) {
      return { error: 'Not in this room' };
    }
    if (this.rematchRequests.has(playerId)) {
      return { error: 'Already requested rematch' };
    }

    this.rematchRequests.add(playerId);

    // Notify other player
    const opponentId = this.getOpponentId(playerId);
    if (opponentId) {
      this.send(opponentId, {
        type: 'opponent_requested_rematch',
      });
    }

    // Check if both players requested rematch
    if (this.rematchRequests.size === 2) {
      this._startRematch();
    }

    return { success: true };
  }

  _startRematch() {
    // Reset game state
    this.state = STATES.WORD_SELECTION;
    this.words = {};
    this.boards = {};
    this.guessCount = {};
    this.solved = {};
    this.solveTime = {};
    this.rematchRequests.clear();

    // Reset per-player state
    for (const playerId of this.playerOrder) {
      this.boards[playerId] = [];
      this.guessCount[playerId] = 0;
      this.solved[playerId] = false;
      this.solveTime[playerId] = null;
    }

    // Notify both players
    this.broadcastAll({
      type: 'rematch_start',
    });

    // Start word selection timer
    this._startWordSelectionTimer();

    console.log(`[Room] Rematch started in room ${this.id}`);
  }

  // ─── Cleanup ─────────────────────────────────────────
  cleanup() {
    if (this.gameTimer) clearTimeout(this.gameTimer);
    if (this.wordSelectionTimer) clearTimeout(this.wordSelectionTimer);
    for (const [, player] of this.players) {
      if (player.ws) {
        try { player.ws.close(); } catch(e) {}
      }
    }
  }

  toJSON() {
    return {
      id: this.id,
      state: this.state,
      playerCount: this.players.size,
      createdAt: this.createdAt,
    };
  }
}
