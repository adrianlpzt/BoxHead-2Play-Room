/**
 * Cliente de red para el multijugador de Boxhead 3D.
 *
 * Envuelve:
 *  1. WebSocket → servidor de señalización (solo para encontrar al peer)
 *  2. RTCPeerConnection + RTCDataChannel → conexión directa entre navegadores
 *
 * Interfaz por callbacks:
 *  - onConnected()        — el DataChannel está abierto, se puede jugar
 *  - onData(msg)          — llega un mensaje del peer (ya parseado de JSON)
 *  - onDisconnected(reason) — el peer se fue o la conexión se cortó
 *  - onError(msg)         — error de señalización o de conexión
 *  - onRoomCreated(code)  — sala creada, esperando al peer
 *  - onPeerJoined()       — el peer acaba de conectar a la sala
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class Net {
  constructor() {
    this.ws = null;
    this.pc = null;
    this.dc = null;
    this.role = null; // 'host' | 'guest'
    this.connected = false;
    this.roomCode = null;

    // Callbacks — el consumidor los sobreescribe.
    this.onConnected = () => {};
    this.onData = () => {};
    this.onDisconnected = () => {};
    this.onError = () => {};
    this.onRoomCreated = () => {};
    this.onPeerJoined = () => {};
  }

  /** URL del servidor de señalización. */
  get signalURL() {
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return `ws://${loc.hostname}:3001`;
    }
    // Servicio de señalización de Railway.
    return window.__SIGNAL_URL || 'wss://boxhead-signal-production.up.railway.app';
  }

  // ---------------------------------------------------------- señalización

  #connectSignal() {
    return new Promise((resolve, reject) => {
      const url = this.signalURL;
      console.log('[Net] Conectando a señalización:', url);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('No se pudo conectar al servidor de señalización'));
      this.ws.onclose = () => {
        // Si aún no hay DataChannel, es un fallo de señalización.
        if (!this.connected) this.onError('Conexión con el servidor perdida');
      };
      this.ws.onmessage = (e) => this.#onSignal(JSON.parse(e.data));
    });
  }

  #sendSignal(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  #onSignal(msg) {
    switch (msg.type) {
      case 'created':
        this.roomCode = msg.room;
        this.role = 'host';
        this.onRoomCreated(msg.room);
        break;
      case 'joined':
        this.role = msg.role;
        break;
      case 'peer-joined':
        this.onPeerJoined();
        // El host inicia la oferta WebRTC al saber que el guest llegó.
        if (this.role === 'host') this.#createOffer();
        break;
      case 'signal':
        this.#handleRTCSignal(msg.data);
        break;
      case 'peer-left':
        this.disconnect('El otro jugador se fue');
        break;
      case 'error':
        this.onError(msg.msg);
        break;
    }
  }

  // ---------------------------------------------------------- WebRTC

  #setupPC() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.#sendSignal({ type: 'signal', data: { ice: e.candidate } });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' || s === 'disconnected' || s === 'closed') {
        this.disconnect('Conexión WebRTC perdida');
      }
    };
  }

  async #createOffer() {
    this.#setupPC();

    // El host crea el DataChannel.
    this.dc = this.pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
    this.#wireDataChannel(this.dc);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.#sendSignal({ type: 'signal', data: { sdp: this.pc.localDescription } });
  }

  async #handleRTCSignal(data) {
    if (data.sdp) {
      if (!this.pc) {
        // El guest recibe la oferta: crea su PC y responde.
        this.#setupPC();
        this.pc.ondatachannel = (e) => {
          this.dc = e.channel;
          this.#wireDataChannel(this.dc);
        };
      }
      await this.pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.#sendSignal({ type: 'signal', data: { sdp: this.pc.localDescription } });
      }
    }
    if (data.ice) {
      try {
        await this.pc.addIceCandidate(data.ice);
      } catch { /* candidato tardío o inválido, ignorar */ }
    }
  }

  #wireDataChannel(dc) {
    dc.onopen = () => {
      console.log('[Net] DataChannel abierto — conexión directa establecida');
      this.connected = true;
      this.onConnected();
    };
    dc.onmessage = (e) => {
      try {
        this.onData(JSON.parse(e.data));
      } catch { /* mensaje no-JSON, ignorar */ }
    };
    dc.onclose = () => {
      if (this.connected) this.disconnect('DataChannel cerrado');
    };
  }

  // ---------------------------------------------------------- API pública

  /** Crea una sala y espera a un peer. */
  async createRoom() {
    await this.#connectSignal();
    this.#sendSignal({ type: 'create' });
  }

  /** Se une a una sala existente por código. */
  async joinRoom(code) {
    await this.#connectSignal();
    this.#sendSignal({ type: 'join', room: code });
  }

  /** Envía datos al peer (objeto → JSON). Protegido con try/catch: un mensaje
   *  demasiado grande o un canal saturado lanzan excepción que, sin capturar,
   *  rompería el bucle de juego. */
  send(obj) {
    if (this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(JSON.stringify(obj));
      } catch (e) {
        console.warn('[Net] send falló:', e.message);
      }
    }
  }

  /** true si el buffer del canal tiene sitio (evita encolar y perder snapshots). */
  canSend() {
    return this.dc && this.dc.readyState === 'open' && this.dc.bufferedAmount < 256 * 1024;
  }

  /** Cierra todo limpiamente. */
  disconnect(reason = 'Desconexión manual') {
    this.connected = false;
    this.dc?.close();
    this.pc?.close();
    this.ws?.close();
    this.dc = null;
    this.pc = null;
    this.ws = null;
    this.onDisconnected(reason);
  }
}
