const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const cors = require('cors');
const app = express();
const port = parseInt(process.env.PORT) || 9001;
const uripath = path.join(__dirname, 'public');
// routes and sockets
const {IOinit, RoomManager} = require('./routes/sockets');


app.use(cors());
app.use(express.json());
app.use(express.static(uripath));
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const roomManager = new RoomManager(io);
IOinit(io, roomManager);
httpServer.listen(port, () => {
console.log(`Server running at http://localhost:${port}`);
});