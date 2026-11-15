'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

const STUDIO = '/aeron/chrome-studio.hdr';
const MODEL = '/aeron/reference-sculpture.glb';
const TEAL = '#dbf2fc';
/** World units visible top to bottom; the sculpture is about 3 units tall. */
const VIEW_HEIGHT = 3.5;
/** The sway: radians either side of the front view, and radians per second (one loop in ~14 s). */
const ORBIT_YAW = 0.32;
const ORBIT_PITCH = 0.12;
const ORBIT_SPEED = 0.45;
/** How far the mouse can turn it, in radians, at the edge of the artwork. */
const STEER_YAW = 0.42;
const STEER_PITCH = 0.26;

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
  const canvas = useThree((state) => state.gl.domElement);
  // Pointer position over the artwork, -1..1 from its centre; `over` is false anywhere else.
  const pointer = useRef({ x: 0, y: 0, over: false });
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

  // While the mouse is over the artwork it steers the sculpture; touch does not.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const box = canvas.getBoundingClientRect();
      const x = ((event.clientX - box.left) / box.width) * 2 - 1;
      const y = ((event.clientY - box.top) / box.height) * 2 - 1;
      pointer.current = { x, y, over: Math.abs(x) <= 1 && Math.abs(y) <= 1 };
    };
    const leave = () => {
      pointer.current.over = false;
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', leave);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [canvas]);

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
    const ease = 1 - Math.exp(-dt * 4);
    // Hovered, the sculpture faces the mouse. Left alone, its facing direction traces a slow
    // ellipse. Both stay well short of a full turn: the back of the model is inferred, not sculpted.
    const { x, y, over } = pointer.current;
    const angle = t * ORBIT_SPEED;
    const yaw = over ? x * STEER_YAW : Math.sin(angle) * ORBIT_YAW;
    const pitch = over ? y * STEER_PITCH : Math.cos(angle) * ORBIT_PITCH;
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
