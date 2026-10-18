// The box a model takes up as it is drawn now, to the point: every point of each of its meshes' own triangles, where
// the mesh is in the world. (three.js bounds a mesh by its geometry's box turned with it, which is larger than the
// mesh whenever the mesh is turned: a motorcycle whose front end is put straight by the game (bike-model.js) seemed a
// third wider than it is, and its pictures and the market's view of it were framed round that.)
//   exactBox(object, { only })      only(mesh): which meshes count (all that are drawn, by default)
let at = null;
export function exactBox(object, { only = (mesh) => mesh.visible } = {}, box = new THREE.Box3()) {
  at = at || new THREE.Vector3();
  box.makeEmpty();
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry || !only(o)) return;
    const pos = o.geometry.attributes.position, index = o.geometry.index;
    if (!pos) return;
    const m = o.matrixWorld, n = index ? index.count : pos.count;
    // (each point once would be quicker; a model's parts share their points, so the index is what says which are its own)
    for (let i = 0; i < n; i += 1) {
      const k = index ? index.getX(i) : i;
      at.fromBufferAttribute(pos, k).applyMatrix4(m);
      box.expandByPoint(at);
    }
  });
  return box;
}
