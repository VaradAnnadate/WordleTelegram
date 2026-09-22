/**
 * Main App Orchestrator — Telegram Mini App for Wordle Duel
 *
 * Manages screen transitions, WebSocket events, and Telegram SDK integration.
 */
import GameSocket from './websocket.js';
import LobbyScreen from './screens/LobbyScreen.js';
import WordSelectionScreen from './screens/WordSelectionScreen.js';
import GameScreen from './screens/GameScreen.js';
import ResultScreen from './screens/ResultScreen.js';

class App {
  constructor() {
    this.socket = new GameSocket();
    this.playerId = null;
    this.playerName = null;
    this.opponentName = null;
    this.currentScreen = null;
    this.screens = {};
    this.roomId = null;

    // Telegram SDK
    this.tg = window.Telegram?.WebApp;
  }

  async init() {
    // Initialize Telegram WebApp
    if (this.tg) {
      this.tg.ready();
      this.tg.expand();

      // Apply Telegram theme
      document.documentElement.style.setProperty('--tg-theme-bg-color', this.tg.themeParams?.bg_color || '');
      document.documentElement.style.setProperty('--tg-theme-text-color', this.tg.themeParams?.text_color || '');
      document.documentElement.style.setProperty('--tg-theme-hint-color', this.tg.themeParams?.hint_color || '');
      document.documentElement.style.setProperty('--tg-theme-button-color', this.tg.themeParams?.button_color || '');
      document.documentElement.style.setProperty('--tg-theme-button-text-color', this.tg.themeParams?.button_text_color || '');
      document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', this.tg.themeParams?.secondary_bg_color || '');

      // Get user info
      const user = this.tg.initDataUnsafe?.user;
      if (user) {
        this.playerName = user.first_name || user.username || 'Player';
        this.playerId = `tg_${user.id}`;
      }
    }

    // Fallback for non-Telegram environments (development)
    if (!this.playerId) {
      this.playerId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      this.playerName = 'Player';
    }

    // Connect WebSocket
    try {
      await this.socket.connect();
      this._updateLoadingText('Connected! Authenticating...');
    } catch (err) {
      console.error('Failed to connect:', err);
      this._updateLoadingText('Connection failed. Tap to retry.');
      document.getElementById('loading-screen').addEventListener('click', () => {
        this._updateLoadingText('Reconnecting...');
        this.init();
      }, { once: true });
      return;
    }

    // Authenticate
    this.socket.send('auth', {
      playerId: this.playerId,
      playerName: this.playerName,
    });

    // Bind events
    this._bindSocketEvents();

    // Wait for auth confirmation then show lobby
    this.socket.on('auth_ok', (data) => {
      this.playerId = data.playerId;
      this.playerName = data.playerName;

      // Check for deep link (startapp parameter)
      const startParam = this.tg?.initDataUnsafe?.start_param;
      const urlParams = new URLSearchParams(window.location.search);
      const roomFromUrl = urlParams.get('room') || startParam;

      this._showLobby();

      if (roomFromUrl) {
        // Auto-join room from invite link
        setTimeout(() => {
          this.screens.lobby.autoJoin(roomFromUrl);
        }, 300);
      }
    });
  }

  // ─── Screen Management ───────────────────────────────
  _showScreen(name, element) {
    const app = document.getElementById('app');

    // Deactivate current screen
    const activeScreen = app.querySelector('.screen.active');
    if (activeScreen) {
      activeScreen.classList.remove('active');
      activeScreen.classList.add('exit');
      setTimeout(() => {
        if (activeScreen.parentNode === app) {
          activeScreen.remove();
        }
      }, 400);
    }

    // Activate new screen
    element.classList.remove('exit');
    app.appendChild(element);

    // Force reflow for animation
    void element.offsetWidth;
    element.classList.add('active');

    this.currentScreen = name;
  }

  _showLobby() {
    // Clean up previous screen instances
    this._cleanupScreen('wordSelection');
    this._cleanupScreen('game');

    const lobby = new LobbyScreen(this);
    this.screens.lobby = lobby;
    this._showScreen('lobby', lobby.render());
  }

  _showWordSelection() {
    this._cleanupScreen('wordSelection');

    const ws = new WordSelectionScreen(this);
    this.screens.wordSelection = ws;
    this._showScreen('wordSelection', ws.render());
    ws.startTimer(60000);
  }

  _showGame(timeLimit) {
    this._cleanupScreen('wordSelection');
    this._cleanupScreen('game');

    const game = new GameScreen(this);
    this.screens.game = game;
    this._showScreen('game', game.render());

    // Init after DOM insertion
    requestAnimationFrame(() => {
      game.init(this.opponentName, timeLimit);
    });
  }

  _showResult(data) {
    this._cleanupScreen('game');

    const result = new ResultScreen(this);
    this.screens.result = result;
    this._showScreen('result', result.render(data));
  }

  _cleanupScreen(name) {
    const screen = this.screens[name];
    if (screen?.destroy) {
      screen.destroy();
    }
    this.screens[name] = null;
  }

  // ─── Socket Events ──────────────────────────────────
  _bindSocketEvents() {
    // Room created → show waiting overlay
    this.socket.on('room_created', (data) => {
      this.roomId = data.roomId;
      if (this.screens.lobby) {
        this.screens.lobby.showWaiting(data.roomId);
      }
    });

    // Joined a room
    this.socket.on('room_joined', (data) => {
      this.roomId = data.roomId;
      this.opponentName = data.opponentName;
      // Word selection starts via word_selection_start event
    });

    // Player joined our room
    this.socket.on('player_joined', (data) => {
      this.opponentName = data.opponentName;
      if (this.screens.lobby) {
        this.screens.lobby.hideWaiting();
      }
      this.showToast(`${data.opponentName} joined!`);
      // Word selection starts via word_selection_start event
    });

    // Word selection phase starts
    this.socket.on('word_selection_start', (data) => {
      this._showWordSelection();
    });

    // Word accepted by server
    this.socket.on('word_accepted', () => {
      if (this.screens.wordSelection) {
        this.screens.wordSelection.onWordAccepted();
      }
    });

    // Opponent selected their word
    this.socket.on('opponent_ready', () => {
      if (this.screens.wordSelection) {
        this.screens.wordSelection.onOpponentReady();
      }
    });

    // Game starts!
    this.socket.on('game_start', (data) => {
      this._showGame(data.timeLimit);
    });

    // Guess result
    this.socket.on('guess_result', (data) => {
      if (this.screens.game) {
        this.screens.game.onGuessResult(data);
      }
    });

    // Opponent progress
    this.socket.on('opponent_progress', (data) => {
      if (this.screens.game) {
        this.screens.game.onOpponentProgress(data);
      }
    });

    // Opponent disconnected
    this.socket.on('opponent_disconnected', (data) => {
      this.showToast(data.message || 'Opponent disconnected');
    });

    // Game over
    this.socket.on('game_over', (data) => {
      this._showResult(data);
    });

    // Errors
    this.socket.on('error', (data) => {
      if (data?.error) {
        // Forward word selection errors
        if (this.currentScreen === 'wordSelection' && this.screens.wordSelection) {
          this.screens.wordSelection.onWordRejected(data.error);
        } else {
          this.showToast(data.error);
        }
      }
    });

    // Connection lost
    this.socket.on('disconnected', () => {
      this.showToast('Connection lost. Reconnecting...');
    });

    this.socket.on('reconnect_failed', () => {
      this.showToast('Could not reconnect. Please refresh.');
    });
  }

  // ─── Helpers ─────────────────────────────────────────
  resetToLobby() {
    this._cleanupScreen('game');
    this._cleanupScreen('result');
    this._cleanupScreen('wordSelection');
    this.roomId = null;
    this.opponentName = null;
    this._showLobby();
  }

  showToast(message, durationMs = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, durationMs);
  }

  _updateLoadingText(text) {
    const el = document.querySelector('.loading-text');
    if (el) el.textContent = text;
  }
}

// ─── Boot ──────────────────────────────────────────────
const app = new App();
app.init().catch(console.error);
