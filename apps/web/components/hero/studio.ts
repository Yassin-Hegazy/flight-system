import * as THREE from 'three';

/** Fixed studio cards, captured once. They stay in world space as the sculpture turns. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#071123');
  const cards: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  const card = (
    colour: string,
    intensity: number,
    width: number,
    height: number,
    position: [number, number, number],
  ) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colour).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
    cards.push(mesh);
  };
  // Large softboxes define the curves; narrow strips draw sharp highlights along the edges.
  card('#eafaff', 3.2, 5, 7, [-4, 3, 4]);
  card('#ffffff', 4, 6, 2, [0, 6, 1]);
  card('#ff247c', 2.8, 3, 7, [4, 1, 2]);
  card('#1469ee', 1.8, 5, 5, [-3, -1, -4]);
  card('#a4e8ff', 2.2, 5, 2, [0, -4, 3]);
  card('#ffffff', 4, 0.6, 5, [2, 2, -5]);
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(studio, 0.035);
  } finally {
    generator.dispose();
    cards.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }
}
