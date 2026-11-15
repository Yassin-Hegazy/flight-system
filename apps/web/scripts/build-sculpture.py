"""Builds the hero sculpture as a warped ball: aeron-sculpture.glb (positions and triangles only).

The artwork (hero-chrome.png) is one photograph-like render, so the shape is inferred from it. The
body is a ball as deep as it is wide. Seen from the front its outline is the artwork's own
silhouette; its surface is pushed in and out along the artwork's main folds, read from the front,
the sides and the top alike, which is also how the page's shader paints the artwork onto it.

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
GRID = 72                    # squares along each edge of the six faces the ball is cut from
WORLD = 3.5 / 1024           # world units per artwork pixel (the artwork is 3.5 units wide)
WARP = .5                    # how far the folds push the surface in and out; 0 is a smooth ball

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
folds = ndimage.gaussian_filter(z - dome, 5) * WARP

# --- the outline: how far the silhouette reaches from its centre, in every direction
cy, cx = ndimage.center_of_mass(mask)
ANGLES = 720
reach = np.zeros(ANGLES)
for i, a in enumerate(np.linspace(0, 2 * np.pi, ANGLES, endpoint=False)):
    r = np.arange(0, 720, .5)
    px = np.clip(cx + r * np.cos(a), 0, W - 1).astype(int)
    py = np.clip(cy + r * np.sin(a), 0, H - 1).astype(int)
    inside = mask[py, px]
    reach[i] = r[np.argmin(inside)] if not inside.all() else r[-1]
reach = ndimage.gaussian_filter1d(reach, 4, mode='wrap') * WORLD
radius = float(reach.mean()) * .97


def reach_toward(dx, dy):
    """The outline's reach in a direction given in world axes (y up; the image's y runs down)."""
    turn = (np.arctan2(-dy, dx) % (2 * np.pi)) / (2 * np.pi) * ANGLES
    return ndimage.map_coordinates(reach, [turn], order=1, mode='wrap')


def fold_at(u, v):
    """The fold height at a point given in world units across (u) and up (v) from the centre."""
    return ndimage.map_coordinates(folds, [cy - v / WORLD, cx + u / WORLD], order=1, mode='nearest')


# --- a ball cut from a cube: six square grids pushed out onto the sphere, shared along the edges
index, directions, triangles = {}, [], []


def corner(point):
    key = tuple(np.round(point, 6))
    if key not in index:
        index[key] = len(directions)
        directions.append(point / np.linalg.norm(point))
    return index[key]


steps = np.tan(np.linspace(-np.pi / 4, np.pi / 4, GRID + 1))    # even spacing once on the sphere
for axis in range(3):
    for sign in (1, -1):
        a, b = (axis + 1) % 3, (axis + 2) % 3
        grid = np.zeros((GRID + 1, GRID + 1), dtype=int)
        for i, s in enumerate(steps):
            for j, t in enumerate(steps):
                point = np.zeros(3)
                point[axis], point[a], point[b] = sign, s, t
                grid[i, j] = corner(point)
        for i in range(GRID):
            for j in range(GRID):
                quad = (grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1])
                tris = [(quad[0], quad[1], quad[2]), (quad[0], quad[2], quad[3])]
                triangles += tris if sign == 1 else [tri[::-1] for tri in tris]

d = np.asarray(directions)
dx, dy, dz = d[:, 0], d[:, 1], d[:, 2]
# From the front the outline is the artwork's silhouette; toward the front and back it eases
# into an even ball, so the body is as deep as it is wide.
sideways = (dx * dx + dy * dy) ** 1.5
size = radius + (reach_toward(dx, dy) - radius) * sideways
smooth = d * size[:, None]
# The folds are read the same three ways the artwork is painted on (front and back, the sides,
# top and bottom), so the relief sits under the painted swirls from every direction.
weight = np.abs(d) ** 4
weight /= weight.sum(1, keepdims=True)
turn = np.where(dz < 0, -1.0, 1.0)                     # the back is the front turned half a turn
warp = (weight[:, 2] * fold_at(smooth[:, 0] * turn, smooth[:, 1] * turn)
        + weight[:, 0] * fold_at(smooth[:, 2], smooth[:, 1])
        + weight[:, 1] * fold_at(smooth[:, 0], smooth[:, 2]))
# No folds right at the outline, so the silhouette from the front stays the artwork's own.
warp *= 1 - sideways ** 4
centre = np.array([(cx - 512) * WORLD, (512 - cy) * WORLD, 0])
positions = (d * (size + warp)[:, None] + centre).astype('<f4')

indices = np.asarray(triangles, dtype='<u2' if len(positions) < 65536 else '<u4')
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
print('centre', centre.round(3).tolist(), 'radius', round(radius, 3))
