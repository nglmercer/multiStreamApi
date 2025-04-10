const { Logger } = require("../b_utils/utils");
// DataManager.js (o UserStorage.js)
// ----- Funciones auxiliares Async (mantenidas como las proporcionaste) -----
const D_logger = new Logger();
D_logger.enable(false);
function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error executing SQL (run):', sql, params, err);
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('Error executing SQL (get):', sql, params, err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error executing SQL (all):', sql, params, err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// ----- Clase DataManager / UserStorage -----
class DataManager {
  constructor(db) {
    if (!db) {
      throw new Error("Se requiere una instancia de base de datos (sqlite3.Database).");
    }
    this.db = db;
    this.tableName = 'users'; // Nombre específico de la tabla de usuarios
    D_logger.log(`DataManager initialized for table: ${this.tableName}`);
  }

  /**
   * Extrae datos de usuario comunes de diferentes tipos de eventos.
   * @param {object} eventData - El objeto de datos del evento.
   * @returns {object | null} - Un objeto con datos de usuario normalizados o null si no se encuentran.
   */
  _extractUserData(eventData) {
    if (!eventData || !eventData.userId) {
      // Algunos eventos como 'connected', 'disconnected', 'error' no tienen userId directo
      // O el evento está malformado.
      return null;
    }

    // Asegura que los booleanos se guarden como 0 o 1
    const parseBool = (value) => value ? 1 : 0;

    return {
      userId: String(eventData.userId), // Asegurar que sea string por consistencia con PRIMARY KEY TEXT
      uniqueId: eventData.uniqueId || null,
      nickname: eventData.nickname || null,
      profilePictureUrl: eventData.profilePictureUrl || (eventData.userDetails?.profilePictureUrls?.[0]) || null,
      followRole: eventData.followRole !== undefined ? eventData.followRole : null,
      isModerator: eventData.isModerator !== undefined ? parseBool(eventData.isModerator) : 0,
      isNewGifter: eventData.isNewGifter !== undefined ? parseBool(eventData.isNewGifter) : 0,
      isSubscriber: eventData.isSubscriber !== undefined ? parseBool(eventData.isSubscriber) : 0,
      gifterLevel: eventData.gifterLevel !== undefined ? eventData.gifterLevel : 0,
      teamMemberLevel: eventData.teamMemberLevel !== undefined ? eventData.teamMemberLevel : 0,
      // Campos de acumulación y tiempo se manejan en upsertUser
    };
  }

  /**
   * Inserta o actualiza un usuario en la base de datos basado en el evento recibido.
   * @param {object} eventData - El objeto de datos del evento de TikTok.
   * @param {string} eventType - El tipo de evento ('chat', 'gift', 'like', etc.).
   * @returns {Promise<void>}
   */
  async upsertUserFromEvent(eventData, eventType) {
    const userData = this._extractUserData(eventData);

    if (!userData) {
      // D_logger.log(`[${eventType}] Evento no contiene datos de usuario relevantes o falta userId.`);
      return; // No hay datos de usuario válidos para procesar
    }

    const now = new Date().toISOString();
    const userId = userData.userId;

    D_logger.log(`[${eventType}] Processing event for user ID: ${userId} (${userData.uniqueId || 'N/A'})`);

    try {
      const existingUser = await getAsync(this.db, `SELECT * FROM ${this.tableName} WHERE userId = ?`, [userId]);

      if (existingUser) {
        // --- UPDATE ---
        D_logger.log(`[${eventType}] User ${userId} found. Updating...`);
        let sql = `UPDATE ${this.tableName} SET
          uniqueId = ?,
          nickname = ?,
          profilePictureUrl = ?,
          followRole = ?,
          isModerator = ?,
          isNewGifter = ?,
          isSubscriber = ?,
          gifterLevel = ?,
          teamMemberLevel = ?,
          lastEventType = ?,
          lastSeenAt = ?`;

        const params = [
          userData.uniqueId,
          userData.nickname,
          userData.profilePictureUrl,
          userData.followRole,
          userData.isModerator,
          userData.isNewGifter,
          userData.isSubscriber,
          userData.gifterLevel,
          userData.teamMemberLevel,
          eventType,
          now // Siempre actualiza lastSeenAt
        ];

        // Añadir lógica de incremento para campos acumulativos
        if (eventType === 'like' && eventData.likeCount > 0) {
          sql += `, totalLikesGiven = totalLikesGiven + ?`;
          params.push(eventData.likeCount);
          D_logger.log(`[like] Incrementing likes by ${eventData.likeCount} for user ${userId}`);
        }
        if (eventType === 'gift' && eventData.diamondCount > 0) {
          // Asegúrate que 'diamondCount' existe en el evento 'gift'
          sql += `, totalDiamondsGiven = totalDiamondsGiven + ?`;
          params.push(eventData.diamondCount);
          D_logger.log(`[gift] Incrementing diamonds by ${eventData.diamondCount} for user ${userId}`);
        }

        sql += ` WHERE userId = ?`;
        params.push(userId);

        const result = await runAsync(this.db, sql, params);
        D_logger.log(`[${eventType}] User ${userId} updated. Changes: ${result.changes}`);

      } else {
        // --- INSERT ---
        D_logger.log(`[${eventType}] User ${userId} not found. Inserting...`);
        const sql = `INSERT INTO ${this.tableName} (
          userId, uniqueId, nickname, profilePictureUrl, followRole,
          isModerator, isNewGifter, isSubscriber, gifterLevel, teamMemberLevel,
          totalLikesGiven, totalDiamondsGiven, lastEventType, firstSeenAt, lastSeenAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const initialLikes = (eventType === 'like' && eventData.likeCount > 0) ? eventData.likeCount : 0;
        const initialDiamonds = (eventType === 'gift' && eventData.diamondCount > 0) ? eventData.diamondCount : 0;

        const params = [
          userData.userId,
          userData.uniqueId,
          userData.nickname,
          userData.profilePictureUrl,
          userData.followRole,
          userData.isModerator,
          userData.isNewGifter,
          userData.isSubscriber,
          userData.gifterLevel,
          userData.teamMemberLevel,
          initialLikes,         // totalLikesGiven inicial
          initialDiamonds,      // totalDiamondsGiven inicial
          eventType,            // lastEventType
          now,                  // firstSeenAt
          now                   // lastSeenAt
        ];

        const result = await runAsync(this.db, sql, params);
        D_logger.log(`[${eventType}] User ${userId} inserted. New Row ID (if autoincrement): ${result.lastID}, Changes: ${result.changes}`);
      }

    } catch (error) {
      console.error(`[${eventType}] Error processing user ${userId}:`, error);
      // Considera una estrategia de reintento o logueo más avanzado si es necesario
    }
  }

  /**
   * Obtiene un usuario por su ID.
   * @param {string} userId - El ID del usuario.
   * @returns {Promise<object|null>}
   */
  async getUserById(userId) {
    const sql = `SELECT * FROM ${this.tableName} WHERE userId = ?`;
    return await getAsync(this.db, sql, [String(userId)]);
  }

  /**
  * Obtiene todos los usuarios de la tabla.
  * @returns {Promise<Array<object>>}
  */
  async getAllUsers() {
    const sql = `SELECT * FROM ${this.tableName}`;
    D_logger.log("Getting all users...");
    const users = await allAsync(this.db, sql);
    D_logger.log(`Found ${users.length} users.`);
    return users;
  }

  // Puedes añadir más métodos según necesites (ej: getUserByUniqueId, deleteUser, etc.)

}

module.exports = DataManager;