/**
 * Name Input Screen — Allows users to enter their name
 * Stores name in localStorage for caching
 */
export default class NameInputScreen {
  constructor(app) {
    this.app = app;
    this.element = null;
  }

  render() {
    const div = document.createElement('div');
    div.id = 'name-input-screen';
    div.classList.add('screen', 'name-input-screen');

    // Check for cached name
    const cachedName = localStorage.getItem('wordle_duel_player_name') || '';

    div.innerHTML = `
      <div class="name-input-header">
        <h1 class="name-input-title">Welcome to Wordle Duel</h1>
        <p class="name-input-subtitle">Enter your name to get started</p>
      </div>

      <div class="name-input-form">
        <input 
          id="player-name-input" 
          class="input name-input" 
          type="text" 
          placeholder="Your name" 
          maxlength="20" 
          autocomplete="off" 
          spellcheck="false" 
          value="${cachedName}"
        />
        <button id="btn-continue" class="btn btn-primary">
          Continue
        </button>
      </div>
    `;

    this.element = div;
    this._bindEvents();
    return div;
  }

  _bindEvents() {
    const input = this.element.querySelector('#player-name-input');
    const continueBtn = this.element.querySelector('#btn-continue');

    // Auto-focus input
    setTimeout(() => input.focus(), 100);

    // Handle continue button
    continueBtn.addEventListener('click', () => this._submitName());

    // Handle Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._submitName();
      }
    });

    // Enable/disable button based on input
    input.addEventListener('input', () => {
      const name = input.value.trim();
      continueBtn.disabled = name.length < 2;
    });

    // Initial button state
    const name = input.value.trim();
    continueBtn.disabled = name.length < 2;
  }

  _submitName() {
    const input = this.element.querySelector('#player-name-input');
    const name = input.value.trim();

    if (name.length < 2) {
      this.app.showToast('Name must be at least 2 characters');
      return;
    }

    // Cache the name
    localStorage.setItem('wordle_duel_player_name', name);

    // Set player name and send updated auth
    this.app.playerName = name;
    this.app.socket.send('auth', {
      playerId: this.app.playerId,
      playerName: name,
    });

    // Proceed to lobby
    this.app._showLobby();
  }

  destroy() {
    // Cleanup if needed
  }
}
