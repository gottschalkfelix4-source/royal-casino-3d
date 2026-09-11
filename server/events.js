import { EventEmitter } from 'node:events';

/** Interner Ereignisbus, z. B. für Spielrunden -> Echtzeit-Broadcast */
export const bus = new EventEmitter();
bus.setMaxListeners(50);
