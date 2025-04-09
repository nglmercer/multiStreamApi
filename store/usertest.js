// main.js
const path = require('path');
const DatabaseInitializer = require('./DatabaseInitializer');
const DataManager = require('./UserStorage');

// Configuración de la base de datos y tabla
const dbPath = path.join(__dirname, 'data', 'mydatabase.db'); // Guarda la BD en una carpeta 'data'
const itemsTableConfig = {
  tableName: 'items',
  createQuery: `
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        channelId INTEGER,
        userId TEXT,
        username TEXT,
        nickname TEXT,
        thumbnailUrl TEXT,
        totalAmount INTEGER,
        totalRewardAmount INTEGER,
        challengeStartAmount INTEGER,
        challengeStartRewardAmount INTEGER,
        archivedAmount INTEGER,
        archivedRewardAmount INTEGER,
        lastUpsertAt TEXT,
        createdAt TEXT,
        updatedAt TEXT
    );`
};

// Datos de ejemplo (similares a tu estructura)
const item1 = {
  id: 43899222,
  channelId: 94462,
  userId: "179960254254706688",
  username: "karol.herrera.18",
  nickname: "Karol Herrera 🌻",
  thumbnailUrl: "p16-va.tiktokcdn.com/musically-maliva-obj/1613268504241158~c5_100x100.webp",
  totalAmount: 37,
  totalRewardAmount: 37,
  challengeStartAmount: 0,
  challengeStartRewardAmount: 0,
  archivedAmount: 37,
  archivedRewardAmount: 37,
  lastUpsertAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const item2 = {
  id: 43899223, // ID diferente
  channelId: 94463,
  userId: "179960254254706699",
  username: "juan.perez.10",
  nickname: "Juan Perez",
  thumbnailUrl: "example.com/thumb2.webp",
  totalAmount: 100,
  totalRewardAmount: 50,
  challengeStartAmount: 10,
  challengeStartRewardAmount: 5,
  archivedAmount: 90,
  archivedRewardAmount: 45,
  lastUpsertAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const item1_updated = {
    nickname: "Karol Herrera ✨", // Nickname actualizado
    totalAmount: 50,             // Monto actualizado
    updatedAt: new Date().toISOString() // Fecha de actualización nueva
};

const newItemsJson = JSON.stringify([
  { id: 50000001, channelId: 101, userId: "user_a", username: "usera", nickname: "User A", thumbnailUrl: "a.png", totalAmount: 10, totalRewardAmount: 10, challengeStartAmount: 0, challengeStartRewardAmount: 0, archivedAmount: 10, archivedRewardAmount: 10, lastUpsertAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 50000002, channelId: 102, userId: "user_b", username: "userb", nickname: "User B", thumbnailUrl: "b.png", totalAmount: 20, totalRewardAmount: 20, challengeStartAmount: 5, challengeStartRewardAmount: 5, archivedAmount: 15, archivedRewardAmount: 15, lastUpsertAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
], null, 2);


// Función principal asíncrona para usar await
async function runDatabaseOperations() {
const dbInitializer = new DatabaseInitializer(dbPath, [itemsTableConfig]); // <-- Envuelve itemsTableConfig en un array 
  let db;
  let dataManager;

  try {
    db = await dbInitializer.initialize();
    dataManager = new DataManager(db);

    console.log("\n--- OPERACIONES CRUD ---");

    // 1. Añadir items
    console.log("\n[Añadir Item 1]");
    await dataManager.addItem(item1);
    console.log("\n[Añadir Item 2]");
    // Intentar añadir el mismo item de nuevo (debería fallar o ser ignorado si ya existe)
    // await dataManager.addItem(item1); // Descomentar para probar la restricción PRIMARY KEY
    await dataManager.addItem(item2);


    // 2. Obtener un item por ID
    console.log("\n[Obtener Item 1 por ID]");
    const fetchedItem1 = await dataManager.getItemById(item1.id);
    console.log("Item obtenido:", fetchedItem1);

    console.log("\n[Obtener Item con ID inexistente]");
    const nonExistentItem = await dataManager.getItemById(99999999);
    console.log("Item obtenido:", nonExistentItem); // Debería ser null


    // 3. Actualizar un item
    console.log("\n[Actualizar Item 1]");
    const updated = await dataManager.updateItem(item1.id, item1_updated);
    console.log("¿Item 1 actualizado?", updated);
    const fetchedItem1_afterUpdate = await dataManager.getItemById(item1.id);
    console.log("Item 1 después de actualizar:", fetchedItem1_afterUpdate);

    // Intentar actualizar item inexistente
    console.log("\n[Actualizar Item con ID inexistente]");
    const updatedNonExistent = await dataManager.updateItem(99999999, { nickname: "Fantasma" });
    console.log("¿Item inexistente actualizado?", updatedNonExistent); // Debería ser false


    // 4. Obtener todos los items
    console.log("\n[Obtener Todos los Items]");
    const allItems = await dataManager.getAllItems();
    console.log("Todos los items:", allItems);


    // 5. Eliminar un item
    console.log("\n[Eliminar Item 2]");
    const deleted = await dataManager.deleteItem(item2.id);
    console.log("¿Item 2 eliminado?", deleted);

    // Intentar eliminar item inexistente
    console.log("\n[Eliminar Item con ID inexistente]");
    const deletedNonExistent = await dataManager.deleteItem(99999999);
    console.log("¿Item inexistente eliminado?", deletedNonExistent); // Debería ser false

    console.log("\n[Obtener Todos los Items después de eliminar]");
    const allItemsAfterDelete = await dataManager.getAllItems();
    console.log("Items restantes:", allItemsAfterDelete);


    console.log("\n--- OPERACIONES JSON ---");

    // 6. Obtener todos como JSON
    console.log("\n[Obtener Todos como JSON]");
    const allItemsJson = await dataManager.getAllItemsAsJson();
    console.log("Items como JSON:\n", allItemsJson);


    // 7. Establecer todos desde JSON
    console.log("\n[Establecer Todos desde JSON]");
    await dataManager.setAllItems(newItemsJson); // Puede ser la cadena JSON o el array parseado

    console.log("\n[Obtener Todos los Items después de setAllItems]");
    const allItemsAfterSet = await dataManager.getAllItems();
    console.log("Items después de setAllItems:", allItemsAfterSet);


  } catch (error) {
    console.error("\n*** Error en la ejecución principal: ***", error);
  } finally {
    // Asegurarse de cerrar la conexión
    if (dbInitializer) {
      await dbInitializer.close();
    }
  }
}

// Ejecutar la función principal
runDatabaseOperations();