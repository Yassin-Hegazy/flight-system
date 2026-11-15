'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// A warped ball built from the artwork by scripts/build-sculpture.py.
const MODEL = '/aeron/aeron-sculpture.glb';
const ARTWORK = '/aeron/hero-chrome.png';
const TEAL = '#dbf2fc';
/** World units visible top to bottom; the ball is about 3.4 units across. */
const VIEW_HEIGHT = 4.1;
/** Left alone it turns steadily, one full turn in about 26 s, nodding slightly. */
const SPIN_SPEED = 0.24;
const NOD = 0.14;
/** How far the mouse can turn it from where it was, in radians, at the edge of the artwork. */
const STEER_YAW = 1.5;
const STEER_PITCH = 0.85;
/** Hovered, it also grows a little and leans toward the mouse, in world units. */
const HOVER_SCALE = 1.04;
const HOVER_SHIFT = 0.06;

export interface SceneProps {
  /** false pauses rendering (hero off screen, tab in the background). */
  active: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}

// The artwork is painted onto the body from three directions (front and back, the sides, top and
// bottom) and blended by which way the body faces there, so there is artwork all the way round.
const VERTEX = /* glsl */ `
  varying vec3 vPoint;
  varying vec3 vViewNormal;
  varying vec3 vViewPoint;
  void main() {
    vPoint = position;
    vec4 viewPoint = modelViewMatrix * vec4(position, 1.0);
    vViewPoint = viewPoint.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPoint;
  }
`;
const FRAGMENT = /* glsl */ `
  uniform sampler2D artwork;
  uniform vec3 glow;
  varying vec3 vPoint;
  varying vec3 vViewNormal;
  varying vec3 vViewPoint;
  const float WIDTH = 3.5;                          // the artwork spans 3.5 world units
  const vec3 CENTRE = vec3(0.092, -0.025, 0.0);     // where the ball sits in the artwork
  void main() {
    // Which projection to use follows the ball's own roundness, not each small fold. The front
    // is favoured a little, so the artwork is seen as it was made across most of that face.
    vec3 point = vPoint - CENTRE;
    vec3 facing = abs(normalize(point)) * vec3(1.0, 1.0, 1.3);
    // A high power keeps each painting to itself and makes the hand-over between two of them
    // narrow: wide overlaps average two different pictures, which greys the colours out.
    vec3 weight = pow(facing, vec3(26.0));
    weight /= weight.x + weight.y + weight.z;
    // The back shows the artwork turned half a turn, so the two faces are not mirror images.
    vec2 origin = CENTRE.xy / WIDTH + 0.5;
    vec2 front = origin + (point.z < 0.0 ? -point.xy : point.xy) / WIDTH;
    vec2 side = origin + vec2(point.z, point.y) / WIDTH;
    vec2 top = origin + vec2(point.x, point.z) / WIDTH;
    vec3 colour = texture2D(artwork, front).rgb * weight.z
      + texture2D(artwork, side).rgb * weight.x
      + texture2D(artwork, top).rgb * weight.y;
    // Deepen the colours a touch: the artwork is glass and chrome, not frosted.
    float grey = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    colour = mix(vec3(grey), colour, 1.15);
    // A gentle light from the upper left, and a thin bright edge like light catching glass.
    vec3 normal = normalize(vViewNormal);
    float lit = dot(normal, normalize(vec3(-0.4, 0.6, 0.7))) * 0.5 + 0.5;
    float rim = pow(1.0 - abs(dot(normal, normalize(-vViewPoint))), 6.0);
    colour = clamp(colour * mix(0.95, 1.06, lit), 0.0, 1.0) + glow * rim * 0.22;
    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }
`;

async function loadSculpture(): Promise<THREE.Mesh> {
  const [gltf, artwork] = await Promise.all([
    new GLTFLoader().loadAsync(MODEL),
    new THREE.TextureLoader().loadAsync(ARTWORK),
  ]);
  artwork.colorSpace = THREE.SRGBColorSpace;
  // Keeps the artwork sharp where the surface turns away from the viewer.
  artwork.anisotropy = 8;
  const mesh = gltf.scene.getObjectByProperty('isMesh', true) as THREE.Mesh;
  mesh.geometry.computeVertexNormals();
  mesh.material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { artwork: { value: artwork }, glow: { value: new THREE.Color('#bfe9fb') } },
  });
  return mesh;
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
  const [model, setModel] = useState<THREE.Mesh | null>(null);
  const group = useRef<THREE.Group>(null);
  const canvas = useThree((state) => state.gl.domElement);
  // Pointer position over the artwork, -1..1 from its centre; `over` is false anywhere else.
  const pointer = useRef({ x: 0, y: 0, over: false });
  const motion = useRef<Motion>({ spin: 0, held: null, time: 0 });

  useEffect(() => {
    let cancelled = false;
    loadSculpture().then((mesh) => {
      if (cancelled) return;
      setModel(mesh);
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
    const body = group.current;
    if (!body) return;
    const dt = Math.min(delta, 0.04);
    const { x, y, over } = pointer.current;
    const [yaw, pitch] = aim(motion.current, pointer.current, body.rotation.y, active ? dt : 0);
    // Quick to follow the mouse, gentle otherwise.
    const ease = 1 - Math.exp(-dt * (over ? 9 : 4));
    body.rotation.y += (yaw - body.rotation.y) * ease;
    body.rotation.x += (pitch - body.rotation.x) * ease;
    body.position.x += ((over ? x * HOVER_SHIFT : 0) - body.position.x) * ease;
    body.position.y += ((over ? -y * HOVER_SHIFT : 0) - body.position.y) * ease;
    body.scale.setScalar(body.scale.x + ((over ? HOVER_SCALE : 1) - body.scale.x) * ease);
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
      }}
    >
      <Sculpture {...props} />
    </Canvas>
  );
}
