import * as THREE from 'three';

/** A closed trefoil sweep: the crossings have depth, rather than being painted on a sphere. */
class FoldPath extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
    this.arcLengthDivisions = 2048;
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * Math.PI * 2;
    const radius = 1.08 + 0.48 * Math.cos(3 * a);
    return target.set(radius * Math.cos(2 * a), radius * Math.sin(2 * a), 0.72 * Math.sin(3 * a));
  }
}

/**
 * One watertight ribbon with a rounded elliptical section and no duplicated seam vertices.
 * Periodic width/roll controls and closed parallel-transport frames keep the join smooth.
 * This is an interpretation of the reference's folds, not a recovered original model.
 */
export function createRibbonGeometry(lengthSegments = 384, profileSegments = 32) {
  if (lengthSegments < 48 || profileSegments < 8) {
    throw new RangeError('The sculpture needs at least 48 length and 8 profile segments.');
  }
  const path = new FoldPath();
  const frames = path.computeFrenetFrames(lengthSegments, true);
  const positions = new Float32Array(lengthSegments * profileSegments * 3);
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const widthAxis = new THREE.Vector3();
  const depthAxis = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i < lengthSegments; i++) {
    const t = i / lengthSegments;
    const phase = t * Math.PI * 2;
    path.getPointAt(t, point);
    const roll = 0.55 + 0.65 * Math.sin(3 * phase + 0.4);
    widthAxis
      .copy(frames.normals[i])
      .multiplyScalar(Math.cos(roll))
      .addScaledVector(frames.binormals[i], Math.sin(roll));
    depthAxis
      .copy(frames.binormals[i])
      .multiplyScalar(Math.cos(roll))
      .addScaledVector(frames.normals[i], -Math.sin(roll));
    const width = 0.32 + 0.13 * (0.5 + 0.5 * Math.cos(3 * phase - 0.6));
    const thickness = 0.105 + 0.025 * Math.sin(3 * phase + 0.8);

    for (let j = 0; j < profileSegments; j++) {
      const angle = (j / profileSegments) * Math.PI * 2;
      const across = width * Math.cos(angle);
      // Camber makes each broad surface gently cupped, with real, rounded thickness.
      const depth = thickness * Math.sin(angle) - 0.22 * across * across;
      vertex.copy(point).addScaledVector(widthAxis, across).addScaledVector(depthAxis, depth);
      vertex.toArray(positions, (i * profileSegments + j) * 3);
      const a = i * profileSegments + j;
      const b = ((i + 1) % lengthSegments) * profileSegments + j;
      const c = ((i + 1) % lengthSegments) * profileSegments + ((j + 1) % profileSegments);
      const d = i * profileSegments + ((j + 1) % profileSegments);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.rotateZ(-0.32);
  geometry.rotateX(0.35);
  geometry.center();
  geometry.computeBoundingSphere();
  return geometry;
}
