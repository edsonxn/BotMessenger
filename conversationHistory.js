const fs = require('fs');
const path = require('path');

// Ruta del archivo de historial
const historyFile = path.join(__dirname, 'history.json');

// Asegúrate de que el archivo existe
if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify({}), 'utf8');
}

// Función para obtener el historial de un usuario
const getHistory = (userId) => {
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    return data[userId] || [];
};

// Función para guardar un mensaje en el historial
const saveMessage = (userId, role, content) => {
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    if (!data[userId]) {
        data[userId] = [];
    }
    data[userId].push({ role, content });

    // Guardar el historial actualizado
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf8');
};

module.exports = { getHistory, saveMessage };
