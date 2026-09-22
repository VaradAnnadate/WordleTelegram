# Redis Setup for Persistent Room Storage

## Why Redis?

The "Room not found" error occurs because rooms are stored in-memory by default. When deployed to Railway:

1. **Server restarts** during deployments clear all rooms from memory
2. **Multiple instances** can be spawned, and rooms created on one instance aren't accessible from another
3. **Cleanup timers** remove stale rooms after 5 minutes

Redis provides persistent, shared storage across all server instances and survives restarts.

## Setup on Railway

### Step 1: Add Redis to your Railway project

1. Go to your Railway project
2. Click "New Service" → "Add a Database"
3. Select "Redis"
4. Railway will automatically provide `RAILWAY_REDIS_URL` environment variable

### Step 2: Deploy your changes

The code changes are already in place:
- Added `ioredis` dependency
- Created Redis client with automatic fallback to in-memory storage
- Updated RoomManager to persist rooms in Redis
- Updated all async functions to handle Redis operations

When you deploy:
- If Redis is available, rooms will be persisted
- If Redis is not available, the app falls back to in-memory storage (with a warning)

### Step 3: Verify

After deployment, check your logs:
- `✅ [Redis] Connected` - Redis is working
- `⚠️  [Redis] No REDIS_URL found, using in-memory fallback` - Redis not configured (fallback mode)

## Local Development

For local development with Redis:

### Option 1: Use Docker (Recommended)

```bash
docker run -d -p 6379:6379 redis:alpine
```

Then add to your `.env`:
```
REDIS_URL=redis://localhost:6379
```

### Option 2: Install Redis directly

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

Then add to your `.env`:
```
REDIS_URL=redis://localhost:6379
```

### Option 3: No Redis (Fallback)

If you don't want to use Redis locally, simply don't set `REDIS_URL`. The app will use in-memory storage with a warning message.

## How It Works

The Redis client wrapper (`server/redisClient.js`) provides:

1. **Automatic fallback**: If Redis connection fails, it falls back to in-memory storage
2. **TTL support**: Rooms automatically expire after 5 minutes
3. **Simple API**: Same interface as in-memory Map operations
4. **Connection pooling**: Handles reconnection automatically

Room persistence:
- Rooms are stored with key pattern: `room:{roomId}`
- Player-to-room mappings: `player:{playerId}` → `roomId`
- Both have 5-minute TTL (configurable in `RoomManager.js`)

## Troubleshooting

### "Room not found" still happening

1. Check logs for Redis connection status
2. Verify `RAILWAY_REDIS_URL` is set in Railway environment variables
3. Check if Redis service is running in your Railway project
4. Ensure your Railway project has the Redis service added

### Connection errors

If you see Redis connection errors:
- The app will automatically fall back to in-memory storage
- Check your Redis URL format: `redis://host:port` or `rediss://host:port` for TLS
- For Railway, use the provided `RAILWAY_REDIS_URL` automatically

### Performance considerations

- Redis adds minimal latency (~1-2ms per operation)
- The local cache in `RoomManager` provides fast access to active rooms
- Redis is only used for persistence and cross-instance sharing
