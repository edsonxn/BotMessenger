const fs = require('fs');
const express = require('express');
const axios = require('axios');
const router = express.Router();

const BLACKLIST_FILE = './blacklist.json';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN; // Token de Facebook

// Función para obtener la lista negra
function getBlacklist() {
    try {
        const data = fs.readFileSync(BLACKLIST_FILE, 'utf8');
        return JSON.parse(data).users;
    } catch (err) {
        console.error('Error leyendo la lista negra:', err.message);
        return [];
    }
}

// Función para obtener el nombre del usuario desde Facebook Messenger
async function getUserName(userId) {
    try {
        const response = await axios.get(`https://graph.facebook.com/v18.0/${userId}?fields=first_name,last_name&access_token=${PAGE_ACCESS_TOKEN}`);
        return `${response.data.first_name} ${response.data.last_name}`;
    } catch (error) {
        console.error(`Error obteniendo el nombre del usuario ${userId}:`, error.message);
        return "Desconocido"; // Valor por defecto si no se puede obtener
    }
}

// Agregar usuario a la lista negra con ID y Nombre
router.post('/blacklist', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send('Falta el userId');

    try {
        const data = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
        const existingUser = data.users.find(user => user.id === userId);

        if (!existingUser) {
            const userName = await getUserName(userId);
            data.users.push({ id: userId, name: userName });
            fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2));
        }

        res.send(`Usuario ${userId} agregado a la lista negra con nombre.`);
    } catch (error) {
        res.status(500).send('Error al agregar usuario.');
    }
});

// Eliminar usuario de la lista negra
router.delete('/blacklist/:userId', (req, res) => {
    const userId = req.params.userId;
    try {
        const data = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
        data.users = data.users.filter(user => user.id !== userId);
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2));
        res.send(`Usuario ${userId} eliminado de la lista negra.`);
    } catch (error) {
        res.status(500).send('Error al eliminar usuario.');
    }
});

// Obtener la lista negra
router.get('/blacklist', (req, res) => {
    res.json({ users: getBlacklist() });
});

module.exports = { router, getBlacklist };
