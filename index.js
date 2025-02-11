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

// 📌 Pausar el bot para un usuario durante 5 minutos
function pauseUser(senderId) {
    pausedUsers[senderId] = Date.now() + 5 * 60 * 1000; // Tiempo actual + 5 minutos
    console.log(`⏸️ Bot pausado para ${senderId} hasta ${new Date(pausedUsers[senderId]).toLocaleTimeString()}`);
}

// 📌 Verificar si un usuario está pausado
function isUserPaused(senderId) {
    if (pausedUsers[senderId] && Date.now() < pausedUsers[senderId]) {
        console.log(`⏳ Usuario ${senderId} sigue pausado hasta ${new Date(pausedUsers[senderId]).toLocaleTimeString()}`);
        return true;
    }
    return false;
}




// Ruta para verificar el webhook
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(async (entry) => {
            entry.messaging.forEach(async (webhookEvent) => {
                const senderId = webhookEvent.sender.id;
                const recipientId = webhookEvent.recipient.id; // 📌 ID del usuario con quien se habla

                // 📌 Si el mensaje fue enviado por el ADMIN (is_echo: true)
                if (webhookEvent.message && webhookEvent.message.is_echo) {
                    console.log(`🔹 El ADMINISTRADOR ha enviado un mensaje a ${recipientId}`);
                    pauseUser(recipientId); // Pausar al usuario correcto
                    return;
                }

                // 📩 Mensaje recibido del usuario real
                if (webhookEvent.message && webhookEvent.message.text) {
                    console.log(`📩 MENSAJE RECIBIDO | Usuario: ${senderId} | Texto: ${webhookEvent.message.text}`);

                    const blacklist = getBlacklist();
                    if (blacklist.some(user => user.id === senderId)) {
                        console.log(`⛔ Usuario en lista negra (${senderId}). No se responderá.`);
                        return;
                    }

                    if (isUserPaused(senderId)) {
                        console.log(`⏸️ Usuario ${senderId} está pausado. No se responderá.`);
                        return;
                    }

                    const userHistory = getHistory(senderId);
                    const limitedHistory = userHistory.slice(-8);
                    saveMessage(senderId, 'user', webhookEvent.message.text);

                    const gptResponse = await chat(prompt, [
                        ...limitedHistory,
                        { role: "user", content: webhookEvent.message.text },
                    ]);

                    saveMessage(senderId, 'assistant', gptResponse);
                    await sendMessage(senderId, gptResponse);
                }
            });
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
