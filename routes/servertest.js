// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const expressApp = express();
const httpServer = http.createServer(expressApp);
const io = new Server(httpServer, {
    // Optional: Configure CORS if clients connect from different origins
    // cors: {
    //   origin: "*", // Allow all origins (adjust for production)
    //   methods: ["GET", "POST"]
    // }
});

let isServerRunning = false;

// --- Express Setup ---
// Serve static files from the 'public' directory
const publicPath = path.join(__dirname, 'public');
console.log(`Serving static files from: ${publicPath}`);
expressApp.use(express.static(publicPath));

// --- Socket.IO Setup ---

// --- Server Management Functions ---
function startServer(port) {
    if (isServerRunning) {
        console.warn(`[Server] Server already running on port ${port}`);
        return;
    }
    httpServer.listen(port, () => {
        isServerRunning = true;
        console.log(`[Server] Express & Socket.IO listening on http://localhost:${port}`);
    }).on('error', (err) => {
        console.error(`[Server] Failed to start server on port ${port}:`, err);
        isServerRunning = false;
        // Optional: Try another port or exit
        if (err.code === 'EADDRINUSE') {
            console.error(`[Server] Port ${port} is already in use.`);
            // Handle appropriately - maybe notify user via Electron window?
        }
    });
}

function broadcastEvent(eventName, data) {
    if (!isServerRunning) {
        // console.warn("[Server] Cannot broadcast event, server not running.");
        return;
    }
    // console.log(`[Server] Broadcasting event: ${eventName}`); // Can be noisy
    io.emit(eventName, data); // Send to ALL connected Socket.IO clients
}

module.exports = {
    startServer,
    broadcastEvent,
    io
    // You could also export 'io' or 'httpServer' if needed elsewhere, but prefer functions
};