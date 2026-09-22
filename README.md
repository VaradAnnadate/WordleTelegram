# 🟩 Wordle Duel — Telegram Mini App (1v1 Multiplayer)

A 1v1 multiplayer Wordle Telegram Mini App designed with the **100% authentic NYT Wordle UI**. Challenge your friends directly in Telegram, secretly choose a word for them to guess, and race against the 3-minute timer!

---

## 🎮 How It Works

1. **Private 1v1 Room**: Player 1 creates a game and gets a room code / direct invite link to share with a friend (no random strangers).
2. **Secret Word Selection**: Both players secretly choose a valid 5-letter challenge word from the standard Wordle dictionary.
3. **Real-time Duel**:
   - Both players race to solve each other's secret word in **6 attempts**.
   - **3-Minute Countdown Timer** (fully configurable).
   - Real-time opponent progress tracker (view their attempt pips without spoiling their letters).
   - First to guess correctly wins! If both solve, the fastest solver wins.
4. **Authentic Wordle Aesthetics**:
   - Exact Wordle dark mode palette (`#121213`, `#538d4e`, `#b59f3b`, `#3a3a3c`, `#818384`).
   - Authentic tile pop and 3D flip animation sequence.
   - Exact QWERTY keyboard with dynamic color tracking.
   - Wordle-style emoji summary card (🟩🟨⬛) to copy or share.

---

## 🚀 Hosting on Railway (Recommended)

This repository is pre-configured with a unified root `package.json`, `railway.json`, and `Procfile` for **one-click deployment on Railway**:

### Step 1: Push Code to GitHub
```bash
git init
git add .
git commit -m "Wordle Duel Telegram Mini App"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 2: Deploy on Railway
1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select your repository.
4. Railway will automatically detect the build configuration from `railway.json` and build both the Vite client frontend and Express backend.
5. In your Railway service settings under **Networking**, click **Generate Domain** to get your public URL (e.g. `https://wordle-duel-production.up.railway.app`).

### Step 3: Configure Environment Variables in Railway
Under the **Variables** tab in Railway, set:
- `PORT` = `3000` (or Railway default)
- `GAME_TIME_LIMIT_SECONDS` = `180` (3 minutes, or any duration you prefer)
- `WEBAPP_URL` = `https://<your-railway-domain>`
- `TELEGRAM_BOT_TOKEN` = *(optional, your bot token from @BotFather)*

---

## 🤖 Telegram BotFather Setup

Setting up your Telegram Bot to launch the Mini App takes under 2 minutes:

### 1. Create Bot via @BotFather
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot`.
3. Choose a name (e.g. `My Wordle Duel`) and a username (e.g. `my_wordle_duel_bot`).
4. Save the **HTTP API Token** provided by BotFather.

### 2. Configure Mini App / Web App
1. In @BotFather, send `/newapp`.
2. Select your bot from the list.
3. Provide an app title (e.g. `Wordle Duel`) and a short description.
4. Upload an icon (640x640) or placeholder image.
5. When BotFather asks for the **Web App URL**, enter your Railway URL:
   ```
   https://<your-railway-domain>
   ```
6. Choose a short name for the app (e.g. `duel` or `wordle`).
7. BotFather will provide your direct Mini App link:
   ```
   https://t.me/<your_bot_username>/<short_name>
   ```

### 3. Set the Menu Button (Optional but Recommended)
In @BotFather:
1. Send `/setmenubutton`.
2. Select your bot.
3. Enter the Web App URL (`https://<your-railway-domain>`).
4. Enter button text: `⚔️ Play Wordle`.

*Now, any time you or a friend open your bot, there is a prominent "⚔️ Play Wordle" button in the chat menu!*

---

## 💻 Running Locally

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Run in Development Mode
In one terminal, start the server:
```bash
npm run dev
```

In another terminal, start the Vite client:
```bash
npm run dev:client
```
Visit `http://localhost:5173` in your browser.

### 3. Run Automated End-to-End Test
```bash
node server/test-duel.js
```

---

## ⚙️ Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server HTTP and WebSocket port |
| `GAME_TIME_LIMIT_SECONDS` | `180` | Duel duration in seconds (3 minutes) |
| `WORD_SELECTION_TIME_MS` | `60000` | Word selection phase limit in ms (1 minute) |
| `TELEGRAM_BOT_TOKEN` | *empty* | Bot token for handling `/start` and launch button |
| `WEBAPP_URL` | `http://localhost:3000` | Public deployment URL |

---

## 📁 Architecture

- **`client/`**: Lightweight vanilla JavaScript + CSS with Vite. 100% pixel-perfect Wordle recreation without bloated frameworks.
- **`server/`**: Express + WebSocket server managing real-time game rooms, secret word validation, and clock synchronization.
- **`server/data/`**: Standard Wordle word lists (`answers.js` and `validGuesses.js`).
- **`server/bot.js`**: Built-in lightweight Telegram Bot handler for answering `/start` commands and deep links.
