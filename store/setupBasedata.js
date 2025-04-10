// main.js (o tu archivo principal)
const path = require('path');
const DatabaseInitializer = require('./DatabaseInitializer'); // Ajusta la ruta si es necesario
const DataManager = require('./DataManager'); // Ajusta la ruta si es necesario
// Importa tu lógica de conexión de TikTok y WebSocket (socket, this.tiktokLiveConnection, etc.)
// const { WebcastPushConnection } = require('tiktok-live-connector'); // Ejemplo si usas esta librería
// const io = require('socket.io-client'); // o server

// --- Configuración ---
const dbPath = path.join('data', 'tiktok_users.db'); // Guarda la BD en ./data/tiktok_users.db
const userTableConfig = {
  tableName: 'users',
  createQuery: `
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY NOT NULL,
      uniqueId TEXT,
      nickname TEXT,
      profilePictureUrl TEXT,
      followRole INTEGER,
      isModerator INTEGER DEFAULT 0,
      isNewGifter INTEGER DEFAULT 0,
      isSubscriber INTEGER DEFAULT 0,
      gifterLevel INTEGER DEFAULT 0,
      teamMemberLevel INTEGER DEFAULT 0,
      totalLikesGiven INTEGER DEFAULT 0,
      totalDiamondsGiven INTEGER DEFAULT 0,
      lastEventType TEXT,
      firstSeenAt DATETIME,
      lastSeenAt DATETIME
    );
  `
};

// --- Variables Globales (o dentro de una clase/función async) ---
let db;
let dataManager;
// Asume que tienes 'this.tiktokLiveConnection' y 'socket' inicializados en algún lugar
// let tiktokLiveConnection = new WebcastPushConnection('@username'); // Ejemplo
// let socket = io('http://localhost:3000'); // Ejemplo

// --- Inicialización Asíncrona ---
async function initializeApp() {
  try {
    console.log("Initializing application...");
    const dbInitializer = new DatabaseInitializer(dbPath, [userTableConfig]); // Pasar como array
    db = await dbInitializer.initialize();
    dataManager = new DataManager(db);
    console.log("Database and DataManager ready.");

    // Aquí iniciarías tu conexión a TikTok y configurarías los listeners
    // setupBasedata(); // Llama a la función que configura los listeners

  } catch (error) {
    console.error("Failed to initialize application:", error);
    process.exit(1); // Salir si la inicialización falla
  }
}

// --- Lógica de manejo de eventos de TikTok ---
// ESTA PARTE ES LA QUE NECESITAS INTEGRAR EN TU CÓDIGO EXISTENTE
// Asume que 'this.tiktokLiveConnection' y 'socket' están disponibles aquí.
// DEBES ADAPTAR ESTO A TU ESTRUCTURA ACTUAL (si usas clases, etc.)

async function setupBasedata(data, event) { // Pasa las dependencias
    if (!dataManager) {
        console.error("DataManager not initialized. Cannot set up listeners.");
        return;
    }
    try {
        // Eventos que definitivamente tienen datos de usuario primarios
        if (['chat', 'gift', 'member', 'like', 'social', 'follow', 'subscribe', 'share'].includes(event)) {
            await dataManager.upsertUserFromEvent(data, event);
        }
        // El evento 'roomUser' tiene una estructura diferente (array de usuarios)
        else if (event === 'roomUser' && data && Array.isArray(data.topViewers)) {
            console.log(`[roomUser] Processing ${data.topViewers.length} top viewers...`);
            for (const viewer of data.topViewers) {
                if (viewer.user) {
                    // Pasamos el objeto 'user' que tiene la estructura esperada
                    await dataManager.upsertUserFromEvent(viewer.user, 'roomUser');
                }
            }
        }
        // Otros eventos ('connected', 'disconnected', 'error', 'streamEnd', etc.)
        // No suelen tener un 'userId' directo para actualizar la tabla users,
        // pero podrías querer loguearlos o manejarlos de otra forma.
        else {
              // console.log(`[${event}] Event received, no direct user upsert action.`);
        }

    } catch (dbError) {
        console.error(`[${event}] Database error during event processing:`, dbError);
    }
}

// --- Punto de Entrada ---
initializeApp();
module.exports = initializeApp;
module.exports.setupBasedata = setupBasedata;
// Aquí necesitarás obtener tu instancia de `tiktokLiveConnection` y `socket`
// y luego llamar a `setupBasedata(miConexionTikTok, miSocket);`

// Ejemplo de cómo podrías iniciar la conexión (AJUSTA A TU CÓDIGO):
/*
const { WebcastPushConnection } = require('tiktok-live-connector');
const io = require('socket.io-client'); // o tu setup de servidor

async function startTikTokConnection(username) {
    await initializeApp(); // Asegúrate que la BD esté lista

    const tiktokConnection = new WebcastPushConnection(username, {
        processInitialData: false,
        enableExtendedGiftInfo: true // Importante para 'diamondCount'
    });

    // Configura tu socket aquí si es necesario
    const socket = null; // Reemplaza con tu instancia de socket.io

    setupBasedata(tiktokConnection, socket); // Configura los listeners AHORA

    try {
        await tiktokConnection.connect();
        console.log(`Connected to TikTok Live for @${username}`);
    } catch (err) {
        console.error(`Failed to connect to TikTok Live for @${username}:`, err);
        // Manejar error de conexión inicial
    }

    // Manejo de cierre limpio
    process.on('SIGINT', async () => {
        console.log('SIGINT received. Disconnecting...');
        try {
            await tiktokConnection.disconnect();
        } catch (e) {
            console.error("Error during disconnection:", e);
        }
        db?.close(); // Cierra la conexión de la base de datos
        process.exit(0);
    });
}

// Llama a la función para iniciar
// startTikTokConnection('tu_tiktok_username');
*/

// **IMPORTANTE:** Debes integrar la función `setupBasedata` y la llamada a
// `initializeApp` en la estructura existente de tu aplicación.
// El ejemplo `startTikTokConnection` es solo una guía de cómo podría hacerse.