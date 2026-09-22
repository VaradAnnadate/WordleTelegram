/**
 * Redis client wrapper with fallback to in-memory storage
 * Uses Redis for persistent room storage across server restarts and multiple instances
 */
import Redis from 'ioredis';

class RedisClient {
  constructor() {
    this.redis = null;
    this.useFallback = false;
    this.inMemoryStore = new Map();
    this.connected = false;
  }

  async connect() {
    const redisUrl = process.env.REDIS_URL || process.env.RAILWAY_REDIS_URL;

    if (!redisUrl) {
      console.log('⚠️  [Redis] No REDIS_URL found, using in-memory fallback');
      this.useFallback = true;
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        connectTimeout: 5000, // 5 second connection timeout
        lazyConnect: false,
      });

      this.redis.on('connect', () => {
        console.log('✅ [Redis] Connected');
        this.connected = true;
      });

      this.redis.on('error', (err) => {
        console.error('❌ [Redis] Error:', err.message);
        if (!this.connected) {
          console.log('⚠️  [Redis] Falling back to in-memory storage');
          this.useFallback = true;
          this.redis = null;
        }
      });

      // Test connection with timeout
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      );

      await Promise.race([this.redis.ping(), timeout]);
      this.connected = true;
    } catch (err) {
      console.error('❌ [Redis] Connection failed:', err.message);
      console.log('⚠️  [Redis] Falling back to in-memory storage');
      this.useFallback = true;
      if (this.redis) {
        this.redis.disconnect();
        this.redis = null;
      }
    }
  }

  async set(key, value, ttlSeconds) {
    if (this.useFallback) {
      this.inMemoryStore.set(key, value);
      if (ttlSeconds) {
        setTimeout(() => this.inMemoryStore.delete(key), ttlSeconds * 1000);
      }
      return;
    }

    try {
      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      } else {
        await this.redis.set(key, JSON.stringify(value));
      }
    } catch (err) {
      console.error('[Redis] Set error:', err.message);
      this._fallbackSet(key, value, ttlSeconds);
    }
  }

  async get(key) {
    if (this.useFallback) {
      return this.inMemoryStore.get(key);
    }

    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.error('[Redis] Get error:', err.message);
      return this.inMemoryStore.get(key);
    }
  }

  async del(key) {
    if (this.useFallback) {
      return this.inMemoryStore.delete(key);
    }

    try {
      await this.redis.del(key);
    } catch (err) {
      console.error('[Redis] Delete error:', err.message);
      this.inMemoryStore.delete(key);
    }
  }

  async exists(key) {
    if (this.useFallback) {
      return this.inMemoryStore.has(key);
    }

    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (err) {
      console.error('[Redis] Exists error:', err.message);
      return this.inMemoryStore.has(key);
    }
  }

  async keys(pattern) {
    if (this.useFallback) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(this.inMemoryStore.keys()).filter(key => regex.test(key));
    }

    try {
      return await this.redis.keys(pattern);
    } catch (err) {
      console.error('[Redis] Keys error:', err.message);
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(this.inMemoryStore.keys()).filter(key => regex.test(key));
    }
  }

  _fallbackSet(key, value, ttlSeconds) {
    this.inMemoryStore.set(key, value);
    if (ttlSeconds) {
      setTimeout(() => this.inMemoryStore.delete(key), ttlSeconds * 1000);
    }
  }

  async disconnect() {
    if (this.redis) {
      await this.redis.quit();
    }
    this.inMemoryStore.clear();
  }
}

export default new RedisClient();
