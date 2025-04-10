const { WebcastPushConnection, signatureProvider } = require('tiktok-live-connector');
const  { createClient } = require('@retconned/kick-js'); 
const WindowManager = require('../BActions/WindowManager');
const setupBasedata = require('../store/setupBasedata');
const windowManager = new WindowManager();
class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();
    }
    joinRoom(socket, roomId) {
        socket.join(roomId);
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId).add(socket.id);
        return {
            roomId,
            usersCount: this.rooms.get(roomId).size
        };
    }
    leaveRoom(socket, roomId) {
        socket.leave(roomId);
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId).delete(socket.id);
            if (this.rooms.get(roomId).size === 0) {
                this.rooms.delete(roomId);
            }
        }
    }
    emitToRoom(roomId, eventName, data) {
        this.io.to(roomId).emit(eventName, data);
    }
    getRoomUsers(roomId) {
        return this.rooms.get(roomId) || new Set();
    }
    roomExists(roomId) {
        return this.rooms.has(roomId);
    }
    // Obtener número de usuarios en una sala
    getRoomSize(roomId) {
        return this.rooms.get(roomId)?.size || 0;
    }
}
signatureProvider.config.extraParams.apiKey = "NmYzMGMwNmMzODQ5YmUxYjkzNTI0OTIyMzBlOGZlMjgwNTJhY2JhMWQ0MzhhNWVmMGZmMjgy";
// Mapa para guardar las instancias de TikTokLiveControl por sala
const Livescreated = new Map();

const LiveEvents = ['ready', 'ChatMessage', 'Subscription', 'disconnected', 'login','close'];
const tiktokLiveEvents = [
    'chat', 'gift', 'connected', 'disconnected',
    'websocketConnected', 'error', 'member', 'roomUser',
    'like', 'social', 'emote', 'envelope', 'questionNew',
    'subscribe', 'follow', 'share', 'streamEnd'
];
// Enum para los tipos de plataforma
const PlatformType = {
    TIKTOK: 'tiktok',
    KICK: 'kick'
};
class PlatformConnection {
  constructor(uniqueId, options = {}) {
      this.uniqueId = uniqueId;
      this.options = options;
      this.isConnected = false;
      this.state = {};
      this.eventHandlersInitialized = false;
  }

  normalizeUniqueId(uniqueId) {
      return uniqueId.trim();
  }

  getState() {
      return this.state;
  }

  disconnect() {
      this.isConnected = false;
  }
}

// Clase específica para TikTok que extiende de PlatformConnection
class TiktokConnection extends PlatformConnection {
  constructor(uniqueId, options) {
      super(uniqueId, options);
      this.tiktokLiveConnection = new WebcastPushConnection(this.normalizeUniqueId(uniqueId), {
          processInitialData: true,
          enableExtendedGiftInfo: true,
          enableWebsocketUpgrade: true,
          requestPollingIntervalMs: 2000,
          requestOptions: { timeout: 10000 },
          websocketOptions: { timeout: 10000 },
      });
  }

  normalizeUniqueId(uniqueId) {
      uniqueId = uniqueId.trim();
      return uniqueId.startsWith('@') ? uniqueId : '@' + uniqueId;
  }

  async connect(socket) {
      try {
          const state = await this.tiktokLiveConnection.connect();
          this.isConnected = true;
          this.state = state;
          this.initializeEventHandlers(socket);
          if (socket) {
              socket.emit('connected', this.getState());
          }
          return state;
      } catch (err) {
          console.error('Failed to connect to TikTok:', err);
          if (socket) {
              socket.emit('streamEnd', err.message);
          }
          throw err;
      }
  }

  initializeEventHandlers(socket, platform, uniqueId) {
    console.log("initializeEventHandlers", platform, uniqueId);
    tiktokLiveEvents.forEach(event => {
      // Remove previous listeners
      this.tiktokLiveConnection.removeAllListeners(event);

      this.tiktokLiveConnection.on(event, (data) => {
        socket.emit(event, data);  // Emit directly to the socket
        setupBasedata.setupBasedata(data, event);
        if (event === 'disconnected') {
          console.log(`TikTok ${event} event for ${this.uniqueId}`);
          this.isConnected = false;
        }
        if (event === 'streamEnd') {
          this.isConnected = false;
          Livescreated.delete(uniqueId); // Eliminar la conexión de la lista de conexiones activas
        }
        checkAndReconnectConnections(socket); // Intentar reconectar inmediatamente
      });
    });

    this.eventHandlersInitialized = true;
  }

  disconnect() {
      if (this.tiktokLiveConnection) {
          this.tiktokLiveConnection.disconnect();
          super.disconnect();
      }
  }
}
class KickConnection extends PlatformConnection {
  constructor(uniqueId, options) {
      super(uniqueId, options);
      this.kickliveconnector = createClient(uniqueId, { logger: true });
  }

  normalizeUniqueId(uniqueId) {
      return uniqueId.trim();
  }

  async connect(socket) {
      try {
          this.isConnected = true;
          console.log("connect", this.uniqueId);
          this.initializeEventHandlers(socket);
          this.kickliveconnector.login({
            type: "tokens",
            credentials: {
              bearerToken: process.env.BEARER_TOKEN,
              cookies: process.env.COOKIES,
            },
          });          
          if (socket) {
              socket.emit('connected', this.getState());
          }
          return this.state;
      } catch (err) {
          console.error('Failed to connect to Kick:', err);
          throw err;
      }
  }

  initializeEventHandlers(socket) {
    // Unbind previous event listeners if they exist
    console.log("initializeEventHandlers");
    LiveEvents.forEach(event => {
      this.kickliveconnector.on(event, (data) => {
        socket.emit(event, data);  // Emit directly to the socket
        console.log(`Kick ${event}`, data);
        if (event === 'disconnected') {
          console.log(`Kick ${event} event for ${this.uniqueId}`);
          this.isConnected = false;
          checkAndReconnectConnections(socket);
        }
      });
    });
  }
  disconnect() {
      if (this.kickliveconnector) {
          this.kickliveconnector = null;
          super.disconnect();
      }
  }
}

// Mapa para mantener las conexiones activas por plataforma
const platformConnections = {
  [PlatformType.TIKTOK]: new Map(),
  [PlatformType.KICK]: new Map()
};
// Función para obtener o crear una instancia de TiktokLiveControl
async function getOrCreatePlatformConnection(platform, uniqueId, socket) {
  const connections = platformConnections[platform];
  const normalizedId = platform === PlatformType.TIKTOK ? 
      (uniqueId.startsWith('@') ? uniqueId : '@' + uniqueId) : 
      uniqueId.trim();
  console.log(`getOrCreatePlatformConnection: ${platform} ${normalizedId}`, connections);
  // Verificar conexión existente
  let connection = connections.get(normalizedId);
  if (connection) {
      if (!connection.isConnected) {
          try {
              await connection.connect(socket);
          } catch (err) {
              throw new Error(`Failed to reconnect to ${platform} ${normalizedId}: ${err.message}`);
          }
      }
      if (socket && connection.isConnected) {
          socket.emit('connected', connection.getState());
          connection.initializeEventHandlers(socket, platform, uniqueId);
      }
      return connection;
  } else {
    try {
      connection = platform === PlatformType.TIKTOK ?
          new TiktokConnection(normalizedId, { socketId: socket.id }) :
          new KickConnection(normalizedId, { socketId: socket.id });
        console.log(`conexión: ${platform} ${normalizedId}`);
        await connection.connect(socket);
        connections.set(normalizedId, connection);
        return connection;
    } catch (err) {
        throw new Error(`Failed to create new ${platform} connection for ${normalizedId}: ${err.message}`);
    }
  }

  // Crear nueva conexión según la plataforma

}
function getAllConnectionsInfo() {
  const allConnections = [];
  
  Object.entries(platformConnections).forEach(([platform, connections]) => {
      connections.forEach((connection, uniqueId) => {
          allConnections.push({
              platform,
              uniqueId: connection.uniqueId,
              isConnected: connection.isConnected,
              state: connection.getState()
          });
      });
  });
  
  return allConnections;
}
async function checkAndReconnectConnections(socket) {
  const allConnections = getAllConnectionsInfo();

  for (const connectionInfo of allConnections) {
    if (!connectionInfo.isConnected) {
      const connections = platformConnections[connectionInfo.platform];
      const connection = connections.get(connectionInfo.uniqueId);
      try {
        if (connection) {
          console.log(`Attempting to reconnect to ${connectionInfo.platform} ${connectionInfo.uniqueId}`);
          await connection.connect(socket);
          console.log(`Successfully reconnected to ${connectionInfo.platform} ${connectionInfo.uniqueId}`);
        }
      } catch (err) {
        console.error(`Failed to reconnect to ${connectionInfo.platform} ${connectionInfo.uniqueId}:`, err);
        setTimeout(() => {
          if (!connectionInfo.isConnected) {
            connections.delete(connectionInfo.uniqueId); // Eliminar la conexión de la lista de conexiones activas
          }
        }, 10000);
      }
    }
  }
}
function getshortcuts() {
  return {
    "toggle-shortcuts": true,
    "presskey": "f1",
    "pressKey2": "f2"
  };
}
async function IOinit(io, roomManager) {
    io.on('connection', (socket) => {
        checkAndReconnectConnections(socket);
        console.log('A user connected:', socket.id, "disponible connections",Livescreated);
        socket.emit('allConnections', getAllConnectionsInfo());
        socket.emit('shortcuts-event', getshortcuts());
        socket.on('joinRoom', async ({ platform, uniqueId }) => {
          try {
            if (!Object.values(PlatformType).includes(platform)) {
              throw new Error('Invalid platform specified');
            }

            const connection = await getOrCreatePlatformConnection(platform, uniqueId, socket);
            console.log("joinRoom", platform, uniqueId, connection);
            socket.join(connection.uniqueId);
            console.log(`User ${socket.id} joined ${platform} room: ${connection.uniqueId}`);
            socket.emit('message', {
              type: 'success',
              message: `Connected to ${platform} live room: ${connection.uniqueId}`
            });
          } catch (error) {
            socket.emit('message', {
              type: 'error',
              message: error.message
            });
          }
        });
        socket.on('join-room', (roomId) => {
          const roomInfo = roomManager.joinRoom(socket, roomId);
          
          // Notificar a todos en la sala
          roomManager.emitToRoom(roomId, 'user-joined', {
            userId: socket.id,
            usersCount: roomInfo.usersCount
          });
        });
        socket.on('update-window', ({ id, config }) => {
          windowManager.updateWindow(id, config);
        });
        socket.on('create-window', (config) => {
          windowManager.createWindow(config);
        });
        socket.on('close-window', (id) => {
          windowManager.closeWindow(id);
        });
        socket.on('create-overlay', ({ roomId, mapconfig }) => {
          console.log('create-overlay', roomId, mapconfig);
          if (roomManager.roomExists(roomId)) {
            console.log('create-overlay', mapconfig);
            roomManager.emitToRoom(roomId, 'create-overlay', mapconfig);
          }
          // emitimos a todos los usuarios en la sala
      
        });
        // Enviar lista inicial de ventanas
        socket.emit('window-list', 
          Array.from(windowManager.getWindows().entries())
            .map(([id, config]) => ({ id, ...config }))
        );
        socket.on("storemanager", (data) => handleStoreManager(socket, data));
        socket.on("toggle-shortcuts", (enabled) => toggleShortcuts(enabled));
        socket.on("presskey", (key) => handleKeyPress(socket, key));
        socket.on("pressKey2", (key) => handleKeyPress2(socket, key));
        socket.on('disconnect', () => {
          // Limpiar todas las salas donde estaba el usuario
          for (const [roomId, users] of roomManager.rooms.entries()) {
            if (users.has(socket.id)) {
              roomManager.leaveRoom(socket, roomId);
              roomManager.emitToRoom(roomId, 'user-left', {
                userId: socket.id,
                usersCount: roomManager.getRoomSize(roomId)
              });
            }
          }
        });
    });
}
module.exports = {
    IOinit,
    RoomManager
}