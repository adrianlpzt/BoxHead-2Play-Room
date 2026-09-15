/**
 * Servidor de señalización para el multijugador de Boxhead 3D.
 *
 * NO es un servidor de juego: solo empareja dos navegadores con un código de
 * sala y reenvía los mensajes de señalización WebRTC (SDP offer/answer y
 * candidatos ICE). En cuanto el DataChannel queda establecido, la conexión de
 * datos va directa entre los dos PCs — el servidor ya no interviene.
 *
 * Protocolo (JSON sobre WebSocket):
 *   Cliente → Servidor:
 *     { type: "create" }           → crea una sala, responde con { type: "created", room: "ABCD" }
 *     { type: "join", room: "..." } → se une a la sala, si existe y no está llena
 *     { type: "signal", data: ... } → reenvía al otro peer
 *
 *   Servidor → Cliente:
 *     { type: "created", room: "ABCD" }
 *     { type: "joined", role: "host"|"guest" }
 *     { type: "peer-joined" }       → avisa al host de que su peer llegó
 *     { type: "signal", data: ... } → señal del otro peer
 *     { type: "peer-left" }         → el otro se fue
 *     { type: "error", msg: "..." }
 */
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3001;
const rooms = new Map();

function genCode() {
  // 4 caracteres alfanuméricos en mayúscula, ~1,7 millones de combinaciones.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I/O/0/1 para evitar confusiones
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Señalización escuchando en :${PORT}`);

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return send(ws, { type: 'error', msg: 'JSON inválido' });
    }

    switch (msg.type) {
      case 'create': {
        // Genera un código único.
        let code;
        let guard = 0;
        do { code = genCode(); } while (rooms.has(code) && ++guard < 100);
        if (guard >= 100) return send(ws, { type: 'error', msg: 'Sin códigos libres' });

        rooms.set(code, { host: ws, guest: null });
        ws.roomCode = code;
        ws.role = 'host';
        send(ws, { type: 'created', room: code });
        console.log(`Sala ${code} creada`);
        break;
      }

      case 'join': {
        const code = (msg.room || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) return send(ws, { type: 'error', msg: 'Sala no encontrada' });
        if (room.guest) return send(ws, { type: 'error', msg: 'Sala llena' });

        room.guest = ws;
        ws.roomCode = code;
        ws.role = 'guest';
        send(ws, { type: 'joined', role: 'guest' });
        send(room.host, { type: 'peer-joined' });
        console.log(`Sala ${code}: guest unido`);
        break;
      }

      case 'signal': {
        // Reenvía la señal al otro peer de la sala.
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const other = ws === room.host ? room.guest : room.host;
        if (other && other.readyState === 1) {
          send(other, { type: 'signal', data: msg.data });
        }
        break;
      }

      default:
        send(ws, { type: 'error', msg: `Tipo desconocido: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    // Avisa al otro y cierra la sala.
    const other = ws === room.host ? room.guest : room.host;
    if (other && other.readyState === 1) {
      send(other, { type: 'peer-left' });
    }
    rooms.delete(ws.roomCode);
    console.log(`Sala ${ws.roomCode} cerrada`);
  });
});

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// Limpieza de salas zombis cada 5 minutos.
setInterval(() => {
  for (const [code, room] of rooms) {
    const hostAlive = room.host && room.host.readyState === 1;
    if (!hostAlive) {
      if (room.guest && room.guest.readyState === 1) {
        send(room.guest, { type: 'peer-left' });
      }
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);
