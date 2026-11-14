'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

const STUDIO = '/aeron/chrome-studio.hdr';
const MODEL = '/aeron/reference-sculpture.glb';
const TEAL = '#dbf2fc';
/** World units visible top to bottom; the sculpture is about 3 units tall. */
const VIEW_HEIGHT = 3.5;

export interface SceneProps {
  /** false pauses rendering (hero off screen, tab in the background). */
  active: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}

/** The model's front carries the baked artwork; only its inferred back is lit by the studio. */
function prepare(model: THREE.Object3D) {
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials: THREE.Material[] = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshBasicMaterial) material.toneMapped = false;
      if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = 0.8;
    }
  });
}

function Sculpture({ active, onReady, onUnavailable }: SceneProps) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const time = useRef(0);

  useEffect(() => {
    let cancelled = false;
    new GLTFLoader().loadAsync(MODEL).then((gltf) => {
      if (cancelled) return;
      prepare(gltf.scene);
      setModel(gltf.scene);
      onReady();
    }, onUnavailable);
    return () => {
      cancelled = true;
    };
  }, [onReady, onUnavailable]);

  // The sculpture leans a little toward the pointer; touch does not move it.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    };
    const reset = () => {
      pointer.current = { x: 0, y: 0 };
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', reset);
    };
  }, []);

  useFrame((state, delta) => {
    const zoom = state.size.height / VIEW_HEIGHT;
    if (state.camera.zoom !== zoom) {
      state.camera.zoom = zoom;
      state.camera.updateProjectionMatrix();
    }
    if (!group.current) return;
    const dt = Math.min(delta, 0.04);
    if (active) time.current += dt;
    const t = time.current;
    const ease = 1 - Math.exp(-dt * 3);
    // Small angles only: the back of the model is inferred, so it is never turned toward the viewer.
    const yaw = Math.sin(t * 0.22) * 0.012 + pointer.current.x * 0.018;
    const pitch = Math.sin(t * 0.18) * 0.006 - pointer.current.y * 0.012;
    group.current.rotation.y += (yaw - group.current.rotation.y) * ease;
    group.current.rotation.x += (pitch - group.current.rotation.x) * ease;
    group.current.position.y = Math.sin(t * 0.45) * 0.008;
  });

  return <group ref={group}>{model && <primitive object={model} dispose={null} />}</group>;
}

export default function Scene(props: SceneProps) {
  const { onUnavailable } = props;
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 7], near: 0.1, far: 30 }}
      frameloop={props.active ? 'always' : 'never'}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
      onCreated={({ gl, scene }) => {
        scene.background = new THREE.Color(TEAL);
        gl.domElement.addEventListener('webglcontextlost', onUnavailable);
        void new HDRLoader().loadAsync(STUDIO).then((hdr) => {
          const generator = new THREE.PMREMGenerator(gl);
          scene.environment = generator.fromEquirectangular(hdr).texture;
          generator.dispose();
          hdr.dispose();
        });
      }}
    >
      <Sculpture {...props} />
    </Canvas>
  );
}
