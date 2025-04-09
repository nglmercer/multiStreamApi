// routes/getFiles.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
router.get('/media/*', (req, res) => {
    const requestedPath = decodeURIComponent(req.params[0]);
    const filePath = path.resolve(requestedPath);
    const extname = path.extname(filePath).toLowerCase();
    const imageobj = {
        '.jpg': 'jpeg',
        '.jpeg': 'jpeg',
        '.png': 'png',
        '.gif': 'gif',
        '.webp': 'webp',
        '.svg': 'svg+xml',
        '.bmp': 'bmp',
        '.ico': 'x-icon',
        '.tiff': 'tiff',
        '.avif': 'avif',
        '.apng': 'apng'
    };

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).send('File not found');
        }

        if (extname === '.mp3' || extname === '.wav') {
            res.setHeader('Content-Type', 'audio/' + extname.slice(1));
        } else if (extname === '.mp4' || extname === '.webm') {
            // Para videos, verificar que estén en formato compatible
            res.setHeader('Content-Type', 'video/' + extname.slice(1));
        } else if (imageobj[extname]) {
            res.setHeader('Content-Type', 'image/' + imageobj[extname]);
        } else {
            return res.status(415).send('Unsupported file type');
        }

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    });
});