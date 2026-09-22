/**
 * Game Screen — Active Wordle gameplay with grid, keyboard, timer, and opponent status
 */
import Grid from '../components/Grid.js';
import Keyboard from '../components/Keyboard.js';
import Timer from '../components/Timer.js';

export default class GameScreen {
  constructor(app) {
    this.app = app;
    this.element = null;
    this.grid = null;
    this.keyboard = null;
    this.timer = null;
    this.opponentGuessCount = 0;
    this.processing = false; // prevent double-submit
  }

  render() {
    const div = document.createElement('div');
    div.id = 'game-screen';
    div.classList.add('screen', 'game-screen');

    div.innerHTML = `
      <div class="game-header">
        <div id="game-timer"></div>
        <h1 class="game-title">WORDLE</h1>
        <div class="game-opponent-status">
          <span class="opponent-name" id="game-opponent-name">Opponent</span>
          <div class="opponent-progress-bar" id="opponent-progress">
            <div class="opponent-progress-pip" data-pip="0"></div>
            <div class="opponent-progress-pip" data-pip="1"></div>
            <div class="opponent-progress-pip" data-pip="2"></div>
            <div class="opponent-progress-pip" data-pip="3"></div>
            <div class="opponent-progress-pip" data-pip="4"></div>
            <div class="opponent-progress-pip" data-pip="5"></div>
          </div>
        </div>
      </div>

      <div class="game-grid-area">
        <div id="game-grid"></div>
      </div>

      <div id="game-keyboard"></div>
    `;

    this.element = div;
    return div;
  }

  /**
   * Initialize components after element is in the DOM
   */
  init(opponentName, timeLimit) {
    // Grid
    const gridContainer = this.element.querySelector('#game-grid');
    this.grid = new Grid(gridContainer);

    // Keyboard
    const keyboardContainer = this.element.querySelector('#game-keyboard');
    this.keyboard = new Keyboard(keyboardContainer, (key) => this._handleKey(key));

    // Timer
    const timerContainer = this.element.querySelector('#game-timer');
    this.timer = new Timer(timerContainer);
    this.timer.start(timeLimit);

    // Opponent name
    const nameEl = this.element.querySelector('#game-opponent-name');
    nameEl.textContent = opponentName || 'Opponent';

    this.opponentGuessCount = 0;
  }

  _handleKey(key) {
    if (this.processing || this.grid.locked) return;

    if (key === 'Backspace') {
      this.grid.removeLetter();
    } else if (key === 'Enter') {
      this._submitGuess();
    } else if (/^[a-z]$/.test(key)) {
      this.grid.addLetter(key);
    }
  }

  _submitGuess() {
    if (!this.grid.isRowFull()) {
      this.grid.shakeCurrentRow();
      this.app.showToast('Not enough letters');
      return;
    }

    const word = this.grid.getCurrentWord();
    if (word.length !== 5) {
      this.grid.shakeCurrentRow();
      this.app.showToast('Not enough letters');
      return;
    }

    this.processing = true;
    this.app.socket.send('guess', { word });
  }

  /**
   * Handle guess result from server
   */
  async onGuessResult(data) {
    this.processing = false;

    if (!data.valid) {
      this.grid.shakeCurrentRow();
      this.app.showToast(data.error || 'Not in word list');
      return;
    }

    // Reveal tiles with animation
    await this.grid.revealRow(data.row, data.tiles);

    // Update keyboard colors
    this.keyboard.updateKeys(data.tiles);

    // Check if solved
    if (data.solved) {
      this.grid.bounceRow(data.row);
      this.grid.lock();
    } else {
      // Move to next row
      this.grid.nextRow();

      // Check if out of guesses
      if (data.guessCount >= 6) {
        this.grid.lock();
      }
    }
  }

  /**
   * Update opponent progress
   */
  onOpponentProgress(data) {
    this.opponentGuessCount = data.guessCount;
    const pips = this.element.querySelectorAll('.opponent-progress-pip');

    pips.forEach((pip, i) => {
      pip.classList.remove('used', 'solved');
      if (i < data.guessCount) {
        pip.classList.add(data.solved ? 'solved' : 'used');
      }
    });

    if (data.solved) {
      this.app.showToast('Opponent guessed the word! 😱');
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.keyboard) this.keyboard.destroy();
    if (this.timer) this.timer.destroy();
  }
}
