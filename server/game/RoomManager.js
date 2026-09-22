import { v4 as uuidv4 } from 'uuid';
import Room from './Room.js';

const STALE_ROOM_TTL = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL = 60 * 1000;    // Check every minute

export default class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map(); // playerId -> roomId (active room)

    // Periodic cleanup of stale rooms
    this.cleanupInterval = setInterval(() => this._cleanupStaleRooms(), CLEANUP_INTERVAL);
  }

  createRoom(playerId, playerName, options = {}) {
    // If player is already in a room, remove them
    if (this.playerRooms.has(playerId)) {
      const oldRoomId = this.playerRooms.get(playerId);
      const oldRoom = this.rooms.get(oldRoomId);
      if (oldRoom && oldRoom.state === 'WAITING') {
        this.rooms.delete(oldRoomId);
      }
    }

    const roomId = this._generateRoomId();
    const room = new Room(roomId, playerId, playerName, options);

    room.onRoomFinished = (id) => {
      // Clean up player-room mappings after game finishes
      setTimeout(() => {
        const r = this.rooms.get(id);
        if (r) {
          for (const pid of r.playerOrder) {
            if (this.playerRooms.get(pid) === id) {
              this.playerRooms.delete(pid);
            }
          }
          r.cleanup();
          this.rooms.delete(id);
        }
      }, 60_000); // Keep room for 1 minute after finish for result viewing
    };

    this.rooms.set(roomId, room);
    this.playerRooms.set(playerId, roomId);

    return room;
  }

  joinRoom(roomId, playerId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { error: 'Room not found' };
    }

    const result = room.join(playerId, playerName);
    if (result.success) {
      this.playerRooms.set(playerId, roomId);
    }

    return { ...result, room };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomForPlayer(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;
    return this.rooms.get(roomId);
  }

  _generateRoomId() {
    // Short, URL-safe room ID (8 chars from UUID)
    return uuidv4().replace(/-/g, '').substring(0, 8);
  }

  _cleanupStaleRooms() {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      // Remove WAITING rooms older than TTL
      if (room.state === 'WAITING' && now - room.createdAt > STALE_ROOM_TTL) {
        room.cleanup();
        for (const pid of room.playerOrder) {
          if (this.playerRooms.get(pid) === id) {
            this.playerRooms.delete(pid);
          }
        }
        this.rooms.delete(id);
        console.log(`[RoomManager] Cleaned up stale room: ${id}`);
      }

      // Remove FINISHED rooms older than 2 minutes
      if (room.state === 'FINISHED' && now - room.createdAt > STALE_ROOM_TTL) {
        room.cleanup();
        this.rooms.delete(id);
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

  destroy() {
    clearInterval(this.cleanupInterval);
    for (const [, room] of this.rooms) {
      room.cleanup();
    }
    this.rooms.clear();
    this.playerRooms.clear();
  }
}
