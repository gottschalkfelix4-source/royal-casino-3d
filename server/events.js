import { EventEmitter } from 'node:events';

/** Interner Ereignisbus, z. B. für Spielrunden -> Echtzeit-Broadcast */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Session-Tokens, die gerade per WebSocket in der Halle verbunden sind (vom Realtime-Server gepflegt) */
export const live = { tokens: new Set() };
