import * as THREE from "three";

const _invWorld = new THREE.Matrix4();
const _mat3 = new THREE.Matrix3();
const _deltaLocal = new THREE.Vector3();

export function computeDeltaLocal(mesh: THREE.Object3D, deltaWorld: THREE.Vector3) {
  // Convert a world-space translation delta into the mesh's local space delta.
  // Uses the inverse of the mesh's world matrix (rotation + scale), ignoring translation.
  mesh.updateWorldMatrix(true, false);
  _invWorld.copy(mesh.matrixWorld).invert();
  _mat3.setFromMatrix4(_invWorld);
  return _deltaLocal.copy(deltaWorld).applyMatrix3(_mat3);
}

export function applyNonProportionalMove(
  pos: THREE.BufferAttribute,
  start: Float32Array,
  selected: number[],
  deltaLocal: THREE.Vector3,
) {
  for (const i of selected) {
    const ix = i * 3;
    pos.setXYZ(
      i,
      start[ix + 0] + deltaLocal.x,
      start[ix + 1] + deltaLocal.y,
      start[ix + 2] + deltaLocal.z,
    );
  }
}

type Falloff = "smooth" | "gaussian" | "sharp";

export function applyProportionalMove(args: {
  mesh: THREE.Object3D;
  pos: THREE.BufferAttribute;
  start: Float32Array;
  selected: number[];
  pivotLocal: THREE.Vector3;
  radiusWorld: number;
  falloff: Falloff;
  deltaLocal: THREE.Vector3;
}) {
  const { mesh, pos, start, selected, pivotLocal, radiusWorld, falloff, deltaLocal } = args;

  // world->local scale approximation so radius feels consistent in world units
  const m = mesh.matrixWorld.elements;
  const sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const sAvg = (sx + sy + sz) / 3;

  const radiusLocal = radiusWorld / Math.max(sAvg, 1e-8);
  const rInv = 1 / Math.max(radiusLocal, 1e-8);

  const selSet = new Set<number>(selected);

  const falloffFn = (t: number) => {
    if (t <= 0) return 1;
    if (t >= 1) return 0;

    if (falloff === "sharp") {
      const x = 1 - t;
      return x * x * x * x;
    }

    if (falloff === "gaussian") {
      const sharpness = 3;
      const a = Math.exp(-sharpness * t * t);
      const edge = Math.exp(-sharpness);
      return (a - edge) / (1 - edge); // normalized to hit 0 at edge
    }

    // smooth (default)
    const x = 1 - t;
    return x * x * (3 - 2 * x);
  };

  const arr = pos.array as Float32Array;

  for (let i = 0; i < pos.count; i++) {
    const ix = i * 3;
    const sx0 = start[ix + 0];
    const sy0 = start[ix + 1];
    const sz0 = start[ix + 2];

    let w = selSet.has(i) ? 1 : 0;

    if (w === 0) {
      const vx = sx0 - pivotLocal.x;
      const vy = sy0 - pivotLocal.y;
      const vz = sz0 - pivotLocal.z;
      const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (d < radiusLocal) w = falloffFn(d * rInv);
    }

    arr[ix + 0] = sx0 + deltaLocal.x * w;
    arr[ix + 1] = sy0 + deltaLocal.y * w;
    arr[ix + 2] = sz0 + deltaLocal.z * w;
  }
}
