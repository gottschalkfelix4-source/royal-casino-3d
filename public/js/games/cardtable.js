import { THREE, Easing } from '../three/engine.js';
import { buildTable, createCard, setCardFace, cardBackTexture, disposeObject } from '../three/assets.js';
import { sound } from '../sound.js';

/**
 * Gemeinsame Kartentisch-Logik: Tisch, Kartenschlitten, Austeil- und Flip-Animationen.
 * Jede Karte besteht aus einem "holder" (Position/Ausrichtung) und dem Karten-Mesh (Vorder-/Rückseite).
 */
export class CardTable {
  constructor(engine, { shoe = [5.4, 0.5, -3.2], felt = '#0f5a3a', size = [14, 9], shoeVisible = true } = {}) {
    this.engine = engine;
    this.shoe = new THREE.Vector3(...shoe);
    this.cards = [];
    // In der Halle steht der echte Tisch schon – dann nur Karten, kein Tisch/Schlitten
    if (!engine.embedded) this.table = buildTable(engine.scene, { width: size[0], depth: size[1], felt });
    if (shoeVisible && !engine.embedded) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.7, 1.9),
        new THREE.MeshPhysicalMaterial({ color: 0x1a1d24, roughness: 0.2, clearcoat: 1, metalness: 0.2 })
      );
      box.position.set(this.shoe.x, 0.35, this.shoe.z);
      box.castShadow = true; box.receiveShadow = true;
      engine.scene.add(box);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.4), new THREE.MeshStandardMaterial({ map: cardBackTexture(), roughness: 0.6 }));
      top.rotation.x = -Math.PI / 2;
      top.position.set(this.shoe.x, 0.71, this.shoe.z);
      engine.scene.add(top);
    }
  }

  /**
   * Karte vom Schlitten an eine Position fliegen lassen.
   * @param {object} card {r,s} oder {hidden:true}
   * @param {object} o pos [x,y,z]; faceUp; upright (stehend, zur Kamera); yaw (Drehung um Hochachse); tilt (Neigung stehender Karten)
   */
  async deal(card, { pos, faceUp = true, upright = false, yaw = 0, tilt = -0.25, duration = 480, scale = 1 } = {}) {
    const holder = new THREE.Group();
    holder.position.copy(this.shoe);
    holder.rotation.x = upright ? tilt : -Math.PI / 2;
    holder.scale.setScalar(scale);
    const mesh = createCard(card?.r ? card : null, { faceUp: false });
    holder.add(mesh);
    holder.userData.mesh = mesh;
    holder.userData.card = card;
    holder.userData.faceUp = false;
    this.engine.scene.add(holder);
    this.cards.push(holder);
    sound.play('deal');
    const from = holder.position.clone();
    const to = new THREE.Vector3(...pos);
    await this.engine.tween(duration, (k) => {
      holder.position.lerpVectors(from, to, k);
      holder.position.y += Math.sin(Math.PI * k) * 0.7;
      holder.rotation.z = yaw * k;
      if (faceUp) mesh.rotation.y = Math.PI * (1 - Easing.inOutQuad(k));
    }, Easing.outCubic);
    holder.position.copy(to);
    holder.rotation.z = yaw;
    if (faceUp) { mesh.rotation.y = 0; holder.userData.faceUp = true; }
    return holder;
  }

  /** Verdeckte Karte umdrehen (optional mit neuem Kartenwert). */
  async flip(holder, card = null, duration = 420) {
    if (card) { setCardFace(holder.userData.mesh, card); holder.userData.card = card; }
    if (holder.userData.faceUp) return;
    const mesh = holder.userData.mesh;
    const y0 = holder.position.y;
    sound.play('flip');
    await this.engine.tween(duration, (k) => {
      mesh.rotation.y = Math.PI * (1 - k);
      holder.position.y = y0 + Math.sin(Math.PI * k) * 0.5;
    }, Easing.inOutQuad);
    holder.position.y = y0;
    mesh.rotation.y = 0;
    holder.userData.faceUp = true;
  }

  /** Karte an eine neue Position/Skalierung bewegen. */
  async move(holder, { pos, scale = null, yaw = null, duration = 450 } = {}) {
    const from = holder.position.clone();
    const to = new THREE.Vector3(...pos);
    const s0 = holder.scale.x;
    const s1 = scale ?? s0;
    const z0 = holder.rotation.z;
    const z1 = yaw ?? z0;
    await this.engine.tween(duration, (k) => {
      holder.position.lerpVectors(from, to, k);
      holder.position.y += Math.sin(Math.PI * k) * 0.3;
      holder.scale.setScalar(s0 + (s1 - s0) * k);
      holder.rotation.z = z0 + (z1 - z0) * k;
    }, Easing.inOutCubic);
    holder.position.copy(to);
  }

  /** Karte wegfliegen lassen und entfernen. */
  async discard(holder, { to = [-8, 1.5, 2], duration = 420 } = {}) {
    const i = this.cards.indexOf(holder);
    if (i >= 0) this.cards.splice(i, 1);
    const from = holder.position.clone();
    const target = new THREE.Vector3(...to);
    await this.engine.tween(duration, (k) => {
      holder.position.lerpVectors(from, target, k);
      holder.rotation.z += 0.08;
    }, Easing.inCubic);
    disposeObject(holder);
  }

  async clear({ to = [-8, 1.5, 2] } = {}) {
    const list = [...this.cards];
    this.cards = [];
    await Promise.all(list.map((c, i) => this.engine.delay(i * 40).then(() => {
      const from = c.position.clone();
      const target = new THREE.Vector3(...to).add(new THREE.Vector3(0, i * 0.02, 0));
      return this.engine.tween(400, (k) => { c.position.lerpVectors(from, target, k); }, Easing.inCubic).then(() => disposeObject(c));
    })));
  }

  clearNow() {
    for (const c of this.cards) disposeObject(c);
    this.cards = [];
  }
}
