# Reflective hero sculpture

The homepage now renders a closed, rounded ribbon swept around a trefoil path. The openings,
front/back crossings and thickness are geometry. The reference image is used only as the initial
poster and reduced-motion/WebGL fallback; it is no longer projected onto the live model.

`apps/web/components/hero/ribbon-geometry.ts` owns the shape. Its closed transported frames and
periodic width/roll controls avoid a split seam. The default mesh has 12,288 vertices and 24,576
triangles. The bounding sphere fits inside the hero camera, including hover scale and translation.

`studio.ts` builds six stationary studio cards (white, cyan, blue and magenta), captures a filtered
reflection environment once, and disposes of the capture scene. `scene.tsx` uses a metallic physical
material with modest roughness and clearcoat. Reflections respond to the rotating surface normals;
there is no artwork texture or unlit image shader on the mesh. The environment, geometry, material
and context-loss listener are released on unmount.

Idle rotation and mouse steering remain. A keyboard-accessible pause/resume button stops rotation.
Paused and offscreen scenes render on demand, so resize/remount can still draw a frame. Reduced
motion switches to the reference poster, including preference changes while the page is open.
WebGL failure also leaves the poster visible.

## Verification

From the repository root:

```sh
pnpm --filter web test:sculpture
pnpm --filter web typecheck
pnpm --filter web build
```

The web app requires `API_URL` as described in its `.env.example`.

Geometry tests check edge closure and winding, positive enclosed volume, finite unit normals,
side-view depth, camera clearance, and raycast-confirmed openings and layered folds. Front,
quarter and side views of the generated mesh were also inspected using offline Blender renders.
Those renders validate the shape, not pixel parity with Three.js.

The live homepage and static fallback were checked in the implementation browser. Reduced motion
was disabled, but this browser did not supply a usable WebGL renderer: the hero stayed in `static`
mode without a canvas or application console errors. Consequently auto-rotation, pointer steering,
pause/resume, narrow-width resizing, reduced-motion preference changes, and navigation away/back
still need a live check in a WebGL-capable browser before merging. TypeScript, targeted ESLint,
formatting, the geometry tests and the production Next.js build passed.

## Scope and remaining visual work

This is an editable, reference-inspired first implementation, not a recovered original model or
an exact silhouette match. The current environment reflects the studio, not the other folds of
the sculpture. Full self-reflections/path tracing and a closer art-directed shape match remain
separate refinements. The old GLB and its generation script are retained as reference assets but
are no longer fetched by the hero scene.
