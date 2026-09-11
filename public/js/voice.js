import { rt } from './realtime.js';
import { toast } from './ui.js';

/**
 * Sprachchat: WebRTC-Mesh zwischen allen Spielern, Signalisierung über den WebSocket.
 * Lautstärke hängt von der Entfernung in der Halle ab (nah = laut, ab ~9 m stumm),
 * damit sich Spieler an verschiedenen Tischen nicht gegenseitig stören.
 */
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const NEAR = 2.2;   // bis hier volle Lautstärke
const FAR = 9;      // ab hier stumm

export const voice = {
  enabled: false,
  stream: null,
  peers: new Map(), // id -> { pc, audio, polite }
  listeners: new Set(),

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) fn(this); },

  async enable() {
    if (this.enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Sprachchat braucht HTTPS (oder localhost) – der Browser gibt das Mikrofon sonst nicht frei.', 'error', 6000);
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      toast(`Mikrofon nicht verfügbar: ${e.message}`, 'error', 5000);
      return;
    }
    this.enabled = true;
    rt.send({ t: 'mic', on: true });
    // Zu allen echten Spielern eine Verbindung aufbauen (bestehende ersetzen, damit unsere Spur mitgeht)
    for (const p of rt.players.values()) if (!p.bot && p.id !== rt.me) this.connect(p.id, true);
    this.emit();
  },

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    rt.send({ t: 'mic', on: false });
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    // Verbindungen behalten, aber ohne eigene Spur neu aushandeln ist aufwendig – daher schließen;
    // Gegenseiten mit Mikro bauen sie beim nächsten Sprechen neu auf.
    for (const id of [...this.peers.keys()]) this.close(id);
    this.emit();
  },

  toggle() { return this.enabled ? this.disable() : this.enable(); },

  close(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.peers.delete(id);
  },

  createPeer(id) {
    this.close(id);
    const pc = new RTCPeerConnection(ICE);
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.volume = 0;
    audio.dataset.peer = id;
    document.body.append(audio);
    const peer = { pc, audio, remoteStream: null };
    this.peers.set(id, peer);
    for (const track of this.stream?.getTracks() ?? []) pc.addTrack(track, this.stream);
    pc.onicecandidate = (e) => { if (e.candidate) rt.send({ t: 'rtc', to: id, data: { candidate: e.candidate } }); };
    pc.ontrack = (e) => {
      peer.remoteStream = e.streams[0] ?? new MediaStream([e.track]);
      audio.srcObject = peer.remoteStream;
      audio.play().catch(() => { /* Autoplay-Sperre bis zur ersten Interaktion */ });
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) this.close(id); };
    return peer;
  },

  async connect(id, initiator) {
    const peer = this.createPeer(id);
    if (!initiator) return peer;
    try {
      const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
      await peer.pc.setLocalDescription(offer);
      rt.send({ t: 'rtc', to: id, data: { sdp: peer.pc.localDescription } });
    } catch (e) { console.warn('WebRTC offer', e); }
    return peer;
  },

  async handleSignal({ from, data }) {
    try {
      if (data.sdp?.type === 'offer') {
        const peer = this.createPeer(from); // Angebot immer annehmen (auch nur zum Zuhören)
        await peer.pc.setRemoteDescription(data.sdp);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        rt.send({ t: 'rtc', to: from, data: { sdp: peer.pc.localDescription } });
      } else if (data.sdp?.type === 'answer') {
        const peer = this.peers.get(from);
        if (peer && peer.pc.signalingState === 'have-local-offer') await peer.pc.setRemoteDescription(data.sdp);
      } else if (data.candidate) {
        const peer = this.peers.get(from);
        if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch (e) { console.warn('WebRTC signal', e); }
  },

  /** Lautstärke aller Mitspieler nach Entfernung setzen */
  updateVolumes(positionOf, myPos) {
    if (!myPos) return;
    for (const [id, peer] of this.peers) {
      const pos = positionOf(id);
      let vol = 1;
      if (pos) {
        const d = Math.hypot(pos.x - myPos.x, pos.z - myPos.z);
        vol = d <= NEAR ? 1 : d >= FAR ? 0 : 1 - (d - NEAR) / (FAR - NEAR);
      }
      peer.audio.volume = Math.max(0, Math.min(1, vol * vol));
    }
  },

  init() {
    rt.on('rtc', (m) => this.handleSignal(m));
    rt.on('join', (p) => { if (this.enabled && !p.bot && p.id !== rt.me) this.connect(p.id, true); });
    rt.on('leave', (p) => this.close(p.id));
    rt.on('disconnect', () => { for (const id of [...this.peers.keys()]) this.close(id); });
    rt.on('connect', () => { if (this.enabled) { rt.send({ t: 'mic', on: true }); for (const p of rt.players.values()) if (!p.bot && p.id !== rt.me) this.connect(p.id, true); } });
  },
};
voice.init();
