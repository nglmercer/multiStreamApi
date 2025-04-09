const LocalStorageManager = require('../store/LocalStorageManager');
const store = new LocalStorageManager();

(async () => {
  await store.setItem('username', 'Juan');
  await store.setItem('settings', { theme: 'dark', notifications: true });

  const username = await store.getItem('username'); // 'Juan'
  const settingsStr = await store.getItem('settings'); // '{"theme":"dark","notifications":true}'
  const settings = JSON.parse(settingsStr); // objeto usable

  console.log('username:', username);
  console.log('settings:', settings);

//  await store.removeItem('username');

  const allKeys = await store.keys();
  const alldata = await store.getAllItems();
  console.log('Claves guardadas:', allKeys, alldata);
  await store.setItems(alldata);

/*   await store.clear();

  store.close(); */
})();
