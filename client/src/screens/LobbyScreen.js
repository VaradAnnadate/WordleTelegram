/**
 * Lobby Screen — Create or Join a game room
 */
export default class LobbyScreen {
  constructor(app) {
    this.app = app;
    this.element = null;
    this.waitingOverlay = null;
    this.roomId = null;
  }

  render() {
    const div = document.createElement('div');
    div.id = 'lobby-screen';
    div.classList.add('screen', 'lobby-screen');

    div.innerHTML = `
      <div class="lobby-header">
        <h1 class="lobby-title">Wordle Duel</h1>
        <p class="lobby-tagline">Challenge a friend. Pick a word. Race to solve.<br/>First to guess wins!</p>
      </div>

      <div class="lobby-actions">
        <button id="btn-create" class="btn btn-primary">
          Create Game
        </button>
      </div>

      <div class="join-section">
        <div class="join-divider"><span>or join a game</span></div>
        <div class="join-input-group">
          <input id="join-code-input" class="input" type="text" placeholder="Enter room code" maxlength="8" autocomplete="off" spellcheck="false" />
          <button id="btn-join" class="btn btn-primary">Join</button>
        </div>
      </div>

      <!-- Waiting for opponent overlay -->
      <div id="waiting-overlay" class="waiting-overlay hidden">
        <div class="waiting-dots">
          <div class="waiting-dot"></div>
          <div class="waiting-dot"></div>
          <div class="waiting-dot"></div>
        </div>
        <h2 class="waiting-title">Waiting for opponent...</h2>
        <p class="waiting-subtitle">Share this room code with a friend</p>
        <div class="room-code">
          <span id="room-code-text" class="room-code-text">--------</span>
          <button id="btn-copy-code" class="copy-btn" title="Copy code">📋</button>
        </div>
        <button id="btn-share" class="btn btn-primary share-btn">
          <span class="btn-icon">📤</span>
          Share Invite Link
        </button>
        <button id="btn-cancel-wait" class="btn btn-secondary">
          Cancel
        </button>
      </div>
    `;

    this.element = div;
    this._bindEvents();
    return div;
  }

  _bindEvents() {
    const createBtn = this.element.querySelector('#btn-create');
    const joinBtn = this.element.querySelector('#btn-join');
    const joinInput = this.element.querySelector('#join-code-input');
    const copyBtn = this.element.querySelector('#btn-copy-code');
    const shareBtn = this.element.querySelector('#btn-share');
    const cancelBtn = this.element.querySelector('#btn-cancel-wait');

    createBtn.addEventListener('click', () => this._createGame());

    joinBtn.addEventListener('click', () => {
      const code = joinInput.value.trim();
      if (code) this._joinGame(code);
    });

    joinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const code = joinInput.value.trim();
        if (code) this._joinGame(code);
      }
    });

    copyBtn.addEventListener('click', () => this._copyCode());
    shareBtn.addEventListener('click', () => this._shareInvite());
    cancelBtn.addEventListener('click', () => this._cancelWait());
  }

  _createGame() {
    this.app.socket.send('create_room');
  }

  _joinGame(roomId) {
    this.app.socket.send('join_room', { roomId });
  }

  showWaiting(roomId) {
    this.roomId = roomId;
    const overlay = this.element.querySelector('#waiting-overlay');
    const codeText = this.element.querySelector('#room-code-text');
    overlay.classList.remove('hidden');
    codeText.textContent = roomId.toUpperCase();
  }

  hideWaiting() {
    const overlay = this.element.querySelector('#waiting-overlay');
    overlay.classList.add('hidden');
  }

  _copyCode() {
    if (!this.roomId) return;
    navigator.clipboard.writeText(this.roomId).then(() => {
      this.app.showToast('Room code copied!');
    }).catch(() => {
      this.app.showToast('Copy failed');
    });
  }

  _shareInvite() {
    if (!this.roomId) return;

    // Use the specific Telegram web app link
    const link = `https://t.me/varad_wordle_bot/wordle?startapp=${this.roomId}`;

    const text = `I challenge you to a Wordle Duel! 🟩🟨⬛\nRoom: ${this.roomId.toUpperCase()}\nPlay: ${link}`;

    // Try native Telegram / browser share API first
    if (navigator.share) {
      navigator.share({
        title: 'Wordle Duel Challenge!',
        text: `I challenge you to a Wordle Duel! 🟩🟨⬛ Room: ${this.roomId.toUpperCase()}`,
        url: link,
      }).catch(() => {
        navigator.clipboard.writeText(link).then(() => {
          this.app.showToast('Invite link copied!');
        });
      });
    } else {
      // Fallback: copy link to clipboard
      navigator.clipboard.writeText(link).then(() => {
        this.app.showToast('Invite link copied!');
      }).catch(() => {
        this.app.showToast(`Room code: ${this.roomId.toUpperCase()}`);
      });
    }
  }

  _cancelWait() {
    this.hideWaiting();
    this.roomId = null;
  }

  /**
   * Auto-join if launched with room code
   */
  autoJoin(roomId) {
    this._joinGame(roomId);
  }
}
