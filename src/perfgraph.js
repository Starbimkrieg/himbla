// Rolling graphs for the dev overlay (cheats.js): FPS, CPU and GPU load over the last 30 s.

export const GRAPH_WINDOW = 30000; // ms of history shown

// Canvas line graph of (time, value) points. CSS sizes the canvas; the bitmap is fixed.
export class TimeGraph {
  constructor(canvas, w = 420, h = 92) {
    this.canvas = canvas;
    canvas.width = w;
    canvas.height = h;
    this.ctx = canvas.getContext('2d');
    this.pts = [];
  }

  push(t, v) {
    this.pts.push([t, v]);
    while (this.pts.length && this.pts[0][0] < t - GRAPH_WINDOW) this.pts.shift();
  }

  clear() { this.pts.length = 0; }

  // max: value at the top edge. grid: values to draw faint guide lines at. color: line / fill colour.
  draw(now, max, grid, color) {
    const { ctx, canvas: { width: W, height: H } } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(5, 3, 12, 0.55)';
    ctx.fillRect(0, 0, W, H);
    const X = (t) => ((t - (now - GRAPH_WINDOW)) / GRAPH_WINDOW) * W;
    const Y = (v) => H - 2 - (Math.min(v, max) / max) * (H - 4);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    for (const g of grid) {
      if (g >= max) continue;
      ctx.beginPath(); ctx.moveTo(0, Math.round(Y(g)) + 0.5); ctx.lineTo(W, Math.round(Y(g)) + 0.5); ctx.stroke();
    }
    // runs of points; a gap over 1 s (paused / menu) starts a new run so it isn't drawn as a slope
    const runs = [];
    let prev = null;
    for (const p of this.pts) {
      if (!prev || p[0] - prev[0] > 1000) runs.push([]);
      runs[runs.length - 1].push(p);
      prev = p;
    }
    ctx.lineJoin = 'round';
    for (const run of runs) {
      ctx.beginPath();
      run.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineTo(X(run[run.length - 1][0]), H);
      ctx.lineTo(X(run[0][0]), H);
      ctx.closePath();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// GPU time per frame via EXT_disjoint_timer_query_webgl2 (`ok` false where unsupported). Wrap render calls in begin() / end().
export class GpuTimer {
  constructor(renderer) {
    this.gl = renderer.getContext();
    this.ext = this.gl.getExtension ? this.gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this.active = null;
    this.pending = [];
    this.sum = 0;
    this.n = 0;
  }

  get ok() { return !!this.ext; }

  begin() {
    if (!this.ext || this.active) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    this.collect();
  }

  // results arrive a few frames late; collect whichever are ready
  collect() {
    const { gl, ext } = this;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const q = this.pending[0];
      if (!disjoint && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) { this.sum += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; this.n++; }
      gl.deleteQuery(q);
    }
    while (this.pending.length > 8) gl.deleteQuery(this.pending.shift()); // driver stopped answering
  }

  // average GPU ms per frame since the last call, or null if nothing came back
  take() {
    const ms = this.n ? this.sum / this.n : null;
    this.sum = 0; this.n = 0;
    return ms;
  }
}
