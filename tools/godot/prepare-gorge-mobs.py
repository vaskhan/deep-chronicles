"""CC0 Quaternius monsters -> canonical rig; scanned Poly Haven stone guardian.
blender -b -P tools/godot/prepare-gorge-mobs.py
Source meshes, UVs and skin weights retained; anatomical T-pose fitted to library.
"""
import bpy, math, os, random
from mathutils import Vector, Matrix
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
os.chdir(ROOT)
LIB='public/assets/anims/AnimationLibrary_Godot_Standard.nofingers.gltf'
OUT='godot/assets/gorge-mobs'
def imp(path):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=os.path.abspath(path));return [o for o in bpy.data.objects if o not in before]
def canonical():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 objs=imp(LIB);arm=next(o for o in objs if o.type=='ARMATURE');arm.animation_data_clear()
 for p in arm.pose.bones:p.matrix_basis.identity()
 for o in objs:
  if o!=arm:bpy.data.objects.remove(o,do_unlink=True)
 return arm

def fit(v):
 def lerp(x,knots):
  for (a,b),(c,d) in zip(knots,knots[1:]):
   if x<=c:return b+(x-a)/(c-a)*(d-b)
  a,b=knots[-1];return b+(x-a)*.65
 x,y,z=v
 # Body landmarks and arm joints in the original author T-pose.
 z1=lerp(z,[(0,0),(.546,.532),(.968,.932),(1.818,1.441),(2.062,1.61),(3.5,2.48)])
 if z>1.48:
  x1=lerp(abs(x),[(0,0),(.365,.192),(1.204,.466),(1.737,.739),(2.4,1.05)])
 else:x1=abs(x)*.52
 return Vector((math.copysign(x1,x),(y-.20)*.58,z1))

def bone_name(s):
 base={'Root':'root','Body':'root','Hips':'DEF-hips','Abdomen':'DEF-spine.001','Torso':'DEF-spine.003','Neck':'DEF-neck','Head':'DEF-head'}
 if s in base:return base[s]
 for old,new in [('UpperArm','upper_arm'),('LowerArm','forearm'),('Shoulder','shoulder'),('UpperLeg','thigh'),('LowerLeg','shin'),('Foot','foot')]:
  if s.startswith(old+'.'):return 'DEF-'+new+s[-2:]
 if any(s.startswith(x) for x in ['Pinky','Middle','Index','Thumb']):return 'DEF-hand'+s[-2:]
 return 'root'

def bind(o,arm,weights=None,bone=None):
 o.parent=arm;o.matrix_parent_inverse=arm.matrix_world.inverted();o.matrix_world=Matrix.Identity(4)
 o.vertex_groups.clear()
 if bone:
  g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
 else:
  for i,ws in enumerate(weights):
   for name,w in ws.items():
    g=o.vertex_groups.get(name) or o.vertex_groups.new(name=name);g.add([i],w,'REPLACE')
 mod=o.modifiers.new('Canonical skin','ARMATURE');mod.object=arm

def material(name,color,rough=.85,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m

def staff(arm):
 # A local rigid prop, skinned to the canonical palm; body remains the author mesh.
 hand=arm.data.bones['DEF-hand.R'];origin=hand.head_local+Vector((-.065,0,0))
 wood=material('Dark ash wood',(.12,.075,.035));bone=material('Old ivory',(.45,.39,.26))
 for name,r,depth,z,mat in [('TotemStaff',.022,1.68,.23,wood),('TotemCollar',.047,.1,.95,bone)]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=depth,location=origin+Vector((0,0,z)))
  o=bpy.context.object;o.name=name;o.data.materials.append(mat);world=o.matrix_world.copy()
  for v in o.data.vertices:v.co=world@v.co
  bind(o,arm,bone='DEF-hand.R')

 # Antler fork — several tapered branches, deliberately asymmetric silhouette.
 for s in [-1,1]:
  bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=.035,radius2=.007,depth=.32,location=origin+Vector((s*.08,0,1.09)))
  o=bpy.context.object;o.name='TotemAntler';o.rotation_euler.y=s*.5;o.data.materials.append(bone);bpy.context.view_layer.update();world=o.matrix_world.copy()
  for v in o.data.vertices:v.co=world@v.co
  bind(o,arm,bone='DEF-hand.R')

def pelt(arm):
 # Authored fur mantle and skirt, over the CC0 author body. Jagged hem and UV fur.
 rng=random.Random(341)
 image=bpy.data.images.new('Fang hide',width=256,height=256)
 pixels=[]
 for y in range(256):
  for x in range(256):
   f=.65+.16*math.sin(x*.61+math.sin(y*.08))+.12*rng.random()
   pixels.extend([.23*f,.145*f,.075*f,1])
 image.pixels[:]=pixels;image.pack()
 mat=material('Weathered hide',(.23,.145,.075));node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
 mat.node_tree.links.new(node.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 for name,z,rx,ry,height,b in [('FurMantle',1.48,.38,.24,.29,'DEF-spine.003'),('FurKilt',1.0,.29,.20,.28,'DEF-hips')]:
  verts=[];faces=[];n=32
  for row in range(2):
   for i in range(n):
    a=i*2*math.pi/n;r=1 if row else .7
    verts.append((rx*r*math.cos(a),ry*r*math.sin(a),z-row*height-(rng.random()*.09 if row else 0)))
  for i in range(n):faces.append((i,(i+1)%n,(i+1)%n+n,i+n))
  mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();uv=mesh.uv_layers.new()
  for poly in mesh.polygons:
   for li in poly.loop_indices:
    vi=mesh.loops[li].vertex_index;uv.data[li].uv=(vi%n/n,vi//n)
  o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat);mat.use_backface_culling=False;bind(o,arm,bone=b)

def save(id,arm):
 bpy.ops.object.select_all(action='DESELECT')
 arm.select_set(True)
 for o in bpy.context.scene.objects:
  if o.type=='MESH' and o.parent==arm:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,id+'.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True)
 print('MODEL',id,'triangles',sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in bpy.context.selected_objects if o.type=='MESH'))

for id,source in [('fang_warrior','Orc'),('fang_shaman','Tribal')]:
 arm=canonical();objs=imp('art/sources/gorge-mobs/'+source+'.gltf');old=next(o for o in objs if o.type=='ARMATURE');old.animation_data_clear()
 for p in old.pose.bones:p.matrix_basis.identity()
 bpy.context.view_layer.update()
 meshes=[o for o in objs if o.type=='MESH'];graded=set()
 for o in meshes:
  world=o.matrix_world.copy();names={g.index:bone_name(g.name)for g in o.vertex_groups};weights=[]
  for v in o.data.vertices:
   source_pos=world@v.co
   ws={}
   for g in v.groups:
    n=names[g.group];ws[n]=ws.get(n,0)+g.weight
   if not ws:ws={'DEF-hand.R':1} if 'Weapon' in o.name else {'DEF-hips':1}
   weights.append(ws);v.co=fit(source_pos)
   if id=='fang_warrior' and abs(v.co.x)<.30 and .85<v.co.z<1.45:v.co.x*=1.3
   if 'Weapon' in o.name:
    # Author club is in the LEFT hand; Sword_Attack strikes with the RIGHT.
    p=source_pos-Vector((1.84,.15,1.82))
    v.co=arm.data.bones['DEF-hand.R'].head_local+Vector((-.065,0,0))+Vector((-p.x,p.z,-p.y))*.5
    weights[-1]={'DEF-hand.R':1}
  o.parent=None
  for mod in list(o.modifiers):o.modifiers.remove(mod)
  bind(o,arm,weights=weights)
  for m in o.data.materials:
   if m and m.use_nodes:
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.9
    # Desaturate and darken the embedded author palette without changing UVs.
    for node in list(m.node_tree.nodes):
     if node.type=='TEX_IMAGE' and node.image.name not in graded:
      graded.add(node.image.name)
      # glTF does not export arbitrary shader nodes: bake palette adjustment into image.
      image=node.image;pix=list(image.pixels[:])
      for i in range(0,len(pix),4):
       lum=sum(pix[i:i+3])/3
       for c in range(3):pix[i+c]=(lum+(pix[i+c]-lum)*.55)*.68
      image.pixels[:]=pix;image.update();image.pack();m.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color'])
 bpy.data.objects.remove(old,do_unlink=True)
 if id=='fang_shaman':staff(arm)
 if id=='fang_warrior':pelt(arm)
 save(id,arm)

arm=canonical();rocks=imp('godot/assets/gorge/moss_boulder.glb');rock=next(o for o in rocks if o.type=='MESH')
# A closed scanned boulder, reduced once, reused as articulated stone slabs.
bpy.context.view_layer.objects.active=rock;rock.select_set(True)
mod=rock.modifiers.new('Stone budget','DECIMATE');mod.ratio=.23;bpy.ops.object.modifier_apply(modifier=mod.name)
coords=[v.co for v in rock.data.vertices];lo=Vector([min(v[i]for v in coords)for i in range(3)]);hi=Vector([max(v[i]for v in coords)for i in range(3)]);center=(lo+hi)/2;size=hi-lo
for v in rock.data.vertices:v.co=Vector([(v.co[i]-center[i])/size[i]for i in range(3)])
parts=[('Thorax','DEF-spine.003',(0,0,1.35),(.85,.52,.52)),('Waist','DEF-spine.001',(0,0,1.05),(.58,.42,.35)),('Pelvis','DEF-hips',(0,0,.87),(.6,.45,.3)),('Crown','DEF-head',(0,-.015,1.72),(.48,.4,.34)),('StoneWard','DEF-forearm.L',(.61,-.26,1.45),(.65,.20,.67))]
for side,sign in [('L',1),('R',-1)]:
 for label,b,loc,dim in [('Shoulder','upper_arm',(.27,0,1.47),(.42,.47,.44)),('Arm','upper_arm',(.39,0,1.42),(.36,.35,.34)),('Forearm','forearm',(.60,0,1.44),(.38,.42,.4)),('Fist','hand',(.80,-.015,1.44),(.31,.37,.36)),('Thigh','thigh',(.12,0,.74),(.32,.36,.40)),('Shin','shin',(.10,.025,.36),(.29,.33,.38)),('Foot','foot',(.1,-.10,.10),(.34,.49,.22))]:
  parts.append((label+side,'DEF-'+b+'.'+side,(sign*loc[0],loc[1],loc[2]),dim))
for name,b,loc,dim in parts:
 o=bpy.data.objects.new(name,rock.data.copy());bpy.context.collection.objects.link(o)
 for v in o.data.vertices:v.co=Vector([v.co[i]*dim[i]+loc[i]for i in range(3)])
 bind(o,arm,bone=b)
for o in rocks:bpy.data.objects.remove(o,do_unlink=True)
eye=material('Amber core',(.3,.13,.015),.55)
p=eye.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(.8,.31,.025,1);p.inputs['Emission Strength'].default_value=.7
for s in [-1,1]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=1,location=(s*.07,-.20,1.76))
 o=bpy.context.object;o.name='StoneEye';o.scale=(.036,.014,.016);o.data.materials.append(eye);bpy.context.view_layer.update();world=o.matrix_world.copy()
 for v in o.data.vertices:v.co=world@v.co
 bind(o,arm,bone='DEF-head')
# One body draw per material; only the server-controlled ward stays separate.
bpy.ops.object.select_all(action='DESELECT')
body=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==arm and o.name!='StoneWard']
for o in body:o.select_set(True)
bpy.context.view_layer.objects.active=body[0];bpy.ops.object.join();bpy.context.object.name='StoneBody'
save('stone_guard',arm)
