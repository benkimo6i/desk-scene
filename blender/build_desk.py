"""Builds the desk scene. Rerunnable: replaces the DeskScene collection.

Run inside Blender:
    exec(compile(open(PATH).read(), PATH, "exec"), {"__name__": "__main__"})

Units are metres. +Y points from the sitter towards the back wall; the window
is in the -X wall. Every desk item is a top-level Empty with its parts as
children, and moving parts hang off pivot Empties (Laptop_Lid, Lamp_Joint*...).
"""
import bpy
import json
from math import radians as R, pi, cos, sin
from mathutils import Vector

ROOT = "DeskScene"
LAMP_WATTS = 40.0
DESK_Z = 0.74

# Colors, sun and lamp for each period are shared with the website.
PALETTES_FILE = "/Users/benkim/Development/desk-scene/web/src/palettes.json"
DOG_FILE = "/Users/benkim/Development/desk-scene/blender/build_dog.py"
PERIOD = globals().get("PERIOD", "afternoon")
with open(PALETTES_FILE) as f:
    P = json.load(f)[PERIOD]
PALETTE = P["materials"]  # each material is lit, shadow, deep (hex, sRGB)


# ---------------------------------------------------------------- materials
def lin(h):
    def c(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(c(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5)) + (1.0,)


def toon(name, lit, shadow, deep):
    """Two-tone preview material. Colour comes from sun + shadow, not from albedo."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = lin(lit)
    t = m.node_tree
    t.nodes.clear()
    n = t.nodes.new
    out = n("ShaderNodeOutputMaterial")
    diff = n("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = n("ShaderNodeShaderToRGB")
    coord = n("ShaderNodeTexCoord")
    aspect = n("ShaderNodeVectorMath")
    aspect.operation = "MULTIPLY"
    aspect.inputs[1].default_value = (1.78, 1, 1)
    noise = n("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 620
    noise.inputs["Detail"].default_value = 2
    rough = n("ShaderNodeMath")          # breaks up shadow edges like dry brush
    rough.operation = "MULTIPLY_ADD"
    rough.inputs[1].default_value = 0.10
    rough.inputs[2].default_value = -0.05
    add = n("ShaderNodeMath")
    add.operation = "ADD"
    ramp = n("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "CONSTANT"
    cr.elements[0].position = 0.0
    cr.elements[0].color = lin(deep)
    cr.elements[1].position = 0.10
    cr.elements[1].color = lin(shadow)
    cr.elements.new(0.30).color = lin(lit)
    grain = n("ShaderNodeMath")
    grain.operation = "MULTIPLY_ADD"
    grain.inputs[1].default_value = 0.16
    grain.inputs[2].default_value = 0.92
    scale = n("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    emit = n("ShaderNodeEmission")
    L = t.links.new
    L(diff.outputs[0], s2r.inputs[0])
    L(coord.outputs["Window"], aspect.inputs[0])
    L(aspect.outputs[0], noise.inputs["Vector"])
    L(noise.outputs[0], rough.inputs[0])
    L(s2r.outputs[0], add.inputs[0])
    L(rough.outputs[0], add.inputs[1])
    L(add.outputs[0], ramp.inputs[0])
    L(noise.outputs[0], grain.inputs[0])
    L(ramp.outputs[0], scale.inputs[0])
    L(grain.outputs[0], scale.inputs["Scale"])
    L(scale.outputs[0], emit.inputs[0])
    L(emit.outputs[0], out.inputs[0])
    return m


def flat(name, hexcol):
    """Unlit material for the laptop screen and the lamp bulb."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = lin(hexcol)
    t = m.node_tree
    t.nodes.clear()
    out = t.nodes.new("ShaderNodeOutputMaterial")
    emit = t.nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = lin(hexcol)
    t.links.new(emit.outputs[0], out.inputs[0])
    return m


# ------------------------------------------------------------------ cleanup
def purge(coll):
    for c in list(coll.children):
        purge(c)
    for o in list(coll.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)


old = bpy.data.collections.get(ROOT)
if old:
    purge(old)
for nm in ("Cube", "Light", "Camera"):      # Blender's untouched startup objects
    if nm in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)

scene = bpy.context.scene
root = bpy.data.collections.new(ROOT)
scene.collection.children.link(root)
ACTIVE = root


def use(name):
    global ACTIVE
    ACTIVE = bpy.data.collections.new(name)
    root.children.link(ACTIVE)


# ----------------------------------------------------------------- geometry
def merge(*geos):
    V, F = [], []
    for v, f in geos:
        o = len(V)
        V += list(v)
        F += [tuple(i + o for i in p) for p in f]
    return V, F


def box_geo(sx, sy, sz, c=(0, 0, 0)):
    x, y, z = sx / 2, sy / 2, sz / 2
    cx, cy, cz = c
    V = [(cx + a, cy + b, cz + d) for d in (-z, z)
         for a, b in ((-x, -y), (x, -y), (x, y), (-x, y))]
    F = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return V, F


def rrect_geo(w, d, h, rad, seg=3, z=0.0):
    """Rounded rectangle in XY, extruded in +Z from z."""
    pts = []
    cs = [(w / 2 - rad, d / 2 - rad, 0), (-w / 2 + rad, d / 2 - rad, 90),
          (-w / 2 + rad, -d / 2 + rad, 180), (w / 2 - rad, -d / 2 + rad, 270)]
    for cx, cy, a0 in cs:
        for i in range(seg + 1):
            a = R(a0 + 90 * i / seg)
            pts.append((cx + rad * cos(a), cy + rad * sin(a)))
    n = len(pts)
    V = [(x, y, z) for x, y in pts] + [(x, y, z + h) for x, y in pts]
    F = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    F += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return V, F


def lathe_geo(profile, segs=20, ribs=0.0, cap_start=True, cap_end=True):
    """Revolve (radius, z) around Z. ribs alternates radius for a pleated look."""
    V, F = [], []
    for r, z in profile:
        for j in range(segs):
            a = 2 * pi * j / segs
            rr = r * (1 + ribs * (j % 2))
            V.append((rr * cos(a), rr * sin(a), z))
    for i in range(len(profile) - 1):
        for j in range(segs):
            k = (j + 1) % segs
            F.append((i * segs + j, i * segs + k, (i + 1) * segs + k, (i + 1) * segs + j))
    if cap_start and profile[0][0] > 0:
        F.append(tuple(reversed(range(segs))))
    if cap_end and profile[-1][0] > 0:
        b = (len(profile) - 1) * segs
        F.append(tuple(range(b, b + segs)))
    return V, F


def tube_geo(pts, r, sides=6, closed=False):
    pts = [Vector(p) for p in pts]
    n = len(pts)
    V, F = [], []
    prev = None
    for i, p in enumerate(pts):
        if closed:
            t = pts[(i + 1) % n] - pts[i - 1]
        else:
            t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        t.normalize()
        if prev is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            a = t.cross(ref).normalized()
        else:
            a = (prev - t * prev.dot(t)).normalized()
        b = t.cross(a)
        prev = a
        for s in range(sides):
            ang = 2 * pi * (s + 0.5) / sides
            rr = r[min(i, len(r) - 1)] if isinstance(r, (list, tuple)) else r
            q = p + a * (cos(ang) * rr) + b * (sin(ang) * rr)
            V.append(tuple(q))
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        for s in range(sides):
            u = (s + 1) % sides
            F.append((i * sides + s, i * sides + u, j * sides + u, j * sides + s))
    if not closed:
        F.append(tuple(reversed(range(sides))))
        F.append(tuple(range((n - 1) * sides, n * sides)))
    return V, F


def mesh(name, geo, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in geo[0]], [], geo[1])
    me.update()
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ACTIVE.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def group(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.05
    ACTIVE.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def on_desk(x, y, rz=0.0, z=DESK_Z):
    return dict(loc=(x, y, z), rot=(0, 0, R(rz)))


# -------------------------------------------------------------- detail geo
def rr_pts(w, d, rad, seg=3):
    pts = []
    for cx, cy, a0 in ((w / 2 - rad, d / 2 - rad, 0), (-w / 2 + rad, d / 2 - rad, 90),
                       (-w / 2 + rad, -d / 2 + rad, 180), (w / 2 - rad, -d / 2 + rad, 270)):
        for i in range(seg + 1):
            a = R(a0 + 90 * i / seg)
            pts.append((cx + rad * cos(a), cy + rad * sin(a)))
    return pts


def loft_geo(rings, seg=3):
    """rings: (w, d, corner radius, z). Stacks rounded rectangles and caps both ends."""
    V, F = [], []
    n = len(rr_pts(1, 1, 0.1, seg))
    for w, d, rad, z in rings:
        V += [(x, y, z) for x, y in rr_pts(w, d, rad, seg)]
    for i in range(len(rings) - 1):
        for j in range(n):
            k = (j + 1) % n
            F.append((i * n + j, i * n + k, (i + 1) * n + k, (i + 1) * n + j))
    F.append(tuple(reversed(range(n))))
    F.append(tuple(range((len(rings) - 1) * n, len(rings) * n)))
    return V, F


def rslab_geo(w, d, h, rad, bevel=0.001, seg=3, z=0.0):
    """Rounded slab with a chamfered top and bottom edge."""
    b = bevel
    ri = max(rad - b, 0.0004)
    return loft_geo([(w - 2 * b, d - 2 * b, ri, z), (w, d, rad, z + b),
                     (w, d, rad, z + h - b), (w - 2 * b, d - 2 * b, ri, z + h)], seg)


def keycap_geo(w, d, h, c, cx, cy):
    x, y = w / 2, d / 2
    V = [(cx - x, cy - y, 0), (cx + x, cy - y, 0), (cx + x, cy + y, 0), (cx - x, cy + y, 0),
         (cx - x + c, cy - y + c, h), (cx + x - c, cy - y + c, h),
         (cx + x - c, cy + y - c, h), (cx - x + c, cy + y - c, h)]
    return V, [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


KEY_ROWS = [
    (0.6, [15 / 14] * 14),
    (1.0, [1] * 13 + [2]),
    (1.0, [1.5] + [1] * 12 + [1.5]),
    (1.0, [1.75] + [1] * 11 + [2.25]),
    (1.0, [2.25] + [1] * 10 + [2.75]),
    (1.0, [1, 1, 1.25, 1.25, 5, 1.25, 1.25, 1, 1, 1]),
]


def keys_geo(u, gap, h):
    caps = []
    y = sum(r[0] for r in KEY_ROWS) * u / 2
    for rh, row in KEY_ROWS:
        x = -7.5 * u
        for w in row:
            caps.append(keycap_geo(w * u - gap, rh * u - gap, h, h * 0.45,
                                   x + w * u / 2, y - rh * u / 2))
            x += w * u
        y -= rh * u
    return merge(*caps)


def extrude_xz(poly, depth):
    """Extrude a possibly concave (x, z) outline along Y, centred on the origin."""
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly)))
    if area < 0:
        poly = list(reversed(poly))
    n = len(poly)
    V = [(x, -depth / 2, z) for x, z in poly] + [(x, depth / 2, z) for x, z in poly]
    F = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
    F += [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
    return V, F


def pad_geo(w, d, t, k=5, cols=10, curve=0.0, crown=0.0):
    """Squircle cushion in XY. curve bends the edges towards -Z, crown domes the +Z face."""
    def uv(i, j):
        u, v = 2 * i / cols - 1, 2 * j / cols - 1
        m = max(abs(u), abs(v))
        if m == 0:
            return 0.0, 0.0
        s = m / (abs(u) ** k + abs(v) ** k) ** (1 / k)
        return u * s, v * s

    top, bot = [], []
    for j in range(cols + 1):
        for i in range(cols + 1):
            u, v = uv(i, j)
            bend = -curve * u * u
            top.append((u * w / 2, v * d / 2, t + bend + crown * (1 - u * u) * (1 - v * v)))
            bot.append((u * w / 2, v * d / 2, bend))
    idx = lambda i, j: j * (cols + 1) + i
    N = (cols + 1) ** 2
    F = []
    for j in range(cols):
        for i in range(cols):
            q = (idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1))
            F.append(q)
            F.append(tuple(a + N for a in reversed(q)))
    border = ([idx(i, 0) for i in range(cols)] + [idx(cols, j) for j in range(cols)]
              + [idx(i, cols) for i in range(cols, 0, -1)] + [idx(0, j) for j in range(cols, 0, -1)])
    for a, b in zip(border, border[1:] + border[:1]):
        F.append((a + N, b + N, b, a))
    return top + bot, F


def dome_geo(w, d, h, rings=7, segs=20, k=2.6):
    """Mouse-style dome on a superellipse outline, hump towards -Y."""
    out = []
    for j in range(segs):
        a = 2 * pi * j / segs
        c, s = cos(a), sin(a)
        out.append((abs(c) ** (2 / k) * (1 if c >= 0 else -1) * w / 2,
                    abs(s) ** (2 / k) * (1 if s >= 0 else -1) * d / 2))
    V = []
    for i in range(rings):
        a = R(80) * i / (rings - 1)
        V += [(x * cos(a), y * cos(a), h * sin(a) * (1 - 0.22 * y * cos(a) / (d / 2))) for x, y in out]
    F = []
    for i in range(rings - 1):
        for j in range(segs):
            k2 = (j + 1) % segs
            F.append((i * segs + j, i * segs + k2, (i + 1) * segs + k2, (i + 1) * segs + j))
    F.append(tuple(reversed(range(segs))))
    F.append(tuple(range((rings - 1) * segs, rings * segs)))
    return V, F


def fillet(pts, r, n=3, closed=False):
    """Round a polyline's corners with quadratic curves."""
    pts = [Vector(p) for p in pts]
    N, out = len(pts), []
    for i, p in enumerate(pts):
        if not closed and i in (0, N - 1):
            out.append(p)
            continue
        d1, d2 = pts[i - 1] - p, pts[(i + 1) % N] - p
        rr = min(r, d1.length * 0.45, d2.length * 0.45)
        s, e = p + d1.normalized() * rr, p + d2.normalized() * rr
        for k in range(n + 1):
            t = k / n
            out.append(s * (1 - t) ** 2 + p * (2 * t * (1 - t)) + e * t ** 2)
    return out


# -------------------------------------------------------------------- build
M = {k: toon(k, *v) for k, v in PALETTE.items()}
M_SCREEN = flat("M_Screen", PALETTE["M_Dark"][2] if P["lamp"] else PALETTE["M_Main"][0])  # screens stay dark by lamplight; lit, the period's lit color
M_BULB = flat("M_Bulb", P["bulb"])
MAIN, PAPER, SHEET, DARK = M["M_Main"], M["M_Paper"], M["M_Sheet"], M["M_Dark"]


def screen_quad(name, w, h, z0, y, parent):
    """Upright 0-1 UV quad, ready for a screen texture."""
    ob = mesh(name, ([(-w / 2, 0, z0), (w / 2, 0, z0), (w / 2, 0, z0 + h), (-w / 2, 0, z0 + h)], [(0, 1, 2, 3)]),
              M_SCREEN, parent, loc=(0, y, 0))
    uv = ob.data.uv_layers.new(name="UVMap")
    for li, co in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[li].uv = co
    return ob


# --- room
use("Room")
mesh("Floor", box_geo(4.8, 4.2, 0.1, (0.2, -0.9, -0.05)), MAIN)
mesh("BackWall", box_geo(4.8, 0.2, 3.0, (0.2, 1.1, 1.5)), MAIN)
mesh("BackWall_Baseboard", box_geo(4.8, 0.016, 0.1, (0.2, 0.992, 0.05)), MAIN)
WIN_Y0, WIN_Y1, SILL, HEAD = -3.0, 0.6, 0.35, 2.75
wx = -2.1
ly = WIN_Y1 - WIN_Y0
yc = (WIN_Y0 + WIN_Y1) / 2
mesh("WinWall_Pier", box_geo(0.2, 0.6, 3.0, (wx, 0.9, 1.5)), MAIN)   # runs into the back wall to seal the corner
mesh("WinWall_Sill", box_geo(0.2, ly, SILL, (wx, yc, SILL / 2)), MAIN)
mesh("WinWall_Head", box_geo(0.2, ly, 0.25, (wx, yc, HEAD + 0.125)), MAIN)
mesh("WinWall_Baseboard", box_geo(0.016, ly + 0.4, 0.1, (-1.992, yc + 0.2, 0.05)), MAIN)
mesh("Win_SillBoard", box_geo(0.27, ly, 0.03, (wx + 0.03, yc, SILL + 0.015)), MAIN)
for i, y in enumerate((-2.1, -1.2, -0.3)):
    mesh(f"Win_Mullion_{i}", merge(
        box_geo(0.2, 0.09, HEAD - SILL, (wx, y, (HEAD + SILL) / 2)),
        box_geo(0.05, 0.14, HEAD - SILL, (wx + 0.075, y, (HEAD + SILL) / 2)),
        box_geo(0.05, 0.14, HEAD - SILL, (wx - 0.075, y, (HEAD + SILL) / 2)),
    ), MAIN)
mesh("Win_Transom", merge(
    box_geo(0.2, ly, 0.05, (wx, yc, 1.75)),
    box_geo(0.044, ly, 0.09, (wx + 0.074, yc, 1.75)),   # recessed so it doesn't share a plane with the mullions
    box_geo(0.044, ly, 0.09, (wx - 0.074, yc, 1.75)),
), MAIN)
mesh("Win_FrameHead", box_geo(0.044, ly, 0.04, (wx + 0.074, yc, HEAD - 0.02)), MAIN)
mesh("Win_FrameJamb", box_geo(0.05, 0.04, HEAD - SILL, (wx + 0.075, WIN_Y1 - 0.02, (HEAD + SILL) / 2)), MAIN)

# --- desk: thin chamfered top on two trestles
use("Furniture")
desk = group("Desk")
TOP_T = 0.03
LEG_Z = DESK_Z - TOP_T
mesh("Desk_Top", rslab_geo(1.7, 0.8, TOP_T, 0.008, 0.002, 2, DESK_Z - TOP_T), MAIN, desk)
for sx, tag in ((-0.62, "L"), (0.62, "R")):
    t = group(f"Desk_Trestle_{tag}", desk, loc=(sx, 0, 0))
    g = merge(
        tube_geo([(0, -0.31, 0.02), (0, -0.055, LEG_Z - 0.03)], [0.031, 0.024], 4),
        tube_geo([(0, 0.31, 0.02), (0, 0.055, LEG_Z - 0.03)], [0.031, 0.024], 4),
        rslab_geo(0.056, 0.68, 0.026, 0.008, 0.002, 2),
        rslab_geo(0.08, 0.36, 0.03, 0.006, 0.002, 2, LEG_Z - 0.03),
        box_geo(0.024, 0.37, 0.034, (0, 0, 0.36)),
    )
    mesh(f"Desk_Trestle_{tag}_Frame", g, MAIN, t)
    # Washer and bolt head on the leg faces, at the foot, crossbar and top joints.
    # Each entry is (height, distance from centre, leg half-thickness at that height).
    bolts = []
    for bz, by, face in ((0.06, 0.295, 0.0212), (0.36, 0.179, 0.019), (0.64, 0.07, 0.0168)):
        for y in (-by, by):
            for s in (-1, 1):
                b = lathe_geo([(0.0125, 0), (0.0125, 0.0012), (0.0085, 0.0012), (0.0085, 0.0042), (0.006, 0.0054)], 6)
                bolts.append(([(v[2] * s + face * s, v[1] + y, v[0] + bz) for v in b[0]],
                              b[1] if s > 0 else [tuple(reversed(f)) for f in b[1]]))
    mesh(f"Desk_Trestle_{tag}_Bolts", merge(*bolts), DARK, t)
mesh("Desk_Stretcher", rslab_geo(1.22, 0.05, 0.026, 0.003, 0.002, 1), MAIN, desk,
     loc=(0, 0.013, 0.36), rot=(R(90), 0, 0))

# --- chair: curved shell and cushion on a bent-tube sled frame
chair = group("Chair", loc=(-0.02, -0.86, 0), rot=(0, 0, R(-6)))
mesh("Chair_Seat", pad_geo(0.5, 0.48, 0.05, 5, 10, crown=0.014), MAIN, chair, loc=(0, 0, 0.44), smooth=True)
shell = mesh("Chair_Back", pad_geo(0.5, 0.64, 0.02, 6, 10, curve=0.035), MAIN, chair,
             loc=(0, -0.27, 0.84), rot=(R(100), 0, 0), smooth=True)
mesh("Chair_BackPad", pad_geo(0.45, 0.59, 0.03, 6, 10, curve=0.031), MAIN, shell,
     loc=(0, 0, -0.03), smooth=True)
frame = []
for s in (-1, 1):
    x = s * 0.27
    path = [(x, 0.28, 0.012), (x, -0.30, 0.012), (x, -0.26, 0.44), (x, -0.24, 0.66),
            (x, 0.20, 0.66), (x, 0.24, 0.62), (x, 0.20, 0.42)]
    frame.append(tube_geo(fillet(path, 0.05, 3, closed=True), 0.012, 8, closed=True))
    mesh(f"Chair_ArmPad_{'L' if s < 0 else 'R'}", rslab_geo(0.05, 0.3, 0.02, 0.016, 0.004, 3), MAIN, chair,
         loc=(x, 0.0, 0.668))
frame.append(tube_geo([(-0.27, 0.0, 0.43), (0.27, 0.0, 0.43)], 0.012, 8))
frame.append(tube_geo([(-0.27, 0.28, 0.012), (0.27, 0.28, 0.012)], 0.012, 8))
frame.append(tube_geo([(-0.27, -0.262, 0.46), (0.27, -0.262, 0.46)], 0.012, 8))
for x in (-0.12, 0.12):
    frame.append(tube_geo([(x, -0.262, 0.46), (x, -0.262, 0.62)], 0.009, 6))
mesh("Chair_Frame", merge(*frame), DARK, chair, smooth=True)

# --- desk items
use("DeskItems")
MAT_Z = DESK_Z + 0.0008

# Trimmed blueprint acts as a desk mat
bp = group("Blueprint", **on_desk(-0.02, -0.16))
mesh("Blueprint_Sheet", box_geo(0.52, 0.36, 0.0008, (0, 0, 0.0004)), M["M_Blueprint"], bp)
ls = group("LooseSheet", **on_desk(0.60, -0.19))
mesh("LooseSheet_Sheet", box_geo(0.21, 0.297, 0.0006, (0, 0, 0.0003)), SHEET, ls)

# Wireless keyboard: a slim wedge, rising towards the back
kb = group("Keyboard", **on_desk(-0.075, -0.16, 0, MAT_Z))
KW, KD, KH = 0.292, 0.106, 0.009
kv, kf = rslab_geo(KW, KD, KH, 0.009, 0.0012)
kv = [(x, y, z * (0.55 + 0.45 * (y / KD + 0.5))) for x, y, z in kv]
mesh("Keyboard_Body", (kv, kf), MAIN, kb)
mesh("Keyboard_Keys", keys_geo(0.0186, 0.0023, 0.0011), DARK, kb, loc=(0, 0, 0.0069), rot=(R(2.2), 0, 0))

# Wireless mouse. Mouse_Wheel spins on X.
mouse = group("Mouse", **on_desk(0.15, -0.16, -4, MAT_Z))
mesh("Mouse_Body", dome_geo(0.062, 0.112, 0.033), MAIN, mouse, smooth=True)
mesh("Mouse_Wheel", lathe_geo([(0.0065, -0.003), (0.0065, 0.003)], 12), DARK, mouse,
     loc=(0, 0.03, 0.0215), rot=(0, R(90), 0), smooth=True)

# Laptop. Laptop_Lid hinges on X: rotation.x -15deg is open, +90deg is closed.
lap = group("Laptop", **on_desk(-0.62, -0.13, 18))
LW, LD, LT = 0.32, 0.222, 0.011
mesh("Laptop_Base", rslab_geo(LW, LD, LT, 0.012, 0.0012), MAIN, lap)
mesh("Laptop_Keys", keys_geo(0.0192, 0.0024, 0.0006), DARK, lap, loc=(0, 0.024, LT))
mesh("Laptop_Trackpad", rrect_geo(0.105, 0.066, 0.0003, 0.006, 3), SHEET, lap, loc=(0, -0.07, LT))
mesh("Laptop_Hinge", lathe_geo([(0.0048, -0.11), (0.0048, 0.11)], 8), DARK, lap,
     loc=(0, LD / 2 - 0.002, LT + 0.0035), rot=(0, R(90), 0), smooth=True)
lid = group("Laptop_Lid", lap, loc=(0, LD / 2 - 0.002, LT + 0.0062), rot=(R(-15), 0, 0))
mesh("Laptop_LidShell", rslab_geo(LW, LD, 0.005, 0.012, 0.0008), MAIN, lid,
     loc=(0, 0, LD / 2), rot=(R(90), 0, 0))
mesh("Laptop_Bezel", rrect_geo(LW - 0.003, LD - 0.003, 0.0002, 0.0105, 3), DARK, lid,
     loc=(0, -0.005, LD / 2), rot=(R(90), 0, 0))
screen_quad("Laptop_Screen", LW - 0.016, LD - 0.02, 0.009, -0.0054, lid)

# Monitor: slim panel with a tapered rear housing on a leaning stand.
# Monitor_Panel tilts on X.
mon = group("Monitor", **on_desk(-0.02, 0.20))
mesh("Monitor_Base", rslab_geo(0.24, 0.17, 0.007, 0.014, 0.0018), MAIN, mon, loc=(0, 0.02, 0))
neck = mesh("Monitor_Neck", rslab_geo(0.05, 0.25, 0.012, 0.01, 0.0015), MAIN, mon,
            loc=(0, 0.052, 0.128), rot=(R(95), 0, 0))
mesh("Monitor_CableHole", rrect_geo(0.022, 0.05, 0.0003, 0.0105, 3), DARK, neck, loc=(0, -0.05, 0.012))
pan = group("Monitor_Panel", mon, loc=(0, 0.0, 0.26), rot=(R(-3), 0, 0))
MW, MH = 0.615, 0.355
mesh("Monitor_Shell", rslab_geo(MW, MH, 0.008, 0.007, 0.0012), MAIN, pan,
     loc=(0, 0.004, 0), rot=(R(90), 0, 0))
mesh("Monitor_Bezel", rrect_geo(MW - 0.003, MH - 0.003, 0.0002, 0.0055, 3), DARK, pan,
     loc=(0, -0.004, 0), rot=(R(90), 0, 0))
mesh("Monitor_Back", loft_geo([(0.59, 0.33, 0.02, 0), (0.5, 0.28, 0.03, 0.012), (0.3, 0.2, 0.03, 0.022)]), MAIN, pan,
     loc=(0, 0.004, 0), rot=(R(-90), 0, 0))
screen_quad("Monitor_Screen", MW - 0.016, MH - 0.018, -(MH - 0.018) / 2, -0.0043, pan)

# Desk lamp in the back corner, behind the laptop and beside the books. Joints turn on
# local Y, and the bulb sits inside the ribbed shade. The web scene turns it on at night.
lamp = group("Lamp", **on_desk(-0.72, 0.28, -28))
mesh("Lamp_Base", lathe_geo([(0.074, 0), (0.074, 0.012), (0.05, 0.022)], 24), MAIN, lamp)
j1 = group("Lamp_Joint1", lamp, loc=(0, 0, 0.022), rot=(0, R(-14), 0))
mesh("Lamp_ArmLower", tube_geo([(0, 0, 0), (0, 0, 0.34)], 0.0065, 8), MAIN, j1, smooth=True)
j2 = group("Lamp_Joint2", j1, loc=(0, 0, 0.34), rot=(0, R(84), 0))
mesh("Lamp_ArmUpper", tube_geo([(0, 0, 0), (0, 0, 0.3)], 0.0065, 8), MAIN, j2, smooth=True)
mesh("Lamp_Knuckle", lathe_geo([(0.016, -0.012), (0.016, 0.012)], 12), MAIN, j2,
     rot=(R(90), 0, 0), smooth=True)
j3 = group("Lamp_Joint3", j2, loc=(0, 0, 0.3), rot=(0, R(88), 0))
mesh("Lamp_Neck", lathe_geo([(0.03, 0), (0.03, 0.02)], 12), MAIN, j3)
mesh("Lamp_Shade", lathe_geo([(0.03, 0.02), (0.048, 0.055)], 26, ribs=0.11, cap_start=False, cap_end=False), MAIN, j3)
mesh("Lamp_Skirt", lathe_geo([(0.05, 0.055), (0.092, 0.13)], 26, cap_start=False, cap_end=False), MAIN, j3)
mesh("Lamp_Bulb", lathe_geo([(0.014, 0.03), (0.026, 0.055), (0.018, 0.08), (0.0, 0.088)], 12), M_BULB, j3, smooth=True)

# Pencil cup
cup = group("PencilCup", **on_desk(0.40, 0.24))
mesh("PencilCup_Body", lathe_geo([(0.039, 0), (0.041, 0.002), (0.041, 0.103), (0.0395, 0.105),
                                  (0.038, 0.103), (0.037, 0.006)], 24), MAIN, cup, smooth=True)
PENCILS = [(0.016, 0.01, 8, 0, MAIN), (-0.016, 0.014, -7, 40, DARK), (0.006, -0.018, 3, 90, M["M_Accent"]),
           (-0.013, -0.012, -4, 150, MAIN), (0.021, -0.008, 10, 210, DARK)]
for i, (x, y, tilt, spin, mat) in enumerate(PENCILS):
    h = 0.17 + i * 0.008
    pc = mesh(f"PencilCup_Pencil_{i}", lathe_geo([(0.0042, 0), (0.0042, h - 0.022)], 6), mat, cup,
              loc=(x, y, 0.006), rot=(R(tilt), R(tilt * 0.6), R(spin)))
    mesh(f"PencilCup_Tip_{i}", lathe_geo([(0.0042, h - 0.022), (0.0, h)], 6), SHEET, pc)
ticks = [box_geo(0.006 if k % 5 == 0 else 0.0035, 0.0004, 0.0005, (-0.008, -0.0013, 0.02 + k * 0.016)) for k in range(11)]
rul = mesh("PencilCup_Ruler", box_geo(0.022, 0.0024, 0.2, (0, 0, 0.1)), SHEET, cup,
           loc=(-0.004, 0.02, 0.006), rot=(R(-7), R(5), R(20)))
mesh("PencilCup_RulerTicks", merge(*ticks), DARK, rul)

# Three stacked books, spines to the front. Each child can lift off the pile.
stack = group("Books", **on_desk(-0.44, 0.24, 90))


def book(name, w, d, t, z):
    b = group(name, stack, loc=(0, 0, z))
    cv, rx = 0.0028, 0.006
    x0 = -w / 2 + rx
    arc = lambda r_x, r_z: [(x0 + r_x * cos(R(a)), t / 2 + r_z * sin(R(a))) for a in range(90, 271, 15)]
    poly = [(w / 2, t)]
    poly += arc(rx, t / 2)
    poly += [(w / 2, 0), (w / 2, cv)]
    poly += list(reversed(arc(rx - cv, t / 2 - cv)))
    poly += [(w / 2, t - cv)]
    cover = mesh(f"{name}_Cover", extrude_xz(poly, d), MAIN, b)
    for i in range(1, 13):             # smooth the outer spine so its first facet leaves no thin crease
        cover.data.polygons[2 + i].use_smooth = True
    mesh(f"{name}_Pages", box_geo(w - 0.012, d - 0.008, t - 2 * cv, (0.0025, 0, t / 2)), PAPER, b)
    return t


z = 0.0
for nm, w, d, t in (("Book_A", 0.30, 0.22, 0.038), ("Book_B", 0.27, 0.205, 0.03), ("Book_C", 0.235, 0.17, 0.024)):
    z += book(nm, w, d, t, z)

# Spiral notebook, cover hinged along the coil
note = group("Notebook", **on_desk(0.36, -0.19))
NW, ND = 0.21, 0.28
mesh("Notebook_Back", rslab_geo(NW, ND, 0.0015, 0.005, 0.0004), DARK, note)
mesh("Notebook_Pages", rrect_geo(NW - 0.003, ND - 0.003, 0.009, 0.004, 3, 0.0015), SHEET, note)
tabs = [box_geo(0.012, 0.017, 0.0005, (NW / 2 + 0.002, y, z)) for y, z in
        ((0.108, 0.0088), (0.066, 0.0072), (0.03, 0.0082), (-0.022, 0.0058), (-0.078, 0.0074))]
mesh("Notebook_Tabs", merge(*tabs), M["M_Accent"], note)
nlid = group("Notebook_Cover", note, loc=(-NW / 2, 0, 0.0105))
mesh("Notebook_CoverBoard", rslab_geo(NW, ND, 0.0015, 0.005, 0.0004), DARK, nlid, loc=(NW / 2, 0, 0))
coils = []
for i in range(17):
    y = -ND / 2 + 0.012 + i * (ND - 0.024) / 16
    ring = [(0.008 + 0.0085 * cos(a), y, 0.0065 + 0.0085 * sin(a))
            for a in (2 * pi * k / 8 for k in range(8))]
    coils.append(tube_geo(ring, 0.0008, 3, closed=True))
mesh("Notebook_Coil", merge(*coils), MAIN, note, loc=(-NW / 2 - 0.002, 0, 0))

# Click pen, lying parallel to the sheets. Pen_Button clicks along local Z.
pen = group("Pen", loc=(0.745, -0.19, DESK_Z + 0.0055), rot=(0, R(90), R(90)))
mesh("Pen_Body", lathe_geo([(0.0005, -0.07), (0.0012, -0.066), (0.0028, -0.056), (0.0052, -0.036),
                            (0.0052, 0.02), (0.0049, 0.021), (0.0049, 0.024), (0.0052, 0.025), (0.0052, 0.07)], 12),
     DARK, pen, smooth=True)
mesh("Pen_Button", lathe_geo([(0.0034, 0.07), (0.0034, 0.08), (0.0024, 0.082)], 10), MAIN, pen)
clip = tube_geo(fillet([(0.0052, 0, 0.066), (0.0078, 0, 0.066), (0.0078, 0, 0.022), (0.0064, 0, 0.02)], 0.002, 2), 0.0012, 4)
mesh("Pen_Clip", clip, MAIN, pen)

# Mug, with a dark coffee surface that can be swapped or animated
mug = group("Mug", **on_desk(0.66, 0.24, 180))
mesh("Mug_Body", lathe_geo([(0.036, 0), (0.0395, 0.003), (0.042, 0.016), (0.042, 0.088), (0.0405, 0.0925),
                            (0.0385, 0.0905), (0.038, 0.07), (0.036, 0.006)], 28), MAIN, mug, smooth=True)
mesh("Mug_Coffee", lathe_geo([(0.0378, 0.0705), (0.0378, 0.0715)], 24), DARK, mug)
handle = fillet([(0.0405, 0, 0.074), (0.074, 0, 0.074), (0.074, 0, 0.024), (0.0405, 0, 0.024)], 0.021, 4)
mesh("Mug_Handle", tube_geo(handle, 0.0052, 8), MAIN, mug, smooth=True)

# Phone, face up
ph = group("Phone", **on_desk(0.53, 0.24))
mesh("Phone_Body", rslab_geo(0.073, 0.15, 0.0075, 0.011, 0.0012), DARK, ph)
mesh("Phone_Screen", rrect_geo(0.0675, 0.1445, 0.0002, 0.0085, 3, 0.0075), M_SCREEN, ph)
mesh("Phone_Button", box_geo(0.0012, 0.02, 0.0028, (0.037, 0.03, 0.004)), MAIN, ph)

# Small plant, the scene's one green accent
pl = group("Plant", **on_desk(0.78, 0.30))
mesh("Plant_Saucer", lathe_geo([(0.04, 0), (0.05, 0.008), (0.047, 0.008), (0.04, 0.003)], 18), MAIN, pl, smooth=True)
mesh("Plant_Pot", lathe_geo([(0.036, 0.003), (0.047, 0.07), (0.05, 0.071), (0.05, 0.083), (0.046, 0.083), (0.044, 0.072)], 18),
     MAIN, pl, smooth=True)
mesh("Plant_Soil", lathe_geo([(0.0445, 0.0715), (0.0445, 0.0725)], 18), DARK, pl)


def leaf(length, width, bend):
    V, F = [], []
    n = 7
    for i in range(n):
        t = i / (n - 1)
        hw = width * sin(pi * min(t * 1.05 + 0.02, 1)) * 0.5
        x, z = length * t, length * 0.75 * t - bend * t * t
        V += [(x, -hw, z), (x, 0, z - width * 0.14), (x, hw, z)]
    for i in range(n - 1):
        a = i * 3
        F += [(a, a + 3, a + 4, a + 1), (a + 1, a + 4, a + 5, a + 2)]
    return V, F


for i in range(11):
    a = i * 137.5
    ln = 0.11 + (i % 3) * 0.02
    mesh(f"Plant_Leaf_{i}", leaf(ln, 0.042, 0.05 + 0.02 * (i % 2)), M["M_Green"], pl,
         loc=(0, 0, 0.07), rot=(0, 0, R(a)), smooth=True)

# --- room shell: a hidden ceiling and a longer window wall, so sunlight can only enter
# through the window. Never visible to the camera, here or on the website.
exec(compile(open(DOG_FILE).read(), DOG_FILE, "exec"), globals())

use("RoomShell")
M_SHELL = bpy.data.materials.get("M_Shell") or bpy.data.materials.new("M_Shell")
for shell_name, shell_geo in (("Shell_Ceiling", box_geo(5.4, 18, 0.2, (0.5, -7.8, 3.1))),
                              ("Shell_Wall", box_geo(0.2, 13, 3.2, (-2.1, -9.5, 1.5)))):
    mesh(shell_name, shell_geo, M_SHELL).visible_camera = False

# --- light and camera
use("Rig")
key_d = bpy.data.lights.new("Sun_Key", "SUN")
key_d.energy = P["sun"]
key_d.angle = R(0.25)
key_d.use_shadow = True
key = bpy.data.objects.new("Sun_Key", key_d)
ACTIVE.objects.link(key)
sx, sy, sz = P["sunFrom"]  # web axes: x, y up, z toward the camera
key.rotation_euler = Vector((sx, -sz, sy)).to_track_quat("Z", "Y").to_euler()

# Lamp light, for the periods that use it. It sits at the bulb and shines out of the shade.
bpy.context.view_layer.update()
head = bpy.data.objects["Lamp_Joint3"].matrix_world
lamp_aim = head.to_3x3().col[2].normalized()
lamp_d = bpy.data.lights.new("Lamp_Light", "SPOT")
lamp_d.energy = LAMP_WATTS if P["lamp"] else 0.0
lamp_d.spot_size = R(80)
lamp_d.spot_blend = 0.0
lamp_d.use_shadow = True
lamp_ob = bpy.data.objects.new("Lamp_Light", lamp_d)
ACTIVE.objects.link(lamp_ob)
lamp_ob.location = head.translation + lamp_aim * 0.1  # just past the bulb, which would block it
lamp_ob.rotation_euler = lamp_aim.to_track_quat("-Z", "Y").to_euler()

fill_d = bpy.data.lights.new("Fill_Sky", "SUN")
fill_d.energy = 0.62
fill_d.use_shadow = False
fill = bpy.data.objects.new("Fill_Sky", fill_d)
ACTIVE.objects.link(fill)
fill.rotation_euler = Vector((0.2, -0.3, 1.0)).to_track_quat("Z", "Y").to_euler()

cam_d = bpy.data.cameras.new("Cam_Hero")
cam_d.lens = 28
cam = bpy.data.objects.new("Cam_Hero", cam_d)
ACTIVE.objects.link(cam)
cam.location = (0.32, -2.24, 1.66)
aim = Vector((-0.46, 0.0, 0.84))
cam.rotation_euler = (aim - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
bpy.context.view_layer.update()

# --- world: pale sky for the camera, no ambient on surfaces
w = scene.world or bpy.data.worlds.new("World")
scene.world = w
w.use_nodes = True
t = w.node_tree
t.nodes.clear()
out = t.nodes.new("ShaderNodeOutputWorld")
mix = t.nodes.new("ShaderNodeMixShader")
sky = t.nodes.new("ShaderNodeBackground")
sky.inputs[0].default_value = lin(P["sky"])
none = t.nodes.new("ShaderNodeBackground")
none.inputs[0].default_value = (0, 0, 0, 1)
lp = t.nodes.new("ShaderNodeLightPath")
t.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
t.links.new(none.outputs[0], mix.inputs[1])
t.links.new(sky.outputs[0], mix.inputs[2])
t.links.new(mix.outputs[0], out.inputs[0])

# --- render settings
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
if hasattr(scene.render, "use_freestyle"):
    scene.render.use_freestyle = True
    scene.render.line_thickness = 0.55
    fs = bpy.context.view_layer.freestyle_settings
    for ls_ in fs.linesets:
        ls_.linestyle.color = lin(P["line"])[:3]
        ls_.linestyle.alpha = 0.8

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons)
           for o in root.all_objects if o.type == "MESH")
print("objects", len(root.all_objects), "tris", tris)
