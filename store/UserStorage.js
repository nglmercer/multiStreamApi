// UserStorage.js
const sqlite3 = require('sqlite3').verbose();

// Funciones ayudantes para convertir callbacks de sqlite3 en Promesas
function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { // Usar function() para tener acceso a 'this'
      if (err) {
        console.error('Error ejecutando SQL (run):', sql, params, err);
        reject(err);
      } else {
        // 'this' contiene lastID y changes para INSERT, UPDATE, DELETE
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('Error ejecutando SQL (get):', sql, params, err);
        reject(err);
      } else {
        resolve(row); // Devuelve la fila encontrada o undefined
      }
    });
  });
}

function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error ejecutando SQL (all):', sql, params, err);
        reject(err);
      } else {
        resolve(rows); // Devuelve un array de filas (puede estar vacío)
      }
    });
  });
}


class DataManager {
  constructor(db) {
    if (!db) {
      throw new Error("Se requiere una instancia de base de datos (sqlite3.Database).");
    }
    this.db = db;
    this.tableName = 'items'; // Nombre de la tabla a manejar
  }

  // --- Métodos CRUD ---

  /**
   * Añade un nuevo elemento a la base de datos.
   * @param {object} itemData - Objeto con los datos del elemento.
   * @returns {Promise<number>} - Promesa que resuelve con el ID del elemento insertado.
   */
  async addItem(itemData) {
    const fields = [
      'id', 'channelId', 'userId', 'username', 'nickname', 'thumbnailUrl',
      'totalAmount', 'totalRewardAmount', 'challengeStartAmount',
      'challengeStartRewardAmount', 'archivedAmount', 'archivedRewardAmount',
      'lastUpsertAt', 'createdAt', 'updatedAt'
    ];
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(field => itemData[field] !== undefined ? itemData[field] : null);

    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;

    console.log(`Añadiendo item con ID: ${itemData.id}`);
    try {
      const result = await runAsync(this.db, sql, values);
      // Si el ID es autoincrement, usar result.lastID. Si el ID se provee, usar itemData.id
      console.log(`Item añadido con ID: ${itemData.id}, cambios: ${result.changes}`);
      return itemData.id; // O result.lastID si 'id' fuera AUTOINCREMENT
    } catch (error) {
      console.error(`Error al añadir item con ID ${itemData.id}:`, error);
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
         console.warn(`El item con ID ${itemData.id} ya existe.`);
         // Opcional: Podrías llamar a updateItem aquí si quieres un comportamiento 'upsert'
         // await this.updateItem(itemData.id, itemData);
         // return itemData.id;
      }
      throw error; // Re-lanzar el error para que sea manejado externamente si es necesario
    }
  }

  /**
   * Obtiene un elemento por su ID.
   * @param {number} id - El ID del elemento a buscar.
   * @returns {Promise<object|null>} - Promesa que resuelve con el objeto del elemento o null si no se encuentra.
   */
  async getItemById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    console.log(`Buscando item con ID: ${id}`);
    const item = await getAsync(this.db, sql, [id]);
    if (item) {
        console.log(`Item encontrado con ID: ${id}`);
    } else {
        console.log(`Item con ID: ${id} no encontrado.`);
    }
    return item || null; // Devolver null explícitamente si es undefined
  }

  /**
   * Actualiza un elemento existente por su ID.
   * @param {number} id - El ID del elemento a actualizar.
   * @param {object} updatedData - Objeto con los campos a actualizar.
   * @returns {Promise<boolean>} - Promesa que resuelve con true si se actualizó, false si no se encontró o no hubo cambios.
   */
  async updateItem(id, updatedData) {
    // Excluir 'id' de los campos a actualizar
    const fieldsToUpdate = Object.keys(updatedData).filter(key => key !== 'id' && updatedData[key] !== undefined);

    if (fieldsToUpdate.length === 0) {
      console.log("No hay campos para actualizar.");
      return false; // No hay nada que actualizar
    }

    const setClause = fieldsToUpdate.map(field => `${field} = ?`).join(', ');
    const values = fieldsToUpdate.map(field => updatedData[field]);
    values.push(id); // Añadir el ID al final para la cláusula WHERE

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;

    console.log(`Actualizando item con ID: ${id}`);
    try {
        const result = await runAsync(this.db, sql, values);
        console.log(`Item con ID: ${id} actualizado. Filas afectadas: ${result.changes}`);
        return result.changes > 0; // Devuelve true si al menos una fila fue afectada
    } catch (error) {
        console.error(`Error al actualizar item con ID ${id}:`, error);
        throw error;
    }
  }

  /**
   * Elimina un elemento por su ID.
   * @param {number} id - El ID del elemento a eliminar.
   * @returns {Promise<boolean>} - Promesa que resuelve con true si se eliminó, false si no se encontró.
   */
  async deleteItem(id) {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    console.log(`Eliminando item con ID: ${id}`);
     try {
        const result = await runAsync(this.db, sql, [id]);
        console.log(`Item con ID: ${id} eliminado. Filas afectadas: ${result.changes}`);
        return result.changes > 0; // Devuelve true si al menos una fila fue afectada
    } catch (error) {
        console.error(`Error al eliminar item con ID ${id}:`, error);
        throw error;
    }
  }

  // --- Métodos de manejo de JSON ---

  /**
   * Obtiene todos los elementos de la tabla.
   * @returns {Promise<Array<object>>} - Promesa que resuelve con un array de todos los elementos.
   */
  async getAllItems() {
    const sql = `SELECT * FROM ${this.tableName}`;
    console.log("Obteniendo todos los items...");
    const items = await allAsync(this.db, sql);
    console.log(`Se encontraron ${items.length} items.`);
    return items;
  }

  /**
   * Obtiene todos los elementos y los devuelve como una cadena JSON.
   * @returns {Promise<string>} - Promesa que resuelve con una cadena JSON representando todos los elementos.
   */
  async getAllItemsAsJson() {
    const items = await this.getAllItems();
    return JSON.stringify(items, null, 2); // El '2' es para indentación (opcional)
  }

  /**
   * Reemplaza todos los elementos de la tabla con los proporcionados en un array (o cadena JSON).
   * Usa una transacción para asegurar la atomicidad (todo o nada).
   * @param {Array<object>|string} itemsData - Array de objetos o cadena JSON con los nuevos elementos.
   * @returns {Promise<void>} - Promesa que resuelve cuando la operación ha terminado.
   */
  async setAllItems(itemsData) {
    let itemsArray;
    if (typeof itemsData === 'string') {
      try {
        itemsArray = JSON.parse(itemsData);
      } catch (error) {
        console.error("Error al parsear JSON en setAllItems:", error);
        throw new Error("La cadena proporcionada no es un JSON válido.");
      }
    } else if (Array.isArray(itemsData)) {
      itemsArray = itemsData;
    } else {
      throw new Error("Los datos proporcionados deben ser un array de objetos o una cadena JSON.");
    }

    if (!Array.isArray(itemsArray)) {
        throw new Error("El JSON parseado no resultó en un array.");
    }

    console.log(`Estableciendo todos los items. Se proporcionaron ${itemsArray.length} items.`);

    // Iniciar transacción
    await runAsync(this.db, 'BEGIN TRANSACTION');

    try {
      // 1. Borrar todos los elementos existentes
      console.log(`Borrando todos los items existentes en la tabla ${this.tableName}...`);
      await runAsync(this.db, `DELETE FROM ${this.tableName}`);
      console.log("Items existentes borrados.");

      // 2. Insertar los nuevos elementos
      console.log(`Insertando ${itemsArray.length} nuevos items...`);
      // Podríamos optimizar esto con inserciones múltiples si la base de datos lo soporta bien
      // Pero hacerlo uno por uno es más compatible y simple aquí
      for (const item of itemsArray) {
        // Reutilizar addItem, pero sin la lógica de 'ya existe' dentro de la transacción
         const fields = [
            'id', 'channelId', 'userId', 'username', 'nickname', 'thumbnailUrl',
            'totalAmount', 'totalRewardAmount', 'challengeStartAmount',
            'challengeStartRewardAmount', 'archivedAmount', 'archivedRewardAmount',
            'lastUpsertAt', 'createdAt', 'updatedAt'
         ];
         const placeholders = fields.map(() => '?').join(', ');
         const values = fields.map(field => item[field] !== undefined ? item[field] : null);
         const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
         await runAsync(this.db, sql, values);
      }
      console.log("Nuevos items insertados.");

      // 3. Confirmar la transacción
      await runAsync(this.db, 'COMMIT');
      console.log("Transacción completada exitosamente (COMMIT).");

    } catch (error) {
      // 4. Si hay algún error, deshacer la transacción
      console.error("Error durante la transacción setAllItems. Revirtiendo cambios (ROLLBACK)...", error);
      await runAsync(this.db, 'ROLLBACK');
      console.log("Transacción revertida (ROLLBACK).");
      throw error; // Re-lanzar el error
    }
  }
}

module.exports = DataManager;