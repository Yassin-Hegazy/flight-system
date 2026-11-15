"""Builds the hero sculpture as a closed 3D body: aeron-sculpture.glb (positions and triangles only).

The artwork (hero-chrome.png) is one photograph-like render, so the shape is inferred from it: the
outline is the artwork's own silhouette, the front relief follows its main folds, and the back is
the same relief mirrored. The result is a real solid that can be turned all the way round; the
page's shader paints the artwork onto it from three directions.

    python3 scripts/build-sculpture.py public/aeron/hero-chrome.png public/aeron/aeron-sculpture.glb

Needs numpy, scipy and Pillow.
"""
import json
import struct
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SOURCE, OUT = sys.argv[1], sys.argv[2]
ANGLES, RINGS = 192, 72      # resolution of the polar grid on each side
WORLD = 3.5 / 1024           # world units per artwork pixel (the artwork is 3.5 units wide)
BODY = 1.95                  # how deep the rounded body is, against the first inferred dome
FOLDS = .55                  # how far the folds stand out from it; 1 is as first inferred

im = np.asarray(Image.open(SOURCE).convert('RGB')).astype(float)
H, W = im.shape[:2]
yy, xx = np.mgrid[:H, :W]

# --- the silhouette: everything that is not the smooth backdrop reaching in from the border
x, y = (xx - W / 2) / W, (yy - H / 2) / H
basis = np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], -1)
border = (xx < 10) | (xx > W - 11) | (yy < 10) | (yy > H - 11)
backdrop = basis @ np.linalg.lstsq(basis[border], im[border], rcond=None)[0]
plain = (np.linalg.norm(im - backdrop, axis=-1) < 16) & (im[:, :, 0] > 170) & (im[:, :, 1] > 205)
outside = ndimage.binary_propagation(border, mask=plain | border)
mask = ndimage.binary_fill_holes(ndimage.binary_closing(~outside, iterations=2))
labels, _ = ndimage.label(mask)
sizes = np.bincount(labels.ravel()); sizes[0] = 0
mask = labels == sizes.argmax()
distance = ndimage.distance_transform_edt(mask)

# --- the relief: a dome, then the artwork's main folds raised and its hollows pressed in
X, Y = (xx - 512) / 512, (512 - yy) / 512
dome = np.sqrt(np.maximum(0, 1 - (X / .99) ** 2 - (Y / 1.02) ** 2)) * .58
z = dome.copy()


def bump(cx, cy, rx, ry, angle=0):
    a = np.deg2rad(angle)
    u = (xx - cx) * np.cos(a) + (yy - cy) * np.sin(a)
    v = -(xx - cx) * np.sin(a) + (yy - cy) * np.cos(a)
    return np.exp(-.5 * ((u / rx) ** 2 + (v / ry) ** 2))


def ridge(points, width, strength):
    global z
    best = np.full((H, W), 1e12)
    for (ax, ay), (bx, by) in zip(points[:-1], points[1:]):
        dx, dy = bx - ax, by - ay
        t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        best = np.minimum(best, (xx - ax - t * dx) ** 2 + (yy - ay - t * dy) ** 2)
    z += strength * np.exp(-best / (2 * width * width))


z += .28 * bump(420, 205, 170, 80, -10)
z -= .36 * bump(600, 155, 90, 55, 25)
z -= .38 * bump(815, 370, 75, 165, -15)
z -= .42 * bump(505, 550, 155, 52, -18)
z += .36 * bump(770, 700, 130, 115, -15)
z -= .57 * bump(548, 718, 75, 45, 35)
ridge([(660, 145), (700, 225), (660, 310), (540, 380), (405, 440), (340, 525), (345, 605)], 45, .40)
ridge([(310, 305), (210, 420), (200, 545), (255, 685), (395, 795), (570, 850), (665, 925)], 34, .25)
ridge([(725, 60), (850, 135), (925, 275), (950, 425), (875, 560)], 38, .28)
ridge([(670, 565), (520, 600), (410, 630), (370, 680), (455, 765), (600, 810), (685, 870)], 24, .22)
luma = im[:, :, 0] * .2126 + im[:, :, 1] * .7152 + im[:, :, 2] * .0722
z += .04 * (ndimage.gaussian_filter(luma, 9) / 255 - .5)
# Round the body off toward its outline, like the edge of a pebble, so front and back meet smoothly.
edge = np.clip(distance / 90, 0, 1)
rounding = np.sqrt(1 - (1 - edge) ** 2)
folds = (z - dome) * FOLDS
cy, cx = ndimage.center_of_mass(mask)
# The back carries the same folds turned half a turn about the centre, so the body is not a
# mirror image of itself when it is seen from the side.
turned = ndimage.shift(folds[::-1, ::-1], (2 * cy - (H - 1), 2 * cx - (W - 1)), order=1)
z = ndimage.gaussian_filter(np.maximum(.12, dome * BODY + folds) * rounding, 7)
z_back = ndimage.gaussian_filter(np.maximum(.12, dome * BODY + turned) * rounding, 7)

# --- a polar grid from the centre out to the outline, the same on both sides
theta = np.linspace(0, 2 * np.pi, ANGLES, endpoint=False)
reach = np.zeros(ANGLES)
for i, a in enumerate(theta):
    r = np.arange(0, 720, .5)
    px = np.clip(cx + r * np.cos(a), 0, W - 1).astype(int)
    py = np.clip(cy + r * np.sin(a), 0, H - 1).astype(int)
    inside = mask[py, px]
    reach[i] = r[np.argmin(inside)] if not inside.all() else r[-1]
    # every point of the body must be visible from the centre for this grid to be valid
    assert inside[: np.argmin(inside)].all()
reach = ndimage.gaussian_filter1d(reach, 1.2, mode='wrap')

t = (np.arange(1, RINGS + 1) / RINGS) ** .85            # a little denser toward the outline
px = cx + np.outer(reach, t) * np.cos(theta)[:, None]    # [angle, ring]
py = cy + np.outer(reach, t) * np.sin(theta)[:, None]
height = ndimage.map_coordinates(z, [py.ravel(), px.ravel()], order=1).reshape(px.shape)
height[:, -1] = 0                                        # the outline is where the two sides meet
height_back = ndimage.map_coordinates(z_back, [py.ravel(), px.ravel()], order=1).reshape(px.shape)

wx, wy = (px - 512) * WORLD, (512 - py) * WORLD
centre_height = float(ndimage.map_coordinates(z, [[cy], [cx]], order=1)[0])
centre = ((cx - 512) * WORLD, (512 - cy) * WORLD)

vertices = [(centre[0], centre[1], centre_height)]       # 0: front centre
front = 1 + np.arange(ANGLES * RINGS).reshape(ANGLES, RINGS)
for i in range(ANGLES):
    for j in range(RINGS):
        vertices.append((wx[i, j], wy[i, j], height[i, j]))
back_centre = len(vertices)
vertices.append((centre[0], centre[1], -float(ndimage.map_coordinates(z_back, [[cy], [cx]], order=1)[0])))
back = np.zeros((ANGLES, RINGS), dtype=int)
for i in range(ANGLES):
    for j in range(RINGS - 1):
        back[i, j] = len(vertices)
        vertices.append((wx[i, j], wy[i, j], -height_back[i, j]))
    back[i, RINGS - 1] = front[i, RINGS - 1]              # the outline ring is shared

triangles = []
for side, grid, hub in ((1, front, 0), (-1, back, back_centre)):
    for i in range(ANGLES):
        n = (i + 1) % ANGLES
        tris = [(hub, grid[n, 0], grid[i, 0])]
        for j in range(RINGS - 1):
            a, b, c, d = grid[i, j], grid[n, j], grid[n, j + 1], grid[i, j + 1]
            tris += [(a, b, c), (a, c, d)]
        # image y runs down, so this winding faces +z on the front; the back is flipped
        triangles += [tri if side == 1 else tri[::-1] for tri in tris]

positions = np.asarray(vertices, dtype='<f4')
indices = np.asarray(triangles, dtype='<u2' if len(vertices) < 65536 else '<u4')
blob = positions.tobytes() + indices.tobytes()
blob += b'\0' * (-len(blob) % 4)
gltf = {
    'asset': {'version': '2.0', 'generator': 'aeron build-sculpture.py'},
    'scene': 0,
    'scenes': [{'nodes': [0]}],
    'nodes': [{'mesh': 0, 'name': 'sculpture'}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1}]}],
    'buffers': [{'byteLength': len(blob)}],
    'bufferViews': [
        {'buffer': 0, 'byteOffset': 0, 'byteLength': positions.nbytes, 'target': 34962},
        {'buffer': 0, 'byteOffset': positions.nbytes, 'byteLength': indices.nbytes, 'target': 34963},
    ],
    'accessors': [
        {'bufferView': 0, 'componentType': 5126, 'count': len(positions), 'type': 'VEC3',
         'min': positions.min(0).tolist(), 'max': positions.max(0).tolist()},
        {'bufferView': 1, 'componentType': 5123 if indices.dtype.itemsize == 2 else 5125,
         'count': indices.size, 'type': 'SCALAR'},
    ],
}
text = json.dumps(gltf, separators=(',', ':')).encode()
text += b' ' * (-len(text) % 4)
with open(OUT, 'wb') as out:
    out.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + 8 + len(blob)))
    out.write(struct.pack('<I4s', len(text), b'JSON') + text)
    out.write(struct.pack('<I4s', len(blob), b'BIN\0') + blob)

# --- checks: a closed surface has every edge shared by exactly two triangles
edges = {}
for a, b, c in triangles:
    for e in ((a, b), (b, c), (c, a)):
        edges[tuple(sorted(e))] = edges.get(tuple(sorted(e)), 0) + 1
assert set(edges.values()) == {2}, 'the surface is not closed'
print(f'{len(positions)} vertices, {len(triangles)} triangles, {12 + 16 + len(text) + len(blob)} bytes')
print('size', (positions.max(0) - positions.min(0)).round(2).tolist())
