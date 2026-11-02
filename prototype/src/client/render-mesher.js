// Building shapes (moved out of render-oganiru.js on 2 November 2026, for the city's towers, render-skyline.js, as well).
import { place, linear, letGoOnceSent } from './render-kit.js';

// Triangles for one material, gathered and made into one mesh: every face its own normal (or the shape's own), its
// colour, and where its picture lies.
export class Mesher {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
  get empty() { return this.p.length === 0; }
  vert(x, y, z, nx, ny, nz, col, u, v) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.u.push(u, v); }
  // a four-sided face a b c d (each [x, y, z]), facing `facing` ([x, y, z]; its corners put round the other way if it
  // would face away), with its picture's corners (`uv`: four [u, v])
  quad(a, b, c, d, col, uv = Q_UV, facing = null) {
    // (its normal across its diagonals: right for a face of three corners, one given twice, too)
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (facing && nx * facing[0] + ny * facing[1] + nz * facing[2] < 0) { this.quad(a, d, c, b, col, [uv[0], uv[3], uv[2], uv[1]], null); return; }
    const C = col.isColor ? col : linear(col);
    this.vert(...a, nx, ny, nz, C, ...uv[0]); this.vert(...b, nx, ny, nz, C, ...uv[1]); this.vert(...c, nx, ny, nz, C, ...uv[2]);
    this.vert(...a, nx, ny, nz, C, ...uv[0]); this.vert(...c, nx, ny, nz, C, ...uv[2]); this.vert(...d, nx, ny, nz, C, ...uv[3]);
  }
  // a shape from the library, placed by `matrix`, its picture laid as `mode` says ('wall': across x + z and up; 'plan':
  // across the ground; 'own': its own), `scale` metres to the picture
  geo(geometry, matrix, col, mode = 'wall', scale = 4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position.array, N = g.attributes.normal.array, T = g.attributes.uv ? g.attributes.uv.array : null;
    const C = col.isColor ? col : linear(col);
    for (let i = 0, k = 0; i < P.length; i += 3, k += 2) {
      const u = mode === 'plan' ? P[i] / scale : mode === 'own' && T ? T[k] : (P[i] + P[i + 2]) / scale;
      const v = mode === 'plan' ? P[i + 2] / scale : mode === 'own' && T ? T[k + 1] : P[i + 1] / scale;
      this.vert(P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], C, u, v);
    }
    g.dispose(); geometry.dispose();
  }
  // a box w (x) by h by d (z), its middle at (x, y, z), turned `ry`: its picture laid as walls are
  box(w, h, d, x, y, z, col, ry = 0, mode = 'wall', scale = 4) { this.geo(new THREE.BoxGeometry(w, h, d), place(x, y, z, ry), col, mode, scale); }
  build(material, { shadows = true, receive = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    letGoOnceSent(g);
    this.p = this.n = this.c = this.u = null;
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = shadows; mesh.receiveShadow = receive;
    return mesh;
  }
}
// (a face's picture, corner by corner)
export const Q_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
