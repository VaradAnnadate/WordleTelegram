import { v4 as uuidv4 } from 'uuid';
import Room from './Room.js';
import redisClient from '../redisClient.js';

const STALE_ROOM_TTL = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL = 60 * 1000;    // Check every minute
const ROOM_PREFIX = 'room:';
const PLAYER_PREFIX = 'player:';

export default class RoomManager {
  constructor() {
    this.rooms = new Map(); // Local cache of active rooms
    this.playerRooms = new Map(); // playerId -> roomId (active room)

    // Periodic cleanup of stale rooms
    this.cleanupInterval = setInterval(() => this._cleanupStaleRooms(), CLEANUP_INTERVAL);
  }

  async createRoom(playerId, playerName, options = {}) {
    // If player is already in a room, remove them
    if (this.playerRooms.has(playerId)) {
      const oldRoomId = this.playerRooms.get(playerId);
      const oldRoom = this.rooms.get(oldRoomId);
      if (oldRoom && oldRoom.state === 'WAITING') {
        this.rooms.delete(oldRoomId);
        await redisClient.del(`${ROOM_PREFIX}${oldRoomId}`);
      }
    }

    const roomId = this._generateRoomId();
    const room = new Room(roomId, playerId, playerName, options);

    room.onRoomFinished = (id) => {
      // Clean up player-room mappings after game finishes
      setTimeout(async () => {
        const r = this.rooms.get(id);
        if (r) {
          for (const pid of r.playerOrder) {
            if (this.playerRooms.get(pid) === id) {
              this.playerRooms.delete(pid);
              await redisClient.del(`${PLAYER_PREFIX}${pid}`);
            }
          }
          r.cleanup();
          this.rooms.delete(id);
          await redisClient.del(`${ROOM_PREFIX}${id}`);
        }
      }, 60_000); // Keep room for 1 minute after finish for result viewing
    };

    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);

    // Persist to Redis with TTL
    await redisClient.set(`${ROOM_PREFIX}${roomId}`, room.toJSON(), 300); // 5 minutes
    await redisClient.set(`${PLAYER_PREFIX}${playerId}`, roomId, 300);

    return room;
  }

  async joinRoom(roomId, playerId, playerName) {
    // Check local cache first
    let room = this.rooms.get(roomId);

    // If not in local cache, try Redis
    if (!room) {
      const roomData = await redisClient.get(`${ROOM_PREFIX}${roomId}`);
      if (roomData) {
        // Room exists in Redis but not in memory - this can happen after server restart
        // We need to reconstruct the room or reject if it's too old
        const roomAge = Date.now() - roomData.createdAt;
        if (roomAge > STALE_ROOM_TTL) {
          await redisClient.del(`${ROOM_PREFIX}${roomId}`);
          return { error: 'Room not found' };
        }
        // For now, we'll reject and ask the creator to recreate
        // Full reconstruction would require more complex state restoration
        return { error: 'Room expired. Please ask the host to create a new room.' };
      }
      return { error: 'Room not found' };
    }

    const result = room.join(playerId, playerName);
    if (result.success) {
      this.playerRooms.set(playerId, roomId);
      await redisClient.set(`${PLAYER_PREFIX}${playerId}`, roomId, 300);
    }

    return { ...result, room };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  async getRoomForPlayer(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) {
      // Try Redis
      const redisRoomId = await redisClient.get(`${PLAYER_PREFIX}${playerId}`);
      if (redisRoomId) {
        const room = this.rooms.get(redisRoomId);
        if (room) {
          this.playerRooms.set(playerId, redisRoomId);
          return room;
        }
      }
      return null;
    }
    return this.rooms.get(roomId);
  }

  _generateRoomId() {
    // Short, URL-safe room ID (8 chars from UUID)
    return uuidv4().replace(/-/g, '').substring(0, 8);
  }

  async _cleanupStaleRooms() {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      // Remove WAITING rooms older than TTL
      if (room.state === 'WAITING' && now - room.createdAt > STALE_ROOM_TTL) {
        room.cleanup();
        for (const pid of room.playerOrder) {
          if (this.playerRooms.get(pid) === id) {
            this.playerRooms.delete(pid);
            await redisClient.del(`${PLAYER_PREFIX}${pid}`);
          }
        }
        this.rooms.delete(id);
        await redisClient.del(`${ROOM_PREFIX}${id}`);
        console.log(`[RoomManager] Cleaned up stale room: ${id}`);
      }

      // Remove FINISHED rooms older than 2 minutes
      if (room.state === 'FINISHED' && now - room.createdAt > STALE_ROOM_TTL) {
        room.cleanup();
        this.rooms.delete(id);
        await redisClient.del(`${ROOM_PREFIX}${id}`);
      }
    }
  }

  getStats() {
    let waiting = 0, playing = 0, finished = 0;
    for (const [, room] of this.rooms) {
      if (room.state === 'WAITING') waiting++;
      else if (room.state === 'PLAYING' || room.state === 'WORD_SELECTION') playing++;
      else finished++;
    }
    return { total: this.rooms.size, waiting, playing, finished };
  }

  async destroy() {
    clearInterval(this.cleanupInterval);
    for (const [, room] of this.rooms) {
      room.cleanup();
    }
    this.rooms.clear();
    this.playerRooms.clear();
    await redisClient.disconnect();
  }
}
