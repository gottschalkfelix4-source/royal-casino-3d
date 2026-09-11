import { Engine } from '../three/engine.js';
import { h, toast } from '../ui.js';
import { store, setBalance } from '../state.js';
import { chatWidget, playersList } from '../chat.js';
import { hall } from '../views/hall.js';
import { disposeObject } from '../three/assets.js';

/**
 * Engine-Fassade für Spiele, die direkt in der Halle gerendert werden:
 * gleiche API wie Engine, aber Szene = Gruppe auf dem Hallentisch, Kamera = Hallenkamera.
 */
class EmbeddedEngine {
  constructor(host, root, canvas, onDispose) {
    this.host = host;
    this.scene = root;
    this.camera = host.camera;
    this.cameraTarget = host.cameraTarget;
    this.tweener = host.tweener;
    this.quality = host.quality;
    this.embedded = true;
    this.canvas = canvas;
    this.onDispose = onDispose;
    this.updaters = [];
    this.listeners = [];
    const self = this;
    this.renderer = {
      domElement: {
        addEventListener: (t, f, o) => { canvas.addEventListener(t, f, o); self.listeners.push([t, f, o]); },
        removeEventListener: (t, f, o) => canvas.removeEventListener(t, f, o),
        getBoundingClientRect: () => canvas.getBoundingClientRect(),
        get style() { return canvas.style; },
      },
      info: host.renderer.info,
      shadowMap: host.renderer.shadowMap,
    };
  }
  addLights() { return {}; }
  addSpot() { return null; }
  setFit() {}
  start() {}
  stop() {}
  moveCamera() { return Promise.resolve(); }
  onUpdate(fn) { const off = this.host.onUpdate(fn); this.updaters.push(off); return off; }
  tween(...args) { return this.host.tween(...args); }
  delay(ms) { return this.host.delay(ms); }
  shake(a) { this.host.shake(a * 0.4); }
  pick(event, objects, recursive = true) {
    if (hall.dragMoved >= 6) return []; // Klick nach Maus-Drag zählt nicht
    return this.host.pick(event, objects, recursive);
  }
  dispose() {
    this.updaters.forEach((f) => f());
    this.listeners.forEach(([t, f, o]) => this.canvas.removeEventListener(t, f, o));
    this.canvas.style.cursor = '';
    this.onDispose?.();
    disposeObject(this.scene);
  }
}

/**
 * Basisklasse für alle Spiele: erstellt 3D-Bühne + Seitenpanel,
 * verwaltet Busy-Zustand, Banner und Guthaben.
 */
export class GameBase {
  constructor(meta) {
    this.meta = meta;
    this.busy = false;
    this.destroyed = false;
  }

  engineOptions() { return {}; }
  buildScene() {}
  buildPanel() {}
  setBusy() {}
  async ready() {}

  mount(root) {
    this.root = root;
    root.innerHTML = '';
    root.className = 'view game-view';
    this.stage = h('div.game-stage');
    this.panel = h('aside.game-panel');
    this.bannerEl = h('div.game-banner', {}, h('div.big'), h('div.sub'));
    this.stage.append(h('a.back-link', { href: '#/' }, '← Lobby'), this.bannerEl);
    root.append(this.stage, this.panel);
    this.panel.append(h('h2', {}, h('span.icon', {}, this.meta.icon), this.meta.name));

    // Spielszene direkt in der Halle (auf dem echten Tisch / im Automaten), sonst eigene transparente Szene
    const mounted = store.user ? hall.mountGame(this.meta.id) : null;
    if (mounted) {
      this.engine = new EmbeddedEngine(hall.engine, mounted.root, hall.canvas, mounted.dispose);
      this.stage.classList.add('embedded');
    } else {
      this.engine = new Engine(this.stage, { ...this.engineOptions(), alpha: true });
    }
    this.buildScene();
    this.buildPanel();
    this.buildTableSection();
    this.engine.start();
    this.ready().catch((e) => toast(e.message, 'error'));
  }

  /** Mitspieler an diesem Tisch + Tisch-Chat (Multiplayer) */
  buildTableSection() {
    this.players = playersList(this.meta.id);
    this.chat = chatWidget({ compact: true, filterGame: this.meta.id });
    this.panel.append(h('div.panel-section', {}, h('div.title', {}, 'Am Tisch'), this.players.el, this.chat.el));
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.bannerTimer);
    this.players?.destroy();
    this.chat?.destroy();
    this.engine?.dispose();
    if (this.root) this.root.className = 'view';
  }

  get balance() { return store.user?.balance ?? 0; }
  setBalance(cents) { setBalance(cents); }

  /** Großes Ergebnis-Banner über der 3D-Szene. */
  banner(text, sub = '', kind = 'info', ms = 2800) {
    clearTimeout(this.bannerTimer);
    this.bannerEl.className = `game-banner ${kind}`;
    this.bannerEl.children[0].textContent = text;
    this.bannerEl.children[1].textContent = sub;
    // Reflow für erneute Animation
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    if (ms > 0) this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  hideBanner() { this.bannerEl.classList.remove('show'); }

  /** Führt eine asynchrone Aktion aus, sperrt Bedienelemente und zeigt Fehler an. */
  async run(fn) {
    if (this.busy || this.destroyed) return;
    this.busy = true;
    this.setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (!this.destroyed) toast(e.message, 'error');
    } finally {
      this.busy = false;
      if (!this.destroyed) this.setBusy(false);
    }
  }

  addDock(...children) {
    this.dock = h('div.game-dock', {}, ...children);
    this.stage.append(this.dock);
    return this.dock;
  }

  addHud(...children) {
    this.hud = h('div.game-hud', {}, ...children);
    this.stage.append(this.hud);
    return this.hud;
  }

  hint(text) {
    this.hintEl ??= h('div.stage-hint');
    this.hintEl.textContent = text;
    if (!this.hintEl.parentNode) this.stage.append(this.hintEl);
    this.hintEl.style.display = text ? '' : 'none';
  }
}
