"""Подготовка CC0-сканов Poly Haven: Blender -b --python tools/godot/prepare-gorge.py -- /tmp/gorge-source /tmp/gorge-fern.
Исходники: glTF 1K coastal_cliff_02 и fern_02, вместе с файлами include API Poly Haven.
"""
import bpy, bmesh, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--') + 1:]
for slug, directory, budget in [('coastal_cliff_02', args[0], 10000), ('fern_02', args[1], 2000)]:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(directory) / (slug + '.gltf')))
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH': continue
        bpy.context.view_layer.objects.active = obj
        if len(obj.data.polygons) > budget:
            mod = obj.modifiers.new('StoneBudget', 'DECIMATE')
            mod.ratio = budget / len(obj.data.polygons)
            bpy.ops.object.modifier_apply(modifier=mod.name)
    if slug == 'coastal_cliff_02':
        # Нижний открытый край скана уходит в грунт: нет висящих пластин между уступами.
        for obj in bpy.context.scene.objects:
            if obj.type != 'MESH': continue
            xs=[v.co.x for v in obj.data.vertices]; ys=[v.co.y for v in obj.data.vertices]; zs=[v.co.z for v in obj.data.vertices]
            lo,hi=min(zs),max(zs)
            bm=bmesh.new(); bm.from_mesh(obj.data)
            original_faces=len(bm.faces)
            edges=[e for e in bm.edges if e.is_boundary and sum(v.co.z for v in e.verts)/2 < lo+(hi-lo)*.7]
            result=bmesh.ops.extrude_edge_only(bm,edges=edges)
            for v in result['geom']:
                if isinstance(v,bmesh.types.BMVert): v.co.z=lo-(hi-lo)
            bm.to_mesh(obj.data); bm.free()
            mask=obj.data.uv_layers.new(name='SkirtMask')
            for face in obj.data.polygons:
                for loop in face.loop_indices: mask.data[loop].uv=(1.0 if face.index>=original_faces else 0.0,0.0)
            for v in obj.data.vertices:
                v.co.x=(v.co.x-(min(xs)+max(xs))/2)/(max(xs)-min(xs))
                v.co.y=(v.co.y-(min(ys)+max(ys))/2)/(max(ys)-min(ys))
                v.co.z=(v.co.z-lo)/(hi-lo)
            for polygon in obj.data.polygons: polygon.use_smooth=True
    output = root / 'godot/assets/gorge' / (slug + '.glb')
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_cameras=False, export_lights=False, export_extras=False)

# Один валун из набора вместо прежних округлых основ, без изменения точек и размеров.
if len(args)>2:
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(args[2])/'rock_moss_set_01.gltf'))
    keep=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'rock02' in o.name)
    for obj in list(bpy.context.scene.objects):
        if obj != keep: bpy.data.objects.remove(obj,do_unlink=True)
    keep.location=(0,0,0)
    bpy.context.view_layer.objects.active=keep
    mod=keep.modifiers.new('StoneBudget','DECIMATE'); mod.ratio=min(1,2400/len(keep.data.polygons)); bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.export_scene.gltf(filepath=str(root/'godot/assets/gorge/moss_boulder.glb'),export_format='GLB',export_cameras=False,export_lights=False,export_extras=False)
