import assert from 'node:assert/strict';
import test from 'node:test';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createRibbonGeometry } from '../components/hero/ribbon-geometry.ts';

// Geometry-only checks: no WebGL context or image comparisons required.
test('the sweep is a closed, consistently oriented surface, including both seams', () => {
  const geometry = createRibbonGeometry();
  try {
    const edges = new Map();
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const triangle = [index[i], index[i + 1], index[i + 2]];
      assert.equal(new Set(triangle).size, 3);
      for (let j = 0; j < 3; j++) {
        const a = triangle[j],
          b = triangle[(j + 1) % 3];
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        const edge = edges.get(key) ?? { uses: 0, winding: 0 };
        edge.uses++;
        edge.winding += a < b ? 1 : -1;
        edges.set(key, edge);
      }
    }
    for (const edge of edges.values()) {
      assert.equal(edge.uses, 2, 'an edge must join exactly two faces');
      assert.equal(edge.winding, 0, 'adjacent triangles must agree on outside');
    }
    const position = geometry.attributes.position;
    let volume = 0;
    const a = new Vector3(),
      b = new Vector3(),
      c = new Vector3();
    for (let i = 0; i < index.length; i += 3) {
      a.fromBufferAttribute(position, index[i]);
      b.fromBufferAttribute(position, index[i + 1]);
      c.fromBufferAttribute(position, index[i + 2]);
      volume += a.dot(b.cross(c)) / 6;
    }
    assert.ok(volume > 1, 'faces must face outward and enclose real volume');
  } finally {
    geometry.dispose();
  }
});

test('the model has smooth finite normals and depth within the hero camera frame', () => {
  const geometry = createRibbonGeometry();
  try {
    const normals = geometry.attributes.normal;
    const normal = new Vector3();
    for (let i = 0; i < normals.count; i++) {
      normal.fromBufferAttribute(normals, i);
      assert.ok(Number.isFinite(normal.length()));
      assert.ok(Math.abs(normal.length() - 1) < 0.001);
    }
    const size = geometry.boundingBox.getSize(new Vector3());
    assert.ok(size.z > size.x * 0.6, 'the sculpture must have substantial side-view depth');
    assert.ok(
      geometry.boundingSphere.radius * 1.025 < 4.65 / 2 - 0.04,
      'the rotating bounding sphere must fit, including hover scale and shift',
    );
  } finally {
    geometry.dispose();
  }
});

test('the center opening passes through the mesh and adjacent folds have separated layers', () => {
  const geometry = createRibbonGeometry();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  const ray = new Raycaster();
  try {
    // Scan the middle of the sculpture: a displaced sphere cannot pass this aperture check.
    let openings = 0,
      layered = 0;
    for (let x = -0.5; x <= 0.5; x += 0.1) {
      for (let y = -0.5; y <= 0.5; y += 0.1) {
        ray.set(new Vector3(x, y, 5), new Vector3(0, 0, -1));
        const hits = ray.intersectObject(mesh);
        if (!hits.length) openings++;
        if (hits.length >= 4) layered++;
      }
    }
    assert.ok(openings > 5, 'there must be a real aperture, not a dark painted patch');
    assert.ok(layered > 0, 'folds must overlap in depth');
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
