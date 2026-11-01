"""
Builds the Web City hero in Blender: one continuous, smoothly skinned body (Skin + Subdivision
modifiers on a joint graph) with a baked web-lattice suit texture, lenses and chest emblem, rigged
to a simple skeleton with six looping animations, exported as a GLB the site loads.

Run headless from the project root:
  blender --background --python tools/blender/make_hero.py -- public/models/hero.glb

Or open Blender, go to the Scripting tab, open this file and press Run (it writes
public/models/hero.glb next to this project if the path can be resolved).

Coordinates are Blender's: Z up, the hero faces -Y, his left hand is +X. The glTF exporter
converts to Y-up, which makes him face +Z in three.js, matching the game.
"""

import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

FPS = 24
RED = (0.62, 0.04, 0.05, 1)  # linear values; roughly #c81e28 on screen
BLUE = (0.035, 0.09, 0.40, 1)  # roughly #1f3ea6
INK = (0.012, 0.01, 0.015, 1)
LENS = (0.92, 0.94, 1.0, 1)


def out_path():
    if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 1:
        return os.path.abspath(sys.argv[sys.argv.index("--") + 1])
    here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
    return os.path.abspath(os.path.join(here, "..", "..", "public", "models", "hero.glb"))


# ---------------------------------------------------------------- scene and materials

def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for block in list(coll):
            coll.remove(block)
    bpy.context.scene.render.fps = FPS


def material(name, color, rough=0.45, emit=0.0):
    m = bpy.data.materials.new(name)
    if m.node_tree is None:  # Blender 4.x; 5.x creates the node tree already
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


# ---------------------------------------------------------------- joints
#
# One table drives both the body surface and the skeleton, so the bones sit exactly in the limbs.
# Each joint: position, skin radius (width, depth).

J = {
    "pelvis": ((0, 0.0, 0.97), (0.165, 0.12)),
    "waist": ((0, 0.0, 1.10), (0.14, 0.105)),
    "ribs": ((0, -0.005, 1.26), (0.18, 0.125)),
    "chest": ((0, -0.012, 1.40), (0.215, 0.135)),
    "neck0": ((0, 0.0, 1.52), (0.075, 0.07)),
    "neck1": ((0, 0.0, 1.6), (0.06, 0.06)),
}
for s, side in ((1, "L"), (-1, "R")):
    J.update({
        f"shoulder.{side}": ((s * 0.2, 0.0, 1.45), (0.095, 0.088)),
        f"bicep.{side}": ((s * 0.245, 0.005, 1.31), (0.068, 0.07)),
        f"elbow.{side}": ((s * 0.265, 0.012, 1.17), (0.048, 0.05)),
        f"forearm.{side}": ((s * 0.27, 0.004, 1.06), (0.055, 0.052)),
        f"wrist.{side}": ((s * 0.274, 0.0, 0.955), (0.036, 0.032)),
        f"palm.{side}": ((s * 0.276, -0.006, 0.89), (0.045, 0.026)),
        f"fingers.{side}": ((s * 0.277, -0.012, 0.825), (0.034, 0.02)),
        f"thumb.{side}": ((s * 0.252, -0.037, 0.905), (0.015, 0.015)),
        f"hip.{side}": ((s * 0.098, 0.0, 0.92), (0.1, 0.1)),
        f"thigh.{side}": ((s * 0.104, -0.006, 0.73), (0.09, 0.093)),
        f"knee.{side}": ((s * 0.11, -0.008, 0.5), (0.058, 0.062)),
        f"calf.{side}": ((s * 0.112, 0.014, 0.37), (0.066, 0.072)),
        f"ankle.{side}": ((s * 0.112, 0.008, 0.11), (0.038, 0.042)),
        f"toe.{side}": ((s * 0.112, -0.13, 0.04), (0.046, 0.033)),
        f"heel.{side}": ((s * 0.112, 0.035, 0.04), (0.04, 0.035)),
    })

EDGES = [("pelvis", "waist"), ("waist", "ribs"), ("ribs", "chest"), ("chest", "neck0"), ("neck0", "neck1")]
for side in ("L", "R"):
    chain = ["chest", "shoulder", "bicep", "elbow", "forearm", "wrist", "palm", "fingers"]
    EDGES += [(a if a == "chest" else f"{a}.{side}", f"{b}.{side}") for a, b in zip(chain, chain[1:])]
    EDGES += [(f"palm.{side}", f"thumb.{side}")]
    chain = ["pelvis", "hip", "thigh", "knee", "calf", "ankle", "toe"]
    EDGES += [(a if a == "pelvis" else f"{a}.{side}", f"{b}.{side}") for a, b in zip(chain, chain[1:])]
    EDGES += [(f"ankle.{side}", f"heel.{side}")]


def joint(name):
    return J[name][0]


BONES = [
    # name, head, tail, parent, connected
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("hips", (0, 0, 0.92), (0, 0, 1.03), "root", False),
    ("spine", (0, 0, 1.03), (0, 0, 1.24), "hips", True),
    ("chest", (0, 0, 1.24), (0, 0, 1.5), "spine", True),
    ("neck", (0, 0, 1.5), (0, 0, 1.62), "chest", True),
    ("head", (0, 0, 1.62), (0, 0, 1.86), "neck", True),
]
for side in ("L", "R"):
    BONES += [
        (f"upperarm.{side}", joint(f"shoulder.{side}"), joint(f"elbow.{side}"), "chest", False),
        (f"forearm.{side}", joint(f"elbow.{side}"), joint(f"wrist.{side}"), f"upperarm.{side}", True),
        (f"hand.{side}", joint(f"wrist.{side}"), joint(f"fingers.{side}"), f"forearm.{side}", True),
        (f"thigh.{side}", joint(f"hip.{side}"), joint(f"knee.{side}"), "hips", False),
        (f"shin.{side}", joint(f"knee.{side}"), joint(f"ankle.{side}"), f"thigh.{side}", True),
        (f"foot.{side}", joint(f"ankle.{side}"), joint(f"toe.{side}"), f"shin.{side}", True),
    ]


def build_armature():
    data = bpy.data.armatures.new("HeroRig")
    arm = bpy.data.objects.new("HeroRig", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent, connected in BONES:
        b = data.edit_bones.new(name)
        b.head, b.tail = head, tail
        b.roll = 0
        if parent:
            b.parent = data.edit_bones[parent]
            b.use_connect = connected
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


# ---------------------------------------------------------------- body surface

def activate(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def build_skin():
    """Joint graph -> Skin modifier (gives it thickness) -> Subdivision (makes it smooth)."""
    names = list(J)
    mesh = bpy.data.meshes.new("HeroBody")
    mesh.from_pydata([J[n][0] for n in names], [(names.index(a), names.index(b)) for a, b in EDGES], [])
    ob = bpy.data.objects.new("HeroBody", mesh)
    bpy.context.scene.collection.objects.link(ob)
    activate(ob)
    bpy.ops.object.modifier_add(type="SKIN")
    skin = ob.modifiers[-1]
    skin.branch_smoothing = 0.6
    skin.use_smooth_shade = True
    for i, n in enumerate(names):
        sv = mesh.skin_vertices[0].data[i]
        sv.radius = J[n][1]
        sv.use_root = n == "pelvis"
    sub = ob.modifiers.new("Subd", "SUBSURF")
    sub.levels = sub.render_levels = 2
    bpy.ops.object.modifier_apply(modifier=skin.name)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    bpy.ops.object.shade_smooth()
    return ob


def build_head():
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, radius=1.0)
    ob = bpy.context.active_object
    ob.name = "HeroHead"
    for v in ob.data.vertices:
        x, y, z = v.co
        taper = 1.0 - 0.2 * max(0.0, -z)  # narrower jaw and chin
        v.co = Vector((x * 0.1 * taper, y * 0.112 * taper - 0.004, z * 0.128))
    ob.location = (0, -0.005, 1.725)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    return ob


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def skin_weights(ob, arm):
    """Smooth weights from distance to each bone, blending the three nearest. Limb bones are
    measured from slightly down the bone so the pelvis and chest don't get dragged by the legs
    and arms; left-side vertices never take right-side bones and vice versa."""
    bones = []
    for b in arm.data.bones:
        if b.name == "root":
            continue
        a, t = b.head_local.copy(), b.tail_local.copy()
        if b.name.startswith(("upperarm", "thigh")):
            a = a.lerp(t, 0.15)
        bones.append((b.name, a, t))
    groups = {n: ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n) for n, _, _ in bones}
    for v in ob.data.vertices:
        p = v.co
        cands = []
        for n, a, t in bones:
            if (p.x > 0.03 and n.endswith(".R")) or (p.x < -0.03 and n.endswith(".L")):
                continue
            cands.append((seg_dist(p, a, t), n))
        cands.sort()
        top = cands[:3]
        ws = [1.0 / (d ** 4 + 1e-9) for d, _ in top]
        total = sum(ws)
        for (d, n), w in zip(top, ws):
            groups[n].add([v.index], w / total, "REPLACE")


def heat_weights(ob, arm):
    """Blender's automatic (bone heat) weights: they spread along the surface, so the torso side
    and the inner arm stay separate even where they nearly touch. Returns False if Blender could
    not solve every vertex, in which case the caller falls back to distance weights."""
    arm.data.bones["root"].use_deform = False
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    return all(v.groups for v in ob.data.vertices)


def suit_bake_material():
    """Emission shader for baking the suit: blue legs and side panels, red everywhere else, and a
    web lattice (Voronoi cell edges in object space) drawn over both. Regions are computed per
    pixel from object-space position, so the colour borders come out clean."""
    m = bpy.data.materials.new("SuitBake")
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new

    def math(op, a, b=None):
        n = N("ShaderNodeMath")
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs[0]

    def mix(fac, a, b):
        n = N("ShaderNodeMix")
        n.data_type = "RGBA"
        for sock, v in (("A", a), ("B", b)):
            if isinstance(v, tuple):
                n.inputs[sock].default_value = v
            else:
                L(v, n.inputs[sock])
        L(fac, n.inputs["Factor"])
        return n.outputs["Result"]

    coord = N("ShaderNodeTexCoord").outputs["Object"]
    xyz = N("ShaderNodeSeparateXYZ")
    L(coord, xyz.inputs[0])
    x, z = math("ABSOLUTE", xyz.outputs["X"]), xyz.outputs["Z"]
    legs = math("MULTIPLY", math("MULTIPLY", math("GREATER_THAN", z, 0.3), math("LESS_THAN", z, 0.99)), math("LESS_THAN", x, 0.21))
    sides = math("MULTIPLY",
                 math("MULTIPLY", math("GREATER_THAN", z, 0.99), math("LESS_THAN", z, 1.4)),
                 math("MULTIPLY", math("GREATER_THAN", x, 0.13), math("LESS_THAN", x, 0.215)))
    blue_mask = math("MAXIMUM", legs, sides)

    vor = N("ShaderNodeTexVoronoi")
    vor.voronoi_dimensions = "3D"
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = 16.0
    L(coord, vor.inputs["Vector"])
    edge = vor.outputs["Distance"]
    red = mix(math("GREATER_THAN", edge, 0.035), INK, RED)
    blue = mix(math("GREATER_THAN", edge, 0.02), (0.02, 0.05, 0.22, 1), BLUE)
    color = mix(blue_mask, red, blue)

    emit = N("ShaderNodeEmission")
    L(color, emit.inputs["Color"])
    L(emit.outputs[0], N("ShaderNodeOutputMaterial").inputs["Surface"])
    return m


def bake_suit(ob, mats, size=1024):
    activate(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new("SuitTex", size, size, alpha=False)
    for m in mats:
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        m.node_tree.nodes.active = node
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)
    img.pack()

    suit = bpy.data.materials.new("Suit")
    if suit.node_tree is None:
        suit.use_nodes = True
    bsdf = suit.node_tree.nodes.get("Principled BSDF")
    tex = suit.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    suit.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.42
    ob.data.materials.clear()
    ob.data.materials.append(suit)
    for poly in ob.data.polygons:
        poly.material_index = 0


# ---------------------------------------------------------------- rigid details: lenses and emblem

parts = []


def ellipsoid(name, loc, scale, mat, bone, rot=None):
    """Smooth ellipsoid, fully weighted to one bone. `rot` is a Quaternion or None."""
    size = max(scale)
    segs, rings = (8, 5) if size < 0.03 else (16, 10)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1.0)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    if rot is not None:
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = rot
    ob.location = loc
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.data.materials.append(mat)
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    bpy.ops.object.shade_smooth()
    parts.append(ob)
    return ob


def limb(name, p0, p1, radius, mat, bone, depth=None):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return ellipsoid(name, (p0 + p1) / 2, (radius, depth or radius, d.length / 2 + radius * 0.35), mat, bone, rot)


def build_details(ink, lens):
    for s in (1, -1):
        tilt = Quaternion((0, 0, 1), math.radians(s * 24)) @ Quaternion((0, 1, 0), math.radians(-s * 28))
        ellipsoid(f"rim{s}", (s * 0.047, -0.103, 1.738), (0.054, 0.012, 0.04), ink, "head", tilt)
        ellipsoid(f"lens{s}", (s * 0.047, -0.109, 1.738), (0.043, 0.012, 0.031), lens, "head", tilt)
    ellipsoid("emblem_body", (0, -0.145, 1.36), (0.022, 0.01, 0.042), ink, "chest")
    ellipsoid("emblem_head", (0, -0.143, 1.415), (0.014, 0.009, 0.016), ink, "chest")
    for s in (1, -1):
        for k, ang in enumerate((40, 15, -15, -40)):
            a = math.radians(ang)
            start = Vector((s * 0.015, -0.142, 1.37 + (1.5 - k) * 0.012))
            end = start + Vector((s * math.cos(a) * 0.075, 0.01, math.sin(a) * 0.075))
            limb(f"emblem_leg{s}{k}", start, end, 0.0055, ink, "chest", depth=0.006)


# ---------------------------------------------------------------- animation helpers
#
# Poses are written as rotations about armature-space axes, then converted into each bone's
# local frame, so "forward" means the same thing for every limb no matter how its roll came out.

AX = Vector((1, 0, 0))
AY = Vector((0, 1, 0))
AZ = Vector((0, 0, 1))


class Pose(dict):
    """bone name -> list of (axis, degrees) in armature space; plus hips drop in metres."""

    def fwd(self, bone, deg):
        # Positive swings the bone's tail toward the front (-Y), whichever way the bone points.
        rest = REST[bone]
        sign = 1 if rest["dir"].z > 0 else -1
        self.setdefault(bone, []).append((AX, sign * deg))
        return self

    def out(self, bone, deg):
        # Positive lifts a limb away from the body sideways.
        side = 1 if bone.endswith(".L") else -1
        self.setdefault(bone, []).append((AY, -side * deg))
        return self

    def twist(self, bone, deg):
        self.setdefault(bone, []).append((AZ, deg))
        return self


REST = {}


def capture_rest(arm):
    for b in arm.data.bones:
        REST[b.name] = {"q": b.matrix_local.to_quaternion(), "dir": (b.tail_local - b.head_local).normalized()}


def apply_pose(arm, pose, frame, drop=0.0):
    for pb in arm.pose.bones:
        q_world = Quaternion()
        for axis, deg in pose.get(pb.name, []):
            q_world = Quaternion(axis, math.radians(deg)) @ q_world
        r = REST[pb.name]["q"]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = r.inverted() @ q_world @ r
        pb.location = (0, -drop, 0) if pb.name == "hips" else (0, 0, 0)
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def make_action(arm, name, keys):
    """keys: list of (frame, Pose, hips_drop). The last key should repeat the first for loops."""
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for frame, pose, drop in keys:
        apply_pose(arm, pose, frame, drop)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, int(keys[0][0]), act)
    track.mute = True
    arm.animation_data.action = None
    return act


def P():
    return Pose()


def build_animations(arm):
    # Idle: slow breathing sway.
    make_action(arm, "idle", [
        (0, P().out("upperarm.L", 8).out("upperarm.R", 8).fwd("forearm.L", 10).fwd("forearm.R", 10), 0),
        (24, P().fwd("spine", 3).fwd("head", -3).out("upperarm.L", 10).out("upperarm.R", 10).fwd("forearm.L", 14).fwd("forearm.R", 14), 0.005),
        (48, P().out("upperarm.L", 8).out("upperarm.R", 8).fwd("forearm.L", 10).fwd("forearm.R", 10), 0),
    ])

    # Run: 16-frame cycle, opposite arm and leg.
    def run(a):  # a = +1 left leg forward, -1 right leg forward
        p = P().fwd("spine", 12).fwd("head", -8)
        lf, rf = ("thigh.L", "shin.L"), ("thigh.R", "shin.R")
        front, back = (lf, rf) if a > 0 else (rf, lf)
        p.fwd(front[0], 42).fwd(front[1], -18).fwd(back[0], -30).fwd(back[1], -75)
        arm_f, arm_b = ("upperarm.R", "upperarm.L") if a > 0 else ("upperarm.L", "upperarm.R")
        p.fwd(arm_f, 40).fwd(arm_b, -35).out("upperarm.L", 8).out("upperarm.R", 8)
        p.fwd("forearm.L", 70).fwd("forearm.R", 70)
        return p

    def run_pass(a):  # legs crossing under the body, body at its highest
        p = P().fwd("spine", 12).fwd("head", -8)
        up = "L" if a > 0 else "R"
        down = "R" if a > 0 else "L"
        p.fwd(f"thigh.{up}", 25).fwd(f"shin.{up}", -95).fwd(f"thigh.{down}", 0).fwd(f"shin.{down}", -10)
        p.out("upperarm.L", 8).out("upperarm.R", 8).fwd("forearm.L", 75).fwd("forearm.R", 75)
        return p

    make_action(arm, "run", [
        (0, run(1), 0.03), (4, run_pass(-1), -0.01), (8, run(-1), 0.03), (12, run_pass(1), -0.01), (16, run(1), 0.03),
    ])

    # Swing: right arm up on the web, legs tucked, gentle pendulum kick.
    def swing(k):
        p = P().fwd("upperarm.R", 168).out("upperarm.R", 6).fwd("forearm.R", 8)
        p.fwd("upperarm.L", 25 + 10 * k).out("upperarm.L", 55).fwd("forearm.L", 35)
        p.fwd("thigh.L", 55 + 12 * k).fwd("shin.L", -85 - 10 * k).fwd("thigh.R", 25 - 10 * k).fwd("shin.R", -40 + 10 * k)
        p.fwd("spine", 6 * k).fwd("head", -10)
        return p

    make_action(arm, "swing", [(0, swing(0), 0), (16, swing(1), 0), (32, swing(-0.6), 0), (48, swing(0), 0)])

    # Air: arms flung wide, one leg tucked, a little flutter.
    def air(k):
        p = P().out("upperarm.L", 80 + 6 * k).out("upperarm.R", 80 - 6 * k).fwd("upperarm.L", 15).fwd("upperarm.R", 15)
        p.fwd("forearm.L", 20).fwd("forearm.R", 20)
        p.fwd("thigh.L", 50).fwd("shin.L", -90).fwd("thigh.R", -10 + 6 * k).fwd("shin.R", -25)
        p.fwd("spine", -6).fwd("head", -6)
        return p

    make_action(arm, "air", [(0, air(0), 0), (12, air(1), 0), (24, air(0), 0)])

    # Climb: reach up hand over hand, knees driving.
    def climb(a):
        hi, lo = ("L", "R") if a > 0 else ("R", "L")
        p = P().fwd(f"upperarm.{hi}", 160).fwd(f"forearm.{hi}", 15).fwd(f"upperarm.{lo}", 95).fwd(f"forearm.{lo}", 70)
        p.out(f"upperarm.{hi}", 12).out(f"upperarm.{lo}", 20)
        p.fwd(f"thigh.{lo}", 70).fwd(f"shin.{lo}", -100).fwd(f"thigh.{hi}", 15).fwd(f"shin.{hi}", -45)
        p.out(f"thigh.{lo}", 15).out(f"thigh.{hi}", 10).fwd("head", -20)
        return p

    make_action(arm, "climb", [(0, climb(1), 0), (12, climb(-1), 0), (24, climb(1), 0)])

    # Perch: the classic low crouch, one hand down, scanning the city.
    def perch(k):
        p = P().fwd("thigh.L", 95).out("thigh.L", 22).fwd("shin.L", -140).fwd("foot.L", 40)
        p.fwd("thigh.R", 85).out("thigh.R", 28).fwd("shin.R", -130).fwd("foot.R", 35)
        p.fwd("spine", 28).fwd("chest", 12).fwd("head", -38).twist("head", 12 * k)
        p.fwd("upperarm.R", 55).out("upperarm.R", 10).fwd("forearm.R", 15)
        p.fwd("upperarm.L", 30).out("upperarm.L", 30).fwd("forearm.L", 60)
        return p

    make_action(arm, "perch", [(0, perch(0), 0.47), (24, perch(1), 0.465), (48, perch(0), 0.47)])


# ---------------------------------------------------------------- main

def main():
    reset_scene()
    arm = build_armature()
    capture_rest(arm)

    body = build_skin()
    if not heat_weights(body, arm):
        print("[make_hero] heat weights incomplete, using distance weights")
        body.vertex_groups.clear()
        skin_weights(body, arm)
    head = build_head()
    head.vertex_groups.new(name="head").add(list(range(len(head.data.vertices))), 1.0, "REPLACE")
    bake_mat = suit_bake_material()
    body.data.materials.append(bake_mat)
    head.data.materials.append(bake_mat)
    activate(body)
    head.select_set(True)
    bpy.ops.object.join()
    body = bpy.context.active_object
    bake_suit(body, [bake_mat])

    build_details(material("Ink", INK, 0.6), material("Lens", LENS, 0.2, emit=1.6))
    activate(body)
    for ob in parts:
        ob.select_set(True)
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = "Hero"
    body.parent = arm
    rig = next((m for m in body.modifiers if m.type == "ARMATURE"), None) or body.modifiers.new("Rig", "ARMATURE")
    rig.object = arm

    build_animations(arm)

    path = out_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_image_format="JPEG",
        export_apply=False,
        export_yup=True,
    )
    print(f"[make_hero] wrote {path} ({os.path.getsize(path) // 1024} KB, {len(body.data.vertices)} verts)")


main()
