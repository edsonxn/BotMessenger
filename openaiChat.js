require('dotenv').config();
const { OpenAI } = require("openai");

const chat = async (prompt, messages) => {
    try {
        const filteredMessages = messages.filter(msg => msg.content && msg.content.trim() !== "");

        if (filteredMessages.length === 0) {
            throw new Error("No se puede enviar un mensaje vacío al modelo.");
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY.trim(),
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: prompt },
                ...filteredMessages,
            ],
        });

        return completion.choices[0].message.content;
    } catch (err) {
        console.error("Error al conectar con OpenAI:", err.message);
        return "Hubo un error al procesar tu solicitud. Intenta nuevamente.";
    }
};

module.exports = chat;
