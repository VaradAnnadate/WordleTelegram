/**
 * Result Screen — Shows game outcome with stats
 */
export default class ResultScreen {
  constructor(app) {
    this.app = app;
    this.element = null;
  }

  render(data) {
    const div = document.createElement('div');
    div.id = 'result-screen';
    div.classList.add('screen', 'result-screen');

    const emoji = data.result === 'win' ? '🏆' : data.result === 'lose' ? '😢' : '🤝';
    const title = data.result === 'win' ? 'You Win!' : data.result === 'lose' ? 'You Lose' : 'It\'s a Draw!';
    const titleClass = data.result;

    div.innerHTML = `
      <div class="result-header">
        <div class="result-emoji">${emoji}</div>
        <h2 class="result-title ${titleClass}">${title}</h2>
        <p class="result-reason">${data.reason || ''}</p>
      </div>

      <div class="result-words">
        <div class="result-word-card">
          <div class="result-word-label">Your Word (for opponent)</div>
          <div class="result-word-value">${(data.yourWord || '?????').toUpperCase()}</div>
        </div>
        <div class="result-word-card">
          <div class="result-word-label">Opponent's Word (for you)</div>
          <div class="result-word-value">${(data.opponentWord || '?????').toUpperCase()}</div>
        </div>
      </div>

      <div class="result-stats">
        <div class="result-stat">
          <div class="result-stat-value">${data.yourGuesses || 0}/6</div>
          <div class="result-stat-label">Your Guesses</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-value">${data.opponentGuesses || 0}/6</div>
          <div class="result-stat-label">Opponent Guesses</div>
        </div>
      </div>

      <div class="result-actions">
        <button id="btn-play-again" class="btn btn-primary">
          <span class="btn-icon">🔄</span>
          Play Again
        </button>
        <button id="btn-share-result" class="btn btn-secondary">
          <span class="btn-icon">📤</span>
          Share Result
        </button>
      </div>
    `;

    this.element = div;
    this._bindEvents(data);

    // Confetti on win!
    if (data.result === 'win') {
      setTimeout(() => this._showConfetti(), 300);
    }

    return div;
  }

  _bindEvents(data) {
    this.element.querySelector('#btn-play-again').addEventListener('click', () => {
      this.app.resetToLobby();
    });

    this.element.querySelector('#btn-share-result').addEventListener('click', () => {
      this._shareResult(data);
    });
  }

  _shareResult(data) {
    const emoji = data.result === 'win' ? '🏆' : data.result === 'lose' ? '😢' : '🤝';
    const resultText = data.result === 'win' ? 'Won' : data.result === 'lose' ? 'Lost' : 'Drew';

    // Build a Wordle-style share text with emoji blocks
    let shareText = `${emoji} Wordle Duel — ${resultText}!\n\n`;
    shareText += `My guesses: ${data.yourGuesses || 0}/6\n`;
    shareText += `Opponent: ${data.opponentGuesses || 0}/6\n\n`;

    // Build emoji board for your guesses
    if (data.yourBoard) {
      for (const row of data.yourBoard) {
        shareText += row.map(t => {
          if (t.status === 'correct') return '🟩';
          if (t.status === 'present') return '🟨';
          return '⬛';
        }).join('') + '\n';
      }
    }

    if (navigator.share) {
      navigator.share({ text: shareText }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText).then(() => {
        this.app.showToast('Result copied!');
      }).catch(() => {});
    }
  }

  _showConfetti() {
    const container = document.getElementById('confetti-container');
    const colors = ['#538d4e', '#b59f3b', '#6c63ff', '#a855f7', '#4ade80', '#fbbf24', '#ff6b6b'];

    for (let i = 0; i < 60; i++) {
      const piece = document.createElement('div');
      piece.classList.add('confetti-piece');
      piece.style.left = Math.random() * 100 + '%';
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.width = (Math.random() * 8 + 6) + 'px';
      piece.style.height = (Math.random() * 8 + 6) + 'px';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
      piece.style.animationDelay = (Math.random() * 1) + 's';
      container.appendChild(piece);
    }

    // Cleanup after animation
    setTimeout(() => {
      container.innerHTML = '';
    }, 5000);
  }
}
