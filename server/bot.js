/**
 * Telegram Bot integration using native fetch and Telegram Bot API.
 * Responds to /start with the Web App launcher button.
 */

export class TelegramBot {
  constructor(token, webAppUrl) {
    this.token = token;
    this.webAppUrl = webAppUrl;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.offset = 0;
    this.running = false;
    this.pollAbortController = null;
  }

  async start() {
    if (!this.token) {
      console.log('ℹ️  [Bot] TELEGRAM_BOT_TOKEN not provided — bot polling skipped.');
      console.log('   (Mini App works directly via web link in Telegram BotFather!)');
      return;
    }

    try {
      const res = await fetch(`${this.baseUrl}/getMe`);
      const data = await res.json();
      if (!data.ok) {
        console.error('❌ [Bot] Telegram auth failed:', data.description);
        return;
      }

      console.log(`🤖 [Bot] Connected as @${data.result.username} (${data.result.first_name})`);
      this.username = data.result.username;
      this.running = true;
      this._poll();
    } catch (err) {
      console.error('❌ [Bot] Error starting Telegram bot:', err.message);
    }
  }

  async _poll() {
    while (this.running) {
      try {
        this.pollAbortController = new AbortController();
        const res = await fetch(`${this.baseUrl}/getUpdates?offset=${this.offset}&timeout=25`, {
          signal: this.pollAbortController.signal,
        });

        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            await this._handleUpdate(update);
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') break;
        // Wait 3 seconds on error before retrying
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async _handleUpdate(update) {
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      await this._handleCallbackQuery(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const senderName = msg.from.first_name || 'Player';

    if (text === '/start' || text === '/start@varad_wordle_bot') {
      const appUrl = `https://t.me/varad_wordle_bot/wordle`;
      const buttonText = 'Play Wordle Duel';

      const welcomeText = `👋 Hey *${this._escapeMarkdown(senderName)}*!\n\n` +
        `Welcome to *Wordle Duel* 🟩🟨⬛\n\n` +
        `• 1v1 turn-based challenge with a friend\n` +
        `• Pick a secret 5-letter word for each other\n` +
        `• Race to solve it in 6 tries with a 3-minute timer!\n\n` +
        `Tap the button below to start playing!`;

      await this._sendMessage(chatId, welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: buttonText,
                url: appUrl,
              },
            ],
            [
              {
                text: '📖 How to Play',
                callback_data: 'help',
              },
            ],
          ],
        },
      });
    } else if (text.startsWith('/start ')) {
      // Handle /start with parameter (room code)
      const parts = text.split(' ');
      const startParam = parts[1] || '';

      const appUrl = `https://t.me/varad_wordle_bot/wordle?startapp=${startParam}`;
      const buttonText = `Join Duel #${startParam}`;

      const welcomeText = `👋 Hey *${this._escapeMarkdown(senderName)}*!\n\n` +
        `Welcome to *Wordle Duel* 🟩🟨⬛\n\n` +
        `• 1v1 turn-based challenge with a friend\n` +
        `• Pick a secret 5-letter word for each other\n` +
        `• Race to solve it in 6 tries with a 3-minute timer!\n\n` +
        `👉 You were invited to join room *${startParam}*!`;

      await this._sendMessage(chatId, welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: buttonText,
                url: appUrl,
              },
            ],
            [
              {
                text: '📖 How to Play',
                callback_data: 'help',
              },
            ],
          ],
        },
      });
    } else if (text === '/help') {

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const startParam = parts[1] || ''; // room code if invited via link

      // Use the specific Telegram web app URL
      const appUrl = `https://t.me/varad_wordle_bot/wordle${startParam ? `?startapp=${startParam}` : ''}`;
      let buttonText = 'Play Wordle Duel';

      if (startParam) {
        buttonText = `Join Duel #${startParam}`;
      }

      const welcomeText = `👋 Hey *${this._escapeMarkdown(senderName)}*!\n\n` +
        `Welcome to *Wordle Duel* 🟩🟨⬛\n\n` +
        `• 1v1 turn-based challenge with a friend\n` +
        `• Pick a secret 5-letter word for each other\n` +
        `• Race to solve it in 6 tries with a 3-minute timer!\n\n` +
        (startParam ? `👉 You were invited to join room *${startParam}*!` : `Tap below to start playing!`);

      await this._sendMessage(chatId, welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: buttonText,
                url: appUrl,
              },
            ],
            [
              {
                text: '📖 How to Play',
                callback_data: 'help',
              },
            ],
          ],
        },
      });
    } else if (text === '/help' || text === '/help@varad_wordle_bot') {
      const helpText = `*Wordle Duel Rules:*\n\n` +
        `1. Create a room and send the invite link to a friend.\n` +
        `2. Both players pick a valid 5-letter word to challenge each other.\n` +
        `3. Both players race to guess their assigned word in 6 attempts.\n` +
        `4. Timer lasts 3 minutes.\n` +
        `5. First to guess correctly wins!`;

      await this._sendMessage(chatId, helpText);
    }
  }

  async _sendMessage(chatId, text, extra = {}) {
    try {
      await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          ...extra,
        }),
      });
    } catch (err) {
      console.error('[Bot] Send message error:', err.message);
    }
  }

  async _handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'help') {
      const helpText = `*Wordle Duel Rules:*\n\n` +
        `1. Create a room and send the invite link to a friend.\n` +
        `2. Both players pick a valid 5-letter word to challenge each other.\n` +
        `3. Both players race to guess their assigned word in 6 attempts.\n` +
        `4. Timer lasts 3 minutes.\n` +
        `5. First to guess correctly wins!`;

      await this._answerCallbackQuery(callbackQuery.id);
      await this._sendMessage(chatId, helpText);
    }
  }

  async _answerCallbackQuery(callbackQueryId, text = '') {
    try {
      await fetch(`${this.baseUrl}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
        }),
      });
    } catch (err) {
      console.error('[Bot] Answer callback query error:', err.message);
    }
  }

  _escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }

  stop() {
    this.running = false;
    if (this.pollAbortController) {
      this.pollAbortController.abort();
    }
  }
}

export default TelegramBot;
