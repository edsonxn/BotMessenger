require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const chat = require('./openaiChat'); // Función de OpenAI
const { getHistory, saveMessage } = require('./conversationHistory'); // Manejo del historial
const { router: blacklistRoutes, getBlacklist } = require('./blacklist'); // Importa el router correctamente

const app = express();
app.use(bodyParser.json());

app.use(blacklistRoutes); // Usa correctamente las rutas de la blacklist

// Endpoint para pausar el bot por 5 minutos para un usuario
app.post('/pause-user', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).send('Falta el userId');
    }

    pauseUser(userId);
    console.log(`Bot desactivado para ${userId} durante 5 minutos.`);
    res.send(`Bot desactivado para ${userId} durante 5 minutos.`);
});


const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'xboxhalo3';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// Leer la personalidad del archivo `personalidad.txt`
const personalityFile = './personalidad.txt';
let prompt = '';

try {
    prompt = fs.readFileSync(personalityFile, 'utf8').trim();
} catch (err) {
    console.error('Error leyendo el archivo personalidad.txt:', err.message);
    prompt = 'Eres un asistente amigable y profesional.'; // Valor por defecto
}

// Función para enviar mensajes a Messenger
async function sendMessage(senderId, responseText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                recipient: { id: senderId },
                message: { text: responseText },
            }
        );
        console.log('Mensaje enviado:', responseText);
    } catch (error) {
        console.error('Error enviando mensaje:', error.response ? error.response.data : error.message);
    }
}

const pausedUsers = {}; // Objeto para almacenar los usuarios en pausa temporal

// Función para pausar un usuario por 5 minutos
function pauseUser(senderId) {
    pausedUsers[senderId] = Date.now() + 5 * 60 * 1000; // Tiempo actual + 5 minutos
}

// Función para verificar si un usuario está pausado
function isUserPaused(senderId) {
    return pausedUsers[senderId] && Date.now() < pausedUsers[senderId];
}


// Ruta para verificar el webhook
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(async (entry) => {
            const webhookEvent = entry.messaging[0];
            const senderId = webhookEvent.sender.id;
            const messageText = webhookEvent.message.text;

            console.log(`ID del remitente: ${senderId}`);
            console.log(`Texto del mensaje: ${messageText}`);

            // 📌 Si el usuario está en la lista negra, no responder
            const blacklist = getBlacklist();
            if (blacklist.some(user => user.id === senderId)) {
                console.log(`Usuario en lista negra detectado (${senderId}). No se responderá.`);
                return;
            }

            // 📌 Si el usuario está pausado, no responder
            if (isUserPaused(senderId)) {
                console.log(`Usuario ${senderId} está pausado. No se responderá.`);
                return;
            }

            // Continuar con la lógica del bot...
            const userHistory = getHistory(senderId);
            const limitedHistory = userHistory.slice(-8);
            saveMessage(senderId, 'user', messageText);

            const gptResponse = await chat(prompt, [
                ...limitedHistory,
                { role: "user", content: messageText },
            ]);

            saveMessage(senderId, 'assistant', gptResponse);
            await sendMessage(senderId, gptResponse);
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});


// Inicia el servidor
const PORT = process.env.PORT || 3090;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
