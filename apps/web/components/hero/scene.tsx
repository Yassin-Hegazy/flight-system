'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createRibbonGeometry } from './ribbon-geometry';
import { createStudioEnvironment } from './studio';

const VIEW_HEIGHT = 4.65;
const SPIN_SPEED = 0.18;
const NOD = 0.12;
const STEER_YAW = 1.5;
const STEER_PITCH = 0.75;
const HOVER_SCALE = 1.025;
const HOVER_SHIFT = 0.04;

export interface SceneProps {
  active: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}

/** Bends the pointer position so the first bit of movement away from the centre already turns it. */
const response = (v: number) => Math.sign(v) * Math.abs(v) ** 0.7;

interface Motion {
  /** Where the idle spin has got to. */
  spin: number;
  /** The angle the sculpture was at when the mouse took over; null while it spins by itself. */
  held: number | null;
  time: number;
}

/** The yaw and pitch to head for this frame. `dt` is 0 while the scene is paused. */
function aim(
  now: Motion,
  pointer: { x: number; y: number; over: boolean },
  currentYaw: number,
  dt: number,
): [number, number] {
  now.time += dt;
  if (pointer.over) {
    // The mouse turns it from wherever the spin had brought it, up to a quarter turn each way.
    now.held ??= currentYaw;
    return [now.held + response(pointer.x) * STEER_YAW, response(pointer.y) * STEER_PITCH];
  }
  // Let go, it carries on spinning from where the mouse left it.
  if (now.held !== null) now.spin = currentYaw;
  now.held = null;
  now.spin += dt * SPIN_SPEED;
  return [now.spin, Math.sin(now.time * 0.4) * NOD];
}

function Sculpture({ active, onReady, onUnavailable }: SceneProps) {
  const group = useRef<THREE.Group>(null);
  const ready = useRef(false);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const canvas = gl.domElement;
  const pointer = useRef({ x: 0, y: 0, over: false });
  const motion = useRef<Motion>({ spin: 0, held: null, time: 0 });

  useEffect(() => {
    const body = group.current;
    if (!body) return;
    const geometry = createRibbonGeometry();
    const material = new THREE.MeshPhysicalMaterial({
      color: '#d4e9fa',
      metalness: 1,
      roughness: 0.17,
      clearcoat: 0.3,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    let environment: THREE.WebGLRenderTarget | undefined;
    try {
      environment = createStudioEnvironment(gl);
      material.envMap = environment.texture;
      body.add(mesh);
      invalidate();
    } catch {
      onUnavailable();
    }
    const lost = (event: Event) => {
      event.preventDefault();
      onUnavailable();
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      ready.current = false;
      canvas.removeEventListener('webglcontextlost', lost);
      body.remove(mesh);
      geometry.dispose();
      material.dispose();
      environment?.dispose();
    };
  }, [canvas, gl, invalidate, onUnavailable]);

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
    const zoom = Math.min(state.size.height, state.size.width) / VIEW_HEIGHT;
    if (state.camera.zoom !== zoom) {
      state.camera.zoom = zoom;
      state.camera.updateProjectionMatrix();
    }
    const body = group.current;
    if (!body) return;
    if (body.children.length && !ready.current) {
      ready.current = true;
      onReady();
    }
    if (!active) return;
    const dt = Math.min(delta, 0.04);
    const { x, y, over } = pointer.current;
    const [yaw, pitch] = aim(motion.current, pointer.current, body.rotation.y, dt);
    const ease = 1 - Math.exp(-dt * (over ? 9 : 4));
    body.rotation.y += (yaw - body.rotation.y) * ease;
    body.rotation.x += (pitch - body.rotation.x) * ease;
    body.position.x += ((over ? x * HOVER_SHIFT : 0) - body.position.x) * ease;
    body.position.y += ((over ? -y * HOVER_SHIFT : 0) - body.position.y) * ease;
    body.scale.setScalar(body.scale.x + ((over ? HOVER_SCALE : 1) - body.scale.x) * ease);
  });

  return <group ref={group} />;
}

export default function Scene(props: SceneProps) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 7], near: 0.1, far: 30 }}
      frameloop={props.active ? 'always' : 'demand'}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <Sculpture {...props} />
    </Canvas>
  );
}
