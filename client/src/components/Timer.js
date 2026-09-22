/**
 * Countdown timer with circular progress
 */
export default class Timer {
  constructor(container, onTick, onExpire) {
    this.container = container;
    this.onTick = onTick;
    this.onExpire = onExpire;
    this.totalMs = 0;
    this.remainingMs = 0;
    this.intervalId = null;
    this.startTime = null;
    this.render();
  }

  render() {
    const circumference = 2 * Math.PI * 17; // radius = 17

    this.container.innerHTML = `
      <div class="game-timer-container">
        <div class="game-timer-circle">
          <svg viewBox="0 0 40 40">
            <circle class="timer-track" cx="20" cy="20" r="17" />
            <circle class="timer-progress" cx="20" cy="20" r="17"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="0" />
          </svg>
        </div>
        <span class="game-timer-text">3:00</span>
      </div>
    `;

    this.progressEl = this.container.querySelector('.timer-progress');
    this.textEl = this.container.querySelector('.game-timer-text');
    this.circumference = circumference;
  }

  /**
   * Start countdown
   * @param {number} durationMs - Duration in milliseconds
   */
  start(durationMs) {
    this.stop();
    this.totalMs = durationMs;
    this.remainingMs = durationMs;
    this.startTime = Date.now();

    this._update();
    this.intervalId = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      this.remainingMs = Math.max(0, this.totalMs - elapsed);
      this._update();

      if (this.remainingMs <= 0) {
        this.stop();
        if (this.onExpire) this.onExpire();
      }
    }, 100);
  }

  /**
   * Stop the timer
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get remaining seconds
   */
  getRemaining() {
    return Math.ceil(this.remainingMs / 1000);
  }

  _update() {
    const seconds = Math.ceil(this.remainingMs / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    this.textEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Progress ring
    const fraction = this.remainingMs / this.totalMs;
    const offset = this.circumference * (1 - fraction);
    this.progressEl.style.strokeDashoffset = offset;

    // Color coding
    this.progressEl.classList.remove('warning', 'danger');
    if (fraction <= 0.15) {
      this.progressEl.classList.add('danger');
    } else if (fraction <= 0.33) {
      this.progressEl.classList.add('warning');
    }

    if (this.onTick) {
      this.onTick(this.remainingMs, seconds);
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stop();
  }
}
