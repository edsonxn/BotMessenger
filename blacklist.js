const fs = require('fs');
const express = require('express');
const router = express.Router();

const BLACKLIST_FILE = './blacklist.json';

// Función para cargar la lista negra
function getBlacklist() {
    try {
        const data = fs.readFileSync(BLACKLIST_FILE, 'utf8');
        return JSON.parse(data).users;
    } catch (err) {
        console.error('Error leyendo la lista negra:', err.message);
        return [];
    }
}

// Función para agregar un usuario a la lista negra
function addToBlacklist(userId) {
    const data = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
    if (!data.users.includes(userId)) {
        data.users.push(userId);
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2));
    }
}

// Función para eliminar un usuario de la lista negra
function removeFromBlacklist(userId) {
    const data = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
    data.users = data.users.filter(id => id !== userId);
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2));
}

// **API para ver la lista negra**
router.get('/blacklist', (req, res) => {
    res.json({ users: getBlacklist() });
});

// **API para agregar un usuario a la lista negra**
router.post('/blacklist', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send('Falta el userId');

    addToBlacklist(userId);
    res.send(`Usuario ${userId} agregado a la lista negra`);
});

// **API para eliminar un usuario de la lista negra**
router.delete('/blacklist/:userId', (req, res) => {
    const userId = req.params.userId;
    removeFromBlacklist(userId);
    res.send(`Usuario ${userId} eliminado de la lista negra`);
});

// Exporta el router y la función para obtener la lista negra
module.exports = { router, getBlacklist };
