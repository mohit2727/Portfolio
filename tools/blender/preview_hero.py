"""
Renders a contact sheet of the exported hero: one still per animation, read back from the GLB so
it checks exactly what the site will load.

  blender --background --python tools/blender/preview_hero.py -- public/models/hero.glb out_dir
"""

import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
glb, out_dir = os.path.abspath(args[0]), os.path.abspath(args[1])
os.makedirs(out_dir, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.show_cavity = True
scene.render.resolution_x, scene.render.resolution_y = 360, 460
scene.render.film_transparent = False
scene.world = scene.world or bpy.data.worlds.new("World")

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.2
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
target = Vector((0, 0, 0.9))
cam.location = target + Vector((1.8, -3.2, 0.8))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

arm.animation_data_create()
for act in bpy.data.actions:
    arm.animation_data.action = act
    if hasattr(arm.animation_data, "action_slot") and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    start, end = act.frame_range
    scene.frame_set(int(start + (end - start) * 0.3))
    name = act.name.split("_")[0] if act.name.startswith(("idle", "run", "swing", "air", "climb", "perch")) else act.name
    scene.render.filepath = os.path.join(out_dir, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[preview] {act.name} -> {scene.render.filepath}")
