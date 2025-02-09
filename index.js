require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const chat = require('./openaiChat'); // Función de OpenAI
const { getHistory, saveMessage } = require('./conversationHistory'); // Manejo del historial

const app = express();
app.use(bodyParser.json());

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

// Ruta para verificar el webhook
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Ruta para manejar mensajes entrantes
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(async (entry) => {
            const webhookEvent = entry.messaging[0];
            //console.log('Mensaje entrante:', webhookEvent);

            const senderId = webhookEvent.sender.id;
            const messageText = webhookEvent.message.text;

            console.log(`ID del remitente: ${senderId}`);
            console.log(`Texto del mensaje: ${messageText}`);

            // Obtener el historial del usuario
            const userHistory = getHistory(senderId);

            // Agregar el mensaje del usuario al historial
            saveMessage(senderId, 'user', messageText);

            // Generar respuesta con OpenAI usando el historial
            const gptResponse = await chat(prompt, [
                ...userHistory,
                { role: "user", content: messageText },
            ]);

            // Guardar la respuesta del bot en el historial
            saveMessage(senderId, 'assistant', gptResponse);

            // Enviar respuesta al usuario
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
