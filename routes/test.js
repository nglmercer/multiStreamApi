require('dotenv').config(); // Load .env variables first
const { app, BrowserWindow, ipcMain } = require('electron');
const Config = require('../common/Config');
const path = require('path');
const { TikTokConnector, ConnectorEvents } = require('./api/TikTokConnector'); // Adjust path if needed
const serverManager = require('./servertest'); // Import the server logic
const Ventanas = require('../common/ClsVentanas');
const SERVER_PORT = process.env.SERVER_PORT || 3000; // Port for Express/Socket.IO
new Config(app);
const ventanas = new Ventanas(true);
let mainWindow = null; // Reference to the main window
let winNavegador = null
let connector = null; // Holds the singleton connector instance

// --- Window Creation ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preloadIndex.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`); // Use template literal
    // mainWindow.webContents.openDevTools();
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// --- Electron App Lifecycle ---
app.whenReady().then(() => {
    createWindow();
    serverManager.startServer(SERVER_PORT); // Start the Express/Socket.IO server
    agregarIpMainHandles(); // Call the setup function

    // Set up Socket.IO connection listener AFTER server starts
    serverManager.io.on('connection', (socket) => {
        console.log(`[Server] Socket.IO client connected: ${socket.id}`);
        socket.on('disconnect', () => {
            console.log(`[Server] Socket.IO client disconnected: ${socket.id}`);
        });
        // Listen for connect requests specifically from Socket.IO clients
        socket.on('connect-tiktok', async (data) => {
            console.log(`[Server] Received connect-tiktok request from client: ${socket.id}`);
            // Pass the socket itself (or null/undefined if source is IPC)
            await handleconnectTiktok(socket, data);
        });
        // Add any other specific Socket.IO event listeners from clients here if needed
    });


    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
    if (connector) {
        console.log("App quitting, disconnecting connector...");
        connector.disconnect(true).catch(e => console.error("Error disconnecting on quit:", e));
        connector = null;
    }
});

// --- Event Forwarding Setup ---
const attachForwardingListeners = (connectorInstance) => {
    if (!connectorInstance) return;

    // Clear previous listeners to avoid duplicates on reconnect/restart
    Object.values(ConnectorEvents).forEach(eventName => {
         connectorInstance.removeAllListeners(eventName);
    });

    console.log(`Attaching listeners to TikTokConnector...`);

    // --- Forward Status/Errors via IPC to MainWindow ---
    const forwardStatusToWindow = (eventName, data) => {
        // Check if mainWindow exists and its webContents are not destroyed
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
             try {
                 mainWindow.webContents.send(eventName, data);
             } catch (error) {
                 console.warn(`[Main] Failed to send IPC message "${eventName}" to mainWindow: ${error.message}`);
             }
         } else {
             // Optionally log if the window isn't available when an event occurs
             // console.log(`[Main] MainWindow not available to forward event: ${eventName}`);
         }
    };

    connectorInstance.on(ConnectorEvents.CONNECTING, (data) => forwardStatusToWindow('connection-status', { status: 'connecting', ...data }));
    connectorInstance.on(ConnectorEvents.CONNECTED, (data) => forwardStatusToWindow('connection-status', { status: 'connected', ...data }));
    connectorInstance.on(ConnectorEvents.DISCONNECTED, (data) => forwardStatusToWindow('connection-status', { status: 'disconnected', ...data }));
    connectorInstance.on(ConnectorEvents.RECONNECTING, (data) => forwardStatusToWindow('connection-status', { status: 'reconnecting', ...data }));
    connectorInstance.on(ConnectorEvents.STREAM_END, (data) => forwardStatusToWindow('connection-status', { status: 'streamEnd', ...data }));
    connectorInstance.on(ConnectorEvents.ERROR, (errorData) => {
        console.error(`[Main] TikTokConnector Error:`, errorData?.message || errorData);
        forwardStatusToWindow('tiktok-error', {
            message: errorData?.message || 'Unknown Connector Error',
            details: errorData
        });
        forwardStatusToWindow('connection-status', { status: 'error', message: errorData?.message || 'Unknown Error' });
    });


    // --- V V V MODIFICATION START V V V ---

    // --- Forward Data Events via Socket.IO Broadcast ---
    console.log(`[Main] Attaching listeners to TikTokConnector for Socket.IO broadcast...`);

    // Define the event KEYS from ConnectorEvents that represent data to be broadcasted
    // These should correspond to the names in TikTokConnector's #allevents array
    // + any connector-specific data events you want to broadcast.
    const dataEventKeysToBroadcast = [
        'GIFT',
        'LIKE',
        'FOLLOW',
        'CHAT',
        'SOCIAL',       // Includes share events
        'SUBSCRIBE',
        'MEMBER',       // Join events
        'ROOM_USER',    // Viewer count updates, etc.
        'EMOTE',        // Specific emote messages
        // Add other data events from ConexionTiktok if you re-emit them
        // 'QUESTION_NEW', // Example

        // Include connector-specific data events if desired
        'STICKERS_UPDATED',
        'GIFTS_UPDATED',
    ];

    // Loop through the defined keys and attach listeners dynamically
    dataEventKeysToBroadcast.forEach(eventKey => {
        const eventName = ConnectorEvents[eventKey]; // Get the actual event name string (e.g., 'gift', 'like')

        if (!eventName) {
            console.warn(`[Main] Event key "${eventKey}" not found in ConnectorEvents. Skipping listener attachment.`);
            return; // Skip if the key doesn't exist in ConnectorEvents
        }

        connectorInstance.on(eventName, (payload) => {
            // Broadcast using the event name itself
            console.log(`[Main] Broadcasting event via Socket.IO: ${eventName}`); // Optional: Log broadcasting
            serverManager.broadcastEvent(eventName, payload); // Use your serverManager's broadcast function
        });

        console.log(`[Main] Attached Socket.IO listener for: ${eventName}`); // Confirm attachment
    });

    // REMOVE the old individual setupBroadcast function and calls:
    // const setupBroadcast = (eventName) => { ... }; // DELETE THIS FUNCTION
    // setupBroadcast(ConnectorEvents.GIFT); // DELETE THIS LINE
    // setupBroadcast(ConnectorEvents.LIKE); // DELETE THIS LINE
    // ... delete all other setupBroadcast calls ...

    // --- ^ ^ ^ MODIFICATION END ^ ^ ^ ---

};


// --- IPC Handlers (Renderer -> Main) ---
ipcMain.on('connect-tiktok', async (event, data) => {
    console.log(`[Main] Received connect request from IPC:`, data);
    // Pass null or undefined for the socket argument as it came from IPC
    await handleconnectTiktok(null, data);
});

// Unified handler for both IPC and Socket.IO connection requests
async function handleconnectTiktok(socket, data) { // socket can be null/undefined if from IPC
    const { username, method, userHash, appVersion } = data;
    const source = socket ? `Socket.IO client ${socket.id}` : 'IPC';

    // Centralized function to send feedback (either via Socket.IO or IPC)
    const sendFeedback = (eventName, feedbackData) => {
        if (socket) {
            // Send back to the specific socket client that requested
            socket.emit(eventName, feedbackData);
            // Optionally broadcast status to all clients too? Decide based on needs.
            // serverManager.broadcastEvent(eventName, feedbackData); // If all clients need status updates
        } else if (mainWindow) {
            // Send back to the main window via IPC
            forwardStatusToWindow(eventName, feedbackData); // Use existing function
        }
    };

    if (!username || !method || !userHash || !appVersion) {
        console.error("[Main] Missing connection parameters from", source);
        sendFeedback('tiktok-error', { message: "Missing connection parameters." });
        return;
    }
    if (method === 'remote' && (!process.env.IP_FIRMA || !process.env.PUERTO)) {
        console.error("[Main] Missing .env variables for remote connection from", source);
        sendFeedback('tiktok-error', { message: "Server not configured for 'remote' connection (missing .env)." });
        return;
    }

    // --- Connector Management ---
    if (connector && connector.currentUsername === username.toLowerCase().replace(/@/g, "") && connector.isConnected) {
        console.log(`[Main] Already connected to ${username}. Request from ${source} ignored.`);
        sendFeedback('connection-status', { status: 'connected', username: connector.currentUsername, message: 'Already connected to this user.' });
        return; // Avoid reconnecting to the same user if already connected
    }

    // If a connector exists (even if connecting or connected to someone else), disconnect it first.
     if (connector) {
        console.log(`[Main] Disconnecting previous connector instance (requested by ${source})...`);
        sendFeedback('connection-status', { status: 'disconnecting', message: 'Switching connection...' });
        try {
            await connector.disconnect(true); // Prevent reconnect of the old one
            connector = null;
        } catch (e) {
            console.error("[Main] Error disconnecting previous connector:", e);
            // Continue trying to connect anyway, but log the error
        }
    }
    // --- End Connector Management ---


    try {
        console.log(`[Main] Initializing TikTokConnector for ${username} (requested by ${source})...`);
        connector = new TikTokConnector(userHash, appVersion, ventanas); // Use the provided hash/version
        attachForwardingListeners(connector); // Attach listeners BEFORE connect

        console.log(`[Main] Attempting connector.connect() for ${username}...`);
        sendFeedback('connection-status', { status: 'connecting', username: username, method: method }); // Inform client

        // Make the actual connection attempt
        const connectResult = await connector.connect(username, method);

        // connect() in the provided TikTokConnector now returns a result object.
        // The actual 'connected' status is confirmed by the 'connected' event listener.
        // We rely on the listeners attached by attachForwardingListeners to send the final 'connected' or 'error' status.
        if (connectResult.res === 'ok') {
             console.log(`[Main] Connector initiation for ${username} successful. Waiting for WebSocket connection event.`);
             // Feedback will be sent by the 'connected' or 'error' event listeners.
        } else {
             // If connector.connect itself fails early (e.g., user not live, sign error)
             console.error(`[Main] Connector.connect failed pre-WebSocket for ${username}:`, connectResult.text);
             sendFeedback('tiktok-error', { message: connectResult.text || 'Connection setup failed' });
             sendFeedback('connection-status', { status: 'error', message: connectResult.text || 'Connection setup failed' });
             if (connector) { // Clean up the failed connector
                 await connector.disconnect(true).catch(e => console.error("Error cleaning up failed connector:", e));
                 connector = null;
             }
        }

    } catch (error) {
        console.error(`[Main] Critial error during connection process for ${username} (requested by ${source}):`, error);
        sendFeedback('tiktok-error', { message: `Failed to start connection: ${error.message}` });
        sendFeedback('connection-status', { status: 'error', message: `Failed to start connection: ${error.message}` });
        if (connector) {
            await connector.disconnect(true).catch(e => console.error("Error cleaning up failed connection:", e));
            connector = null;
        }
    }
}

ipcMain.on('disconnect-tiktok', async (event) => {
    console.log(`[Main] Received disconnect request from IPC.`);
    if (connector) {
        try {
            await connector.disconnect(true); // Prevent auto-reconnect
            // The 'disconnected' event listener will fire and send the status update
            console.log(`[Main] Connector disconnect initiated manually.`);
            // Don't set connector = null here immediately, let the disconnected event handle it?
            // Or set it null to prevent further actions. Let's set it null.
            connector = null;
        } catch (e) {
             console.error("[Main] Error during manual disconnect:", e);
             forwardStatusToWindow('tiktok-error', { message: `Disconnect failed: ${e.message}` });
        }
    } else {
        console.log("[Main] Disconnect requested but no active connector found.");
        // Send status update confirming it's disconnected (because it wasn't running)
        forwardStatusToWindow('connection-status', { status: 'disconnected', manuallyTriggered: true, message: 'Connector was not active.' });
    }
});

// Make sure this function is defined and called
function agregarIpMainHandles() {
    ipcMain.handle('invokeFuncion' , handleInvokeFuncion)
}
let cerrarMain = true
let login_local_tiktok = false
handleNoLoginTiktok = (_obj) => {
    if (_obj.estado === undefined){
      console.log(_obj)
      return
    }
    console.log("cerrarMain", _obj)
    console.log("cerrarMain", cerrarMain, login_local_tiktok)
    mainWindow.webContents.send('invokeReceptor', {funcion:"conexionlocallista"})
    try{
      if (_obj.estado && !login_local_tiktok  && !winNavegador){
        handleAbrirNavegador({cerrar: false})
        login_local_tiktok = false
      }
      if (!cerrarMain && !login_local_tiktok){
        winNavegador.close()
      }
    }catch(e){
      // console.log(e)
    }
    // winNavegador.show()
  }
function handleInvokeFuncion(e, obj) {
    // console.log("llego a funcion primeras")
    let res;
    switch (obj.funcion){
        case "noLoginTiktok":                { res = handleNoLoginTiktok(obj) }                break;
        case "iniciarServer":                { res = handleIniciarServer(obj) }                break;
        // Add cases here if needed for specific functions invoked from renderer
        default:{
            console.log("[Main] Received unhandled invokeFuncion call:", obj);
        }
    }
    return res; // Return undefined or a specific result if handled
}
handleIniciarServer = async (obj) => {
    if (obj.metodo === "local" && !login_local_tiktok){
      return {
        res: "error", 
        texto: "error1", 
        evento:"abrirNavegador"}
    }
  
    try{
      winNavegador.close()
    }catch(ex){}
  
    
    USUARIO_VIP = USUARIOS_VIP.includes(obj.usuario) ? obj.usuario : USUARIO_VIP
    USUARIO_VIP_TEMP = obj.usuario
    CONFIG_NOMBRE = obj.config

  
    iniciarTiktokConecter()
  
    try{
      let resCon = await tiktokLiveConnection.connect(obj.metodo)
      if (resCon.res === "ok"){
        METODO_CONEXION = obj.metodo
        serverEncendido = true
        tiktokLiveConnection.obtenerStickers(stickersCallBack)
        return {res: "ok"}
      }else{
        console.log("else")

        // resCon.evento = obj.
        // return false
        return resCon
      }
    }catch(e){
      console.log("Error", e)

      // return false
      // e.evento = obj.metodo
      return e
    }
  
  }
  handleAbrirNavegador = (obj) => {
    console.log(obj)
    if (obj.cerrar !== undefined) cerrarMain = obj.cerrar
    winNavegador = ventanas.crearNavegador(`https://www.tiktok.com/login`, true)
    winNavegador.show()
  }