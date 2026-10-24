import * as THREE from 'three';

// Builds a smooth "roundness" depth map from a cut-out's transparency (distance from the silhouette edge).
// Used when a custom hero cut-out is uploaded without a depth map, so it still gets the 3D treatment.
export function depthTextureFromAlpha(image) {
  const W = 270, H = Math.max(2, Math.round(W * image.height / image.width));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data, N = W * H, INF = 1e9, d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = px[i * 4 + 3] > 128 ? INF : 0;
  // two-pass chamfer distance transform
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!d[i]) continue; let v = d[i];
    if (x) v = Math.min(v, d[i - 1] + 1); if (y) { v = Math.min(v, d[i - W] + 1); if (x) v = Math.min(v, d[i - W - 1] + 1.414); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 1.414) } d[i] = v }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!d[i]) continue; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 1); if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 1.414); if (x) v = Math.min(v, d[i + W - 1] + 1.414) } d[i] = v }
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d'), img = og.createImageData(W, H), reach = 0.11 * H;
  for (let i = 0; i < N; i++) { const t = Math.min(1, (d[i] >= INF ? 0 : d[i]) / reach), v = t * t * (3 - 2 * t) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
  og.putImageData(img, 0, 0);
  const blur = document.createElement('canvas'); blur.width = W; blur.height = H;
  const bg = blur.getContext('2d'); bg.filter = 'blur(3px)'; bg.drawImage(out, 0, 0);
  const tex = new THREE.CanvasTexture(blur); tex.colorSpace = THREE.NoColorSpace; return tex;
}
