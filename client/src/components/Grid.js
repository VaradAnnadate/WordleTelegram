/**
 * Wordle tile grid component
 */
export default class Grid {
  constructor(container, rows = 6, cols = 5) {
    this.container = container;
    this.rows = rows;
    this.cols = cols;
    this.currentRow = 0;
    this.currentCol = 0;
    this.tiles = []; // 2D array of tile elements
    this.locked = false;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    this.container.classList.add('game-grid');
    this.tiles = [];

    for (let r = 0; r < this.rows; r++) {
      const row = document.createElement('div');
      row.classList.add('grid-row');
      row.dataset.row = r;
      const rowTiles = [];

      for (let c = 0; c < this.cols; c++) {
        const tile = document.createElement('div');
        tile.classList.add('grid-tile');
        tile.dataset.row = r;
        tile.dataset.col = c;
        tile.style.setProperty('--col', c);
        row.appendChild(tile);
        rowTiles.push(tile);
      }

      this.container.appendChild(row);
      this.tiles.push(rowTiles);
    }
  }

  /**
   * Add a letter to the current position
   */
  addLetter(letter) {
    if (this.locked) return false;
    if (this.currentCol >= this.cols) return false;
    if (this.currentRow >= this.rows) return false;

    const tile = this.tiles[this.currentRow][this.currentCol];
    tile.textContent = letter.toUpperCase();
    tile.classList.add('filled');
    this.currentCol++;
    return true;
  }

  /**
   * Remove the last letter
   */
  removeLetter() {
    if (this.locked) return false;
    if (this.currentCol <= 0) return false;

    this.currentCol--;
    const tile = this.tiles[this.currentRow][this.currentCol];
    tile.textContent = '';
    tile.classList.remove('filled');
    return true;
  }

  /**
   * Get the current row's word (only filled letters)
   */
  getCurrentWord() {
    let word = '';
    for (let c = 0; c < this.currentCol; c++) {
      const letter = (this.tiles[this.currentRow][c].textContent || '').toLowerCase().trim();
      word += letter;
    }
    return word;
  }

  /**
   * Check if current row is full
   */
  isRowFull() {
    return this.currentCol === this.cols;
  }

  /**
   * Reveal tiles with animation for a completed guess
   * @param {Array} tiles - Array of { letter, status } from server
   * @returns {Promise} Resolves when animation completes
   */
  revealRow(row, tiles) {
    return new Promise((resolve) => {
      const rowTiles = this.tiles[row];

      tiles.forEach((tile, i) => {
        setTimeout(() => {
          const el = rowTiles[i];
          el.classList.add('reveal');

          // Apply color at the halfway point of the flip
          setTimeout(() => {
            el.classList.add(tile.status);
          }, 200);

          if (i === tiles.length - 1) {
            setTimeout(resolve, 350);
          }
        }, i * 150);
      });
    });
  }

  /**
   * Advance to next row
   */
  nextRow() {
    this.currentRow++;
    this.currentCol = 0;
  }

  /**
   * Shake the current row (invalid word)
   */
  shakeCurrentRow() {
    const row = this.container.querySelector(`[data-row="${this.currentRow}"].grid-row`)
      || this.container.children[this.currentRow];
    if (row) {
      row.classList.add('shake');
      setTimeout(() => row.classList.remove('shake'), 500);
    }
  }

  /**
   * Bounce tiles on win
   */
  bounceRow(row) {
    const rowTiles = this.tiles[row];
    rowTiles.forEach(tile => {
      tile.classList.add('bounce');
    });
  }

  /**
   * Lock the grid (no more input)
   */
  lock() {
    this.locked = true;
  }

  /**
   * Unlock the grid
   */
  unlock() {
    this.locked = false;
  }

  /**
   * Reset the grid
   */
  reset() {
    this.currentRow = 0;
    this.currentCol = 0;
    this.locked = false;
    this.render();
  }
}
