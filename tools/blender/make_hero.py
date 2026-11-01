"""
Builds the Web City hero in Blender: a stylised spider-hero made of smooth shapes, rigged to a
simple skeleton, with six looping animations, exported as a GLB the site loads.

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


# ---------------------------------------------------------------- mesh parts

parts = []


def ellipsoid(name, loc, scale, mat, bone, rot=None):
    """Smooth ellipsoid, fully weighted to one bone. `rot` is a Quaternion or None."""
    size = max(scale)
    segs, rings = (8, 5) if size < 0.03 else (14, 9) if size < 0.07 else (22, 13)
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
    """Ellipsoid stretched from p0 to p1, like a capsule."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return ellipsoid(name, (p0 + p1) / 2, (radius, depth or radius, d.length / 2 + radius * 0.35), mat, bone, rot)


def build_body(m):
    red, blue, ink, lens = m["red"], m["blue"], m["ink"], m["lens"]

    # Torso
    ellipsoid("pelvis", (0, 0, 0.95), (0.165, 0.115, 0.11), blue, "hips")
    ellipsoid("abdomen", (0, 0, 1.12), (0.15, 0.105, 0.14), red, "spine")
    ellipsoid("chest", (0, 0, 1.34), (0.205, 0.13, 0.18), red, "chest")
    for s in (1, -1):
        ellipsoid(f"lat{s}", (s * 0.15, 0.01, 1.28), (0.075, 0.105, 0.15), blue, "chest")
    ellipsoid("neck", (0, 0, 1.55), (0.06, 0.06, 0.07), red, "neck")

    # Head and lenses
    ellipsoid("head", (0, 0, 1.71), (0.11, 0.115, 0.135), red, "head")
    for s in (1, -1):
        tilt = Quaternion((0, 0, 1), math.radians(s * 22)) @ Quaternion((0, 1, 0), math.radians(-s * 24))
        ellipsoid(f"rim{s}", (s * 0.05, -0.1, 1.724), (0.05, 0.012, 0.037), ink, "head", tilt)
        ellipsoid(f"lens{s}", (s * 0.05, -0.106, 1.724), (0.041, 0.012, 0.029), lens, "head", tilt)

    # Chest emblem: an original eight-legged mark
    ellipsoid("emblem_body", (0, -0.128, 1.36), (0.022, 0.01, 0.042), ink, "chest")
    ellipsoid("emblem_head", (0, -0.126, 1.415), (0.014, 0.009, 0.016), ink, "chest")
    for s in (1, -1):
        for k, ang in enumerate((40, 15, -15, -40)):
            a = math.radians(ang)
            start = Vector((s * 0.015, -0.125, 1.37 + (1.5 - k) * 0.012))
            end = start + Vector((s * math.cos(a) * 0.075, 0.012, math.sin(a) * 0.075))
            limb(f"emblem_leg{s}{k}", start, end, 0.0055, ink, "chest", depth=0.006)

    # Arms (left = +X)
    for s, side in ((1, "L"), (-1, "R")):
        ellipsoid(f"shoulder{side}", (s * 0.235, 0, 1.44), (0.075, 0.075, 0.075), red, f"upperarm.{side}")
        limb(f"upperarm{side}", (s * 0.24, 0, 1.43), (s * 0.26, 0.01, 1.18), 0.052, red, f"upperarm.{side}")
        ellipsoid(f"elbow{side}", (s * 0.26, 0.01, 1.17), (0.048, 0.048, 0.048), red, f"forearm.{side}")
        limb(f"forearm{side}", (s * 0.26, 0.01, 1.16), (s * 0.27, 0.0, 0.94), 0.044, red, f"forearm.{side}")
        limb(f"glove{side}", (s * 0.268, 0.0, 1.02), (s * 0.27, 0.0, 0.94), 0.05, blue, f"forearm.{side}")
        ellipsoid(f"hand{side}", (s * 0.272, -0.01, 0.875), (0.035, 0.03, 0.06), red, f"hand.{side}")

    # Legs
    for s, side in ((1, "L"), (-1, "R")):
        limb(f"thigh{side}", (s * 0.1, 0, 0.9), (s * 0.11, 0, 0.52), 0.078, blue, f"thigh.{side}")
        ellipsoid(f"knee{side}", (s * 0.11, -0.005, 0.5), (0.062, 0.062, 0.062), blue, f"shin.{side}")
        limb(f"shin{side}", (s * 0.11, 0, 0.49), (s * 0.11, 0.0, 0.26), 0.058, blue, f"shin.{side}")
        limb(f"boot{side}", (s * 0.11, 0, 0.3), (s * 0.11, 0.0, 0.09), 0.056, red, f"shin.{side}")
        ellipsoid(f"foot{side}", (s * 0.11, -0.045, 0.045), (0.055, 0.115, 0.045), red, f"foot.{side}")


# ---------------------------------------------------------------- skeleton

BONES = [
    # name, head, tail, parent, connected
    ("root", (0, 0, 0), (0, 0.2, 0), None, False),
    ("hips", (0, 0, 0.92), (0, 0, 1.02), "root", False),
    ("spine", (0, 0, 1.02), (0, 0, 1.22), "hips", True),
    ("chest", (0, 0, 1.22), (0, 0, 1.5), "spine", True),
    ("neck", (0, 0, 1.5), (0, 0, 1.6), "chest", True),
    ("head", (0, 0, 1.6), (0, 0, 1.86), "neck", True),
]
for s, side in ((1, "L"), (-1, "R")):
    BONES += [
        (f"upperarm.{side}", (s * 0.24, 0, 1.44), (s * 0.26, 0.01, 1.17), "chest", False),
        (f"forearm.{side}", (s * 0.26, 0.01, 1.17), (s * 0.27, 0, 0.92), f"upperarm.{side}", True),
        (f"hand.{side}", (s * 0.27, 0, 0.92), (s * 0.272, -0.01, 0.82), f"forearm.{side}", True),
        (f"thigh.{side}", (s * 0.1, 0, 0.9), (s * 0.11, 0, 0.5), "hips", False),
        (f"shin.{side}", (s * 0.11, 0, 0.5), (s * 0.11, 0, 0.1), f"thigh.{side}", True),
        (f"foot.{side}", (s * 0.11, 0, 0.1), (s * 0.11, -0.14, 0.03), f"shin.{side}", True),
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
    mats = {
        "red": material("SuitRed", RED, 0.42),
        "blue": material("SuitBlue", BLUE, 0.5),
        "ink": material("Ink", INK, 0.6),
        "lens": material("Lens", LENS, 0.2, emit=1.5),
    }
    arm = build_armature()
    capture_rest(arm)
    build_body(mats)

    bpy.ops.object.select_all(action="DESELECT")
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = "Hero"
    body.parent = arm
    mod = body.modifiers.new("Rig", "ARMATURE")
    mod.object = arm

    build_animations(arm)

    path = out_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_apply=False,
        export_yup=True,
    )
    print(f"[make_hero] wrote {path} ({os.path.getsize(path) // 1024} KB, {len(body.data.vertices)} verts)")


main()
