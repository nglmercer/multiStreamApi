const express = require('express');
const router = express.Router();
const { getOrCreatePlatformConnection } = require('../routes/sockets');

router.get('/getRoomInfo', async (req, res) => {
    const { platform, uniqueId } = req.query;
    try {
        const connectionPlatform = await getOrCreatePlatformConnection(platform, uniqueId);
        if (connectionPlatform && connectionPlatform.getRoomInfo) {
            const roomInfo = await connectionPlatform.getRoomInfo();
            res.send(roomInfo);
        }
    } catch (error) {
        res.status(500).send(error.message);
    }
});
router.get('/getAvailableGifts', async (req, res) => {
    const { platform, uniqueId } = req.query;
    try {
        const connectionPlatform = await getOrCreatePlatformConnection(platform, uniqueId);
        if (connectionPlatform && connectionPlatform.getAvailableGifts) {
            const availableGifts = await connectionPlatform.getAvailableGifts();
            res.send(availableGifts);
        }
    } catch (error) {
        res.status(500).send(error.message);
    }
});