import Keyboard from '../components/Keyboard.js';

/**
 * Word Selection Screen — Players pick a 5-letter word to challenge their opponent
 */
export default class WordSelectionScreen {
  constructor(app) {
    this.app = app;
    this.element = null;
    this.word = '';
    this.submitted = false;
    this.opponentReady = false;
    this.timerInterval = null;
    this.timeRemaining = 60;
    this.keyboard = null;
  }

  render() {
    const div = document.createElement('div');
    div.id = 'word-selection-screen';
    div.classList.add('screen', 'word-selection-screen');

    div.innerHTML = `
      <div class="ws-header">
        <h2 class="ws-title">Choose Opponent's Word</h2>
        <p class="ws-subtitle">Pick a valid 5-letter word to challenge your opponent.<br/>They will have 6 tries to guess it!</p>
      </div>

      <div class="ws-timer" id="ws-timer">1:00</div>

      <div class="ws-input-area">
        <div class="ws-tiles" id="ws-tiles">
          <div class="ws-tile"></div>
          <div class="ws-tile"></div>
          <div class="ws-tile"></div>
          <div class="ws-tile"></div>
          <div class="ws-tile"></div>
        </div>

        <div class="ws-validation" id="ws-validation"></div>

        <button id="btn-submit-word" class="btn btn-primary" disabled>
          <span class="btn-icon">⚔️</span>
          Lock In Word
        </button>

        <div class="ws-status" id="ws-opponent-status">
          <span class="ws-status-dot" id="ws-status-dot"></span>
          <span id="ws-status-text">Opponent is choosing...</span>
        </div>
      </div>

      <div id="ws-keyboard"></div>
    `;

    this.element = div;
    this._bindEvents();

    const kbContainer = div.querySelector('#ws-keyboard');
    if (kbContainer) {
      this.keyboard = new Keyboard(kbContainer, (key) => this._handleKey(key));
    }

    return div;
  }

  _handleKey(key) {
    if (this.submitted) return;
    if (key === 'Backspace') {
      this._removeLetter();
    } else if (key === 'Enter') {
      if (this.word.length === 5) {
        this._submitWord();
      } else {
        this.app.showToast('Word must be 5 letters');
        const tiles = this.element.querySelectorAll('.ws-tile');
        tiles.forEach(tile => {
          tile.classList.add('shake');
          setTimeout(() => tile.classList.remove('shake'), 500);
        });
      }
    } else if (/^[a-z]$/i.test(key) && this.word.length < 5) {
      this._addLetter(key.toLowerCase());
    }
  }

  _bindEvents() {
    const submitBtn = this.element.querySelector('#btn-submit-word');
    submitBtn.addEventListener('click', () => this._submitWord());
  }

  _addLetter(letter) {
    if (this.word.length >= 5) return;
    this.word += letter;
    this._updateTiles();
    this._validate();
  }

  _removeLetter() {
    if (this.word.length <= 0) return;
    this.word = this.word.slice(0, -1);
    this._updateTiles();
    this._validate();
  }

  _updateTiles() {
    const tiles = this.element.querySelectorAll('.ws-tile');
    tiles.forEach((tile, i) => {
      const letter = this.word[i] || '';
      tile.textContent = letter.toUpperCase();
      tile.classList.toggle('filled', !!letter);
      tile.classList.remove('valid', 'invalid');
    });
  }

  _validate() {
    const validation = this.element.querySelector('#ws-validation');
    const submitBtn = this.element.querySelector('#btn-submit-word');

    if (this.word.length < 5) {
      validation.textContent = '';
      submitBtn.disabled = true;
      return;
    }

    // Basic client-side validation — server does final validation
    if (!/^[a-z]{5}$/.test(this.word)) {
      validation.textContent = 'Letters only';
      submitBtn.disabled = true;
      return;
    }

    validation.textContent = '';
    submitBtn.disabled = false;

    const tiles = this.element.querySelectorAll('.ws-tile');
    tiles.forEach(tile => tile.classList.add('valid'));
  }

  _submitWord() {
    if (this.submitted) return;
    if (this.word.length !== 5) {
      this.app.showToast('Word must be 5 letters');
      const tiles = this.element.querySelectorAll('.ws-tile');
      tiles.forEach(tile => {
        tile.classList.add('shake');
        setTimeout(() => tile.classList.remove('shake'), 500);
      });
      return;
    }

    this.app.socket.send('select_word', { word: this.word });
    // UI feedback handled in onWordAccepted and onError
  }

  onWordAccepted() {
    this.submitted = true;
    const submitBtn = this.element.querySelector('#btn-submit-word');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-icon">✅</span> Word Submitted!';
    submitBtn.classList.remove('btn-primary');
    submitBtn.classList.add('btn-secondary');

    const tiles = this.element.querySelectorAll('.ws-tile');
    tiles.forEach(tile => tile.classList.add('valid'));

    this.app.showToast('Word accepted!');
  }

  onWordRejected(error) {
    const validation = this.element.querySelector('#ws-validation');
    validation.textContent = error || 'Not a valid word. Try again.';

    const tiles = this.element.querySelectorAll('.ws-tile');
    tiles.forEach(tile => {
      tile.classList.add('invalid');
      setTimeout(() => tile.classList.remove('invalid'), 500);
    });
  }

  onOpponentReady() {
    this.opponentReady = true;
    const dot = this.element.querySelector('#ws-status-dot');
    const text = this.element.querySelector('#ws-status-text');
    dot.classList.add('ready');
    text.textContent = 'Opponent is ready! ✓';
  }

  startTimer(durationMs = 60000) {
    this.timeRemaining = Math.ceil(durationMs / 1000);
    const timerEl = this.element.querySelector('#ws-timer');

    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      const mins = Math.floor(this.timeRemaining / 60);
      const secs = this.timeRemaining % 60;
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

      timerEl.classList.remove('warning', 'danger');
      if (this.timeRemaining <= 10) {
        timerEl.classList.add('danger');
      } else if (this.timeRemaining <= 20) {
        timerEl.classList.add('warning');
      }

      if (this.timeRemaining <= 0) {
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }

  destroy() {
    if (this.keyboard) {
      this.keyboard.destroy();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }
}
