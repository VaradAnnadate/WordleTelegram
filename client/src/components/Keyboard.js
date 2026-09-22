/**
 * Virtual QWERTY keyboard component
 */

const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['Enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
];

export default class Keyboard {
  constructor(container, onKey) {
    this.container = container;
    this.onKey = onKey;
    this.keys = new Map(); // letter -> element
    this.render();
    this._bindPhysicalKeyboard();
  }

  render() {
    this.container.innerHTML = '';
    this.container.classList.add('keyboard');

    for (const row of ROWS) {
      const rowEl = document.createElement('div');
      rowEl.classList.add('keyboard-row');

      for (const key of row) {
        const btn = document.createElement('button');
        btn.classList.add('key');
        btn.textContent = key;
        btn.dataset.key = key;

        if (key === 'Enter' || key === '⌫') {
          btn.classList.add('wide');
        }

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this._handleKey(key);
        });

        // Prevent focus stealing on mobile
        btn.addEventListener('mousedown', (e) => e.preventDefault());

        rowEl.appendChild(btn);
        this.keys.set(key.toLowerCase(), btn);
      }

      this.container.appendChild(rowEl);
    }
  }

  _handleKey(key) {
    if (key === '⌫') {
      this.onKey('Backspace');
    } else if (key === 'Enter') {
      this.onKey('Enter');
    } else {
      this.onKey(key);
    }
  }

  _bindPhysicalKeyboard() {
    this._keyHandler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        this.onKey('Backspace');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.onKey('Enter');
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        this.onKey(e.key.toLowerCase());
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  /**
   * Update key colors based on guess results
   * Priority: correct > present > absent
   */
  updateKey(letter, status) {
    const btn = this.keys.get(letter.toLowerCase());
    if (!btn) return;

    // Don't downgrade: correct > present > absent
    if (btn.classList.contains('correct')) return;
    if (btn.classList.contains('present') && status === 'absent') return;

    btn.classList.remove('correct', 'present', 'absent');
    btn.classList.add(status);
  }

  /**
   * Update multiple keys from a guess result
   */
  updateKeys(tiles) {
    for (const tile of tiles) {
      this.updateKey(tile.letter, tile.status);
    }
  }

  /**
   * Reset all key colors
   */
  reset() {
    for (const [, btn] of this.keys) {
      btn.classList.remove('correct', 'present', 'absent');
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }
  }
}
