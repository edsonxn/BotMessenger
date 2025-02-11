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
const PAGE_ID = "554787744380577"; // Reemplaza con el ID real de tu página


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
const botMessages = new Set(); // Almacenar los mensajes que el bot envió

// Función para enviar mensajes a Messenger
async function sendMessage(senderId, responseText) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                recipient: { id: senderId },
                message: { text: responseText },
            }
        );

        if (response.data.message_id) {
            botMessages.add(response.data.message_id); // Guardar el ID del mensaje enviado
        }

        console.log('Mensaje enviado:', responseText);
    } catch (error) {
        console.error('Error enviando mensaje:', error.response ? error.response.data : error.message);
    }
}


const pausedUsers = {}; // Objeto para almacenar los usuarios en pausa temporal

// 📌 Pausar el bot para un usuario durante 5 minutos
function pauseUser(senderId) {
    const pauseDuration = 5 * 60 * 1000; // 5 minutos en milisegundos
    const pauseUntil = Date.now() + pauseDuration;

    pausedUsers[senderId] = pauseUntil;

    // 📌 Convertir la hora de la pausa a la zona horaria local
    const pauseTimeLocal = new Date(pauseUntil).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

    console.log(`⏸️ Bot pausado para ${senderId} hasta ${pauseTimeLocal}`);
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
                const recipientId = webhookEvent.recipient.id;

                // 📌 Verificar si el mensaje es un "eco" (is_echo: true) -> Mensaje del ADMIN
                // 📌 Verificar si el mensaje es un "eco" (is_echo: true) -> Mensaje del ADMIN
                if (webhookEvent.message && webhookEvent.message.is_echo) {
                    console.log(`🔹 Mensaje de eco detectado en la conversación con ${recipientId}`);

                    // 📌 Si el mensaje NO es del bot, significa que el ADMIN está hablando
                    if (!botMessages.has(webhookEvent.message.mid)) {
                        console.log(`🔹 El ADMINISTRADOR ha enviado un mensaje. Pausando bot.`);
                        pauseUser(recipientId);

                        // 📌 Guardar mensaje del ADMIN en el historial con role: "system"
                        saveMessage(recipientId, 'system', webhookEvent.message.text);
                        console.log(`📥 Mensaje del ADMIN guardado en el historial.`);
                    } else {
                        console.log(`🚫 Mensaje de eco ignorado (enviado por el bot).`);
                    }

                    return;
                }


                // 📩 Mensaje recibido del usuario real
                if (webhookEvent.message && webhookEvent.message.text) {
                    console.log(`📩 MENSAJE RECIBIDO | Usuario: ${senderId} | Texto: ${webhookEvent.message.text}`);

                    // 📌 Guardar el mensaje del usuario en el historial SIEMPRE
                    saveMessage(senderId, 'user', webhookEvent.message.text);
                    console.log(`📥 Mensaje del usuario guardado en el historial.`);

                    // 📌 Verificar si el usuario está en la lista negra
                    const blacklist = getBlacklist();
                    if (blacklist.some(user => user.id === senderId)) {
                        console.log(`⛔ Usuario en lista negra (${senderId}). No se responderá.`);
                        return;
                    }

                    // 📌 Si el usuario está pausado, NO responder pero seguir guardando mensajes
                    if (isUserPaused(senderId)) {
                        console.log(`⏸️ Usuario ${senderId} está pausado. Mensaje guardado pero no se responderá.`);
                        return;
                    }

                    const userHistory = getHistory(senderId);
                    const limitedHistory = userHistory.slice(-8);

                    // 📌 Generar respuesta con OpenAI
                    const gptResponse = await chat(prompt, [
                        ...limitedHistory,
                        { role: "user", content: webhookEvent.message.text },
                    ]);

                    saveMessage(senderId, 'assistant', gptResponse);
                    await sendMessage(senderId, gptResponse);

                    // 📌 QUITAR LA PAUSA cuando el bot responda automáticamente
                    if (pausedUsers[senderId]) {
                        delete pausedUsers[senderId];
                        console.log(`✅ Pausa eliminada para ${senderId} porque el bot respondió.`);
                    }
                }
            });
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});






// Ruta para quitar la pausa de un usuario
app.post('/unpause', (req, res) => {
    const { userId } = req.body;

    if (pausedUsers[userId]) {
        delete pausedUsers[userId]; // Eliminar el usuario de la lista de pausados
        console.log(`✅ Pausa eliminada para ${userId}`);
    }

    res.json({ success: true });
});


// Endpoint para obtener la lista de usuarios pausados
app.get('/paused-users', (req, res) => {
    const pausedList = Object.entries(pausedUsers).map(([id, time]) => ({
        id,
        until: new Date(time).toLocaleString() // Fecha legible
    }));
    res.json({ pausedUsers: pausedList });
});


// Inicia el servidor
const PORT = process.env.PORT || 3090;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
