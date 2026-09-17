// URL de Google Apps Script
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyQjGWpp-9BT1mAkE0JDPJVegcCz4T6pQdPeIWnqIjh5W3b_1uY8Mj9T644XO4LKjNrbA/exec";

// Elementos del DOM
const muro = document.getElementById("muro");
const contador = document.getElementById("contador");
const pulseDot = document.querySelector(".pulse-dot");

// Estado
let lastDataLength = -1;
let readMessages = new Set(JSON.parse(localStorage.getItem('leidos') || '[]'));

function saveReadMessages() {
    localStorage.setItem('leidos', JSON.stringify(Array.from(readMessages)));
}

function getMsgId(key) {
    let hash = 0;
    const str = String(key);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return "id_" + Math.abs(hash);
}

async function cargarMensajes() {
    // Mostrar loader solo en la primera carga
    const isFirstLoad = (lastDataLength === -1);
    if (isFirstLoad) {
        muro.innerHTML = `
            <div class="loader-container">
                <div class="cyber-loader"></div>
                <div class="status-msg">Extrayendo datos clasificados...</div>
            </div>
        `;
    }

    try {
        const res = await fetch(SCRIPT_URL);
        const data = await res.json();

        // Si no hay datos
        if (!data || data.length === 0) {
            muro.innerHTML = `
                <div class="loader-container">
                    <div class="status-msg">No hay secretos revelados todavía.</div>
                </div>`;
            contador.textContent = "0 REGISTROS";
            pulseDot.style.backgroundColor = "#ff2a2a";
            pulseDot.style.boxShadow = "0 0 10px #ff2a2a";
            lastDataLength = 0;
            return;
        }

        contador.textContent = `${data.length} CONFESIONES ENCONTRADAS`;
        pulseDot.style.backgroundColor = "#00ff00";
        pulseDot.style.boxShadow = "0 0 10px #00ff00";

        const loader = muro.querySelector('.loader-container');
        if (loader) loader.remove();

        // 1. Asignar IDs únicos e inmutables basados en la fecha y posición
        const occurrences = {};
        data.forEach(item => {
            const baseKey = String(item.fecha);
            occurrences[baseKey] = (occurrences[baseKey] || 0) + 1;
            item._uniqueId = getMsgId(baseKey + "_" + occurrences[baseKey]);
        });

        // 2. Preparar datos entrantes y los que ya existen en el DOM
        const incomingData = data.slice().reverse();
        const existingItems = Array.from(muro.querySelectorAll('.item'));
        const existingMap = new Map();
        existingItems.forEach(el => existingMap.set(el.getAttribute('data-id'), el));

        // 3. Sincronizar DOM (Crear, Editar, Reordenar)
        incomingData.forEach((item, index) => {
            const msgId = item._uniqueId;
            const existingEl = existingMap.get(msgId);

            if (existingEl) {
                // El mensaje existe, comprobar si el texto fue editado
                const textoEl = existingEl.querySelector('.texto');
                const newHtml = escapeHtml(item.mensaje);
                
                if (textoEl.innerHTML !== newHtml) {
                    textoEl.innerHTML = newHtml;
                    // Efecto visual sutil para indicar que el texto cambió
                    existingEl.style.transition = 'none';
                    existingEl.style.boxShadow = '0 0 25px rgba(176, 38, 255, 0.8)';
                    setTimeout(() => {
                        existingEl.style.transition = 'all 0.5s ease';
                        existingEl.style.boxShadow = '';
                    }, 100);
                }

                existingMap.delete(msgId); // Lo sacamos del mapa para saber que no fue eliminado

                // Asegurar que el orden en el DOM es el correcto (por si se insertaron filas entre medio)
                if (muro.children[index] !== existingEl) {
                    if (index === 0) {
                        muro.insertAdjacentElement('afterbegin', existingEl);
                    } else {
                        const prev = muro.children[index - 1];
                        if (prev) prev.insertAdjacentElement('afterend', existingEl);
                    }
                }
            } else {
                // Es un mensaje completamente nuevo
                const delay = isFirstLoad ? (index * 0.1) : 0;
                const isLeido = readMessages.has(msgId);
                const leidoClass = isLeido ? ' leido' : '';
                const btnText = isLeido ? 'Desmarcar' : 'Marcar como leído';
                
                const html = `
                    <div class="item${leidoClass}" data-id="${msgId}" style="animation-delay: ${delay}s">
                        <div class="texto">${escapeHtml(item.mensaje)}</div>
                        <button class="btn-leido" onclick="marcarLeido(this)">${btnText}</button>
                    </div>
                `;
                
                if (index === 0) {
                    muro.insertAdjacentHTML('afterbegin', html);
                } else {
                    const prev = muro.children[index - 1];
                    if (prev) {
                        prev.insertAdjacentHTML('afterend', html);
                    } else {
                        muro.insertAdjacentHTML('beforeend', html);
                    }
                }
            }
        });

        // 4. Eliminar del DOM los mensajes que fueron borrados en Google Sheets
        existingMap.forEach(el => el.remove());

        lastDataLength = data.length;

    } catch (err) {
        if (lastDataLength === -1) {
            muro.innerHTML = `
                <div class="loader-container">
                    <div class="status-msg" style="color: var(--primary-red)">[ ERROR CRÍTICO DE CONEXIÓN ]</div>
                </div>`;
        }
        contador.textContent = "SISTEMA FUERA DE LÍNEA";
        pulseDot.style.backgroundColor = "#ff2a2a";
        pulseDot.style.boxShadow = "0 0 10px #ff2a2a";
    }
}

// Utilidad para evitar XSS
function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

// Lógica para marcar/desmarcar como leído
window.marcarLeido = function(btn) {
    const item = btn.closest('.item');
    if (item) {
        const msgId = item.getAttribute('data-id');
        item.classList.toggle('leido');
        if (item.classList.contains('leido')) {
            btn.textContent = "Desmarcar";
            readMessages.add(msgId);
        } else {
            btn.textContent = "Marcar como leído";
            readMessages.delete(msgId);
        }
        saveReadMessages();
    }
};

// Carga inicial
cargarMensajes();

// Actualiza automáticamente cada 10 segundos
setInterval(cargarMensajes, 10000);
