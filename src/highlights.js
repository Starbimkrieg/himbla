import * as THREE from 'three';
import { ComicPost } from './post.js';
import { pixelFont } from './fonts.js';

const KEY = 'moonrunner-highlights-v1';
const MAX = 12;
const W = 400, H = 250;

// Captures comic-styled snapshots from the action-panel camera and pins them up on the
// Hall of Highlights board at the International Moon Base.
export class Highlights {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.images = new Map();
    this.post = new ComicPost(game.renderer, game.panelCam, new THREE.Vector2(W, H));
    this.out = new THREE.WebGLRenderTarget(W, H);
    this.out.texture.colorSpace = THREE.SRGBColorSpace;
    this.pixels = new Uint8Array(W * H * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    try { this.items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { this.items = []; }
    this.drawBoard();
  }

  capture(camera, caption, score = 0) {
    const g = this.game;
    const aspect = camera.aspect;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const su = this.post.material.uniforms, mu = g.post.material.uniforms;
    su.time.value = mu.time.value;
    su.speed.value = mu.speed.value;
    su.boost.value = 0; su.damage.value = 0; su.alert.value = 0;
    this.post.render(g.scene, camera, this.out);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    g.renderer.readRenderTargetPixels(this.out, 0, 0, W, H, this.pixels);
    const img = this.ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4;
      img.data.set(this.pixels.subarray(src, src + W * 4), y * W * 4);
    }
    this.ctx.putImageData(img, 0, 0);
    const url = this.canvas.toDataURL('image/jpeg', 0.78);
    this.items.unshift({ url, caption, score, at: Date.now() });
    if (this.items.length > MAX) this.items.length = MAX;
    try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* storage full or unavailable */ }
    this.drawBoard();
    g.fx.pop('📸 HIGHLIGHT SAVED', null, { color: '#ff2e88', size: 30, life: 1.6, rot: 3 });
  }

  image(url) {
    let im = this.images.get(url);
    if (!im) {
      im = new Image();
      im.onload = () => this.drawBoard();
      im.src = url;
      this.images.set(url, im);
    }
    return im;
  }

  drawBoard() {
    const w = this.game.world;
    if (!w || !w.highlightCanvas) return;
    const c = w.highlightCanvas.getContext('2d');
    const CW = w.highlightCanvas.width, CH = w.highlightCanvas.height;
    c.fillStyle = '#fff4e0';
    c.fillRect(0, 0, CW, CH);
    c.fillStyle = 'rgba(255,46,136,0.18)';
    for (let y = 0; y < CH; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < CW; x += 12) { c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); }
    c.font = pixelFont(40);
    c.textAlign = 'center';
    c.lineWidth = 8; c.strokeStyle = '#120a1e'; c.lineJoin = 'round';
    c.strokeText('HALL OF HIGHLIGHTS', CW / 2, 70);
    c.fillStyle = '#ffd23f';
    c.fillText('HALL OF HIGHLIGHTS', CW / 2, 70);
    const cols = 4, rows = 3, pw = 228, ph = 142, gx = (CW - cols * pw) / (cols + 1), top = 96, gy = (CH - top - rows * ph) / (rows + 1);
    for (let i = 0; i < cols * rows; i++) {
      const x = gx + (i % cols) * (pw + gx), y = top + gy + Math.floor(i / cols) * (ph + gy);
      const rot = ((i * 37) % 7 - 3) * 0.01;
      c.save();
      c.translate(x + pw / 2, y + ph / 2);
      c.rotate(rot);
      c.fillStyle = '#120a1e';
      c.fillRect(-pw / 2 - 6, -ph / 2 - 6, pw + 12, ph + 12);
      const it = this.items[i];
      if (it) {
        const im = this.image(it.url);
        if (im.complete && im.naturalWidth) c.drawImage(im, -pw / 2, -ph / 2, pw, ph);
        c.font = pixelFont(10);
        c.fillStyle = '#ffd23f';
        c.fillRect(-pw / 2 - 6, ph / 2 - 18, pw + 12, 24);
        c.fillStyle = '#120a1e';
        c.textAlign = 'center';
        c.fillText(it.caption.slice(0, 22), 0, ph / 2 - 1);
      } else {
        c.fillStyle = '#3a3550';
        c.fillRect(-pw / 2, -ph / 2, pw, ph);
        c.fillStyle = '#8a84a8';
        c.font = pixelFont(14);
        c.textAlign = 'center';
        c.fillText('YOUR MOMENT HERE', 0, 8);
      }
      c.restore();
    }
    w.highlightTex.needsUpdate = true;
  }
}
