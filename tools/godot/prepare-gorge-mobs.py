"""CC0 Quaternius monsters -> canonical rig; scanned Poly Haven stone guardian.
blender -b -P tools/godot/prepare-gorge-mobs.py
Source meshes, UVs and skin weights retained; anatomical T-pose fitted to library.
"""
import bpy, math, os, random, sys
sys.path.insert(0,os.path.dirname(__file__))
import importlib
style=importlib.import_module("mob-style")
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
 for name,z,rx,ry,height,b in [('FurMantle',1.48,.50,.43,.29,'DEF-spine.003'),('FurKilt',1.0,.29,.20,.28,'DEF-hips')]:
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
  style.fang(o,id=='fang_shaman')
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
 bpy.data.objects.remove(old,do_unlink=True)
 style.braids(arm,bind,id=='fang_shaman')
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

# KayKit CC0 warrior: retain author topology, fit the bind pose, reuse canonical clips.
arm=canonical();objs=imp('art/sources/gorge-mobs/Skeleton_Warrior.glb');old=next(o for o in objs if o.type=='ARMATURE');old.animation_data_clear()
for p in old.pose.bones:p.matrix_basis.identity()
bpy.context.view_layer.update()
def kaybone(n):
 base={'root':'root','hips':'DEF-hips','spine':'DEF-spine.001','chest':'DEF-spine.003','head':'DEF-head'}
 if n in base:return base[n]
 for a,b in [('upperarm','upper_arm'),('lowerarm','forearm'),('wrist','hand'),('hand','hand'),('upperleg','thigh'),('lowerleg','shin'),('foot','foot'),('toes','toe')]:
  if n.startswith(a+'.'):return 'DEF-'+b+'.'+n[-1].upper()
 return 'root'
def kayfit(v):
 x,y,z=v
 knots=[(0,0),(.292,.532),(.519,.932),(1.107,1.441),(1.241,1.61),(2.5,2.47)]
 for (a,b),(c,d) in zip(knots,knots[1:]):
  if z<=c:break
 z1=b+(z-a)/(c-a)*(d-b)
 return Vector((x*.9,y*.78,z1))
for o in objs:
 if o.type!='MESH':continue
 world=o.matrix_world.copy();names={g.index:kaybone(g.name)for g in o.vertex_groups};weights=[]
 for v in o.data.vertices:
  ws={}
  for g in v.groups:
   n=names[g.group];ws[n]=ws.get(n,0)+g.weight
  weights.append(ws or {'DEF-hips':1});v.co=kayfit(world@v.co)
  if any(k in o.name for k in ['Head','Jaw','Eyes','Helmet']):
   pivot=Vector((0,0,1.61));v.co=pivot+Vector(((v.co.x-pivot.x)*.73,(v.co.y-pivot.y)*.76,(v.co.z-pivot.z)*.86))
 o.parent=None
 for mod in list(o.modifiers):o.modifiers.remove(mod)
 bind(o,arm,weights=weights)
 # Preserve author gradient/albedo structure; the final colour is intentionally quiet.
 for m in o.data.materials:
  if not m or not m.use_nodes:continue
  p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.83
  p.inputs['Emission Strength'].default_value=0
  for n in m.node_tree.nodes:
   if n.type=='TEX_IMAGE' and not n.image.get('styled'):
    image=n.image;pix=list(image.pixels[:])
    for i in range(0,len(pix),4):
     r,g,b=pix[i:i+3];lum=.3*r+.5*g+.2*b
     for c,mul in enumerate([.78,.76,.68]):pix[i+c]=(lum+(pix[i+c]-lum)*.22)*mul
    image.pixels[:]=pix;image.pack();image['styled']=True
 if 'Head' in o.name or 'Jaw' in o.name:
  o.data.materials.clear();o.data.materials.append(style.surface('Outpost old bone',(.38,.35,.26)))
 if 'Eyes' in o.name:
  o.data.materials.clear();o.data.materials.append(material('Outpost embers',(.25,.11,.035)))
 if 'Helmet' in o.name:
  o.data.materials.clear();o.data.materials.append(style.surface('Outpost iron',(.27,.29,.28),'iron'))
 if 'Cloak' in o.name:
  o.data.materials.clear();o.data.materials.append(style.surface('Outpost worn cloth',(.25,.24,.20)))
bpy.data.objects.remove(old,do_unlink=True)
iron=style.surface('Outpost iron',(.27,.29,.28),'iron');leather=style.surface('Outpost shield hide',(.29,.25,.19));edge=style.surface('Outpost edge',(.35,.34,.29),'iron')
# Tower shield in bind pose: long axis follows forearm; after lowering the arm
# it stands vertically. Bevelled outline, raised central rib, iron border.
outline=[(-.65,-.23),(-.54,-.31),(.45,-.31),(.59,-.18),(.64,0),(.59,.18),(.45,.31),(-.54,.31),(-.65,.23)]
center=Vector((.61,-.23,1.44));verts=[]
for depth,factor in [(0,1),(-.045,.86)]:
 for x,y in outline:verts.append(center+Vector((x*factor,depth,y*factor)))
verts.append(center+Vector((0,-.075,0)));faces=[];n=len(outline)
for i in range(n):faces.append((i,(i+1)%n,(i+1)%n+n,i+n));faces.append((n+i,n+(i+1)%n,2*n))
faces.append(tuple(reversed(range(n))))
me=bpy.data.meshes.new('TowerShield');me.from_pydata(verts,[],faces);me.update();me.materials.append(iron);me.materials.append(leather)
uv=me.uv_layers.new()
for p in me.polygons:
 p.material_index=1 if p.index%2 else 0
 for li in p.loop_indices:
  co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co.x,co.z)
o=bpy.data.objects.new('TowerShield',me);bpy.context.collection.objects.link(o);bind(o,arm,bone='DEF-forearm.L')
# Long narrow crest and broad shoulder plates read as armour, not bare ribs.
for s,side in [(-1,'R'),(1,'L')]:
 o=style.tube('OutpostPauldron',[(s*.23,0,1.46),(s*.32,0,1.46),(s*.43,0,1.45)],[.15,.20,.12],iron);bind(o,arm,bone='DEF-upper_arm.'+side)
 o=style.tube('OutpostGreave',[(s*.10,.03,.16),(s*.10,.015,.33),(s*.10,0,.48)],[.07,.105,.10],iron);bind(o,arm,bone='DEF-shin.'+side)
hand=arm.data.bones['DEF-hand.R'].head_local
# Sword in the right palm, same orientation as the existing Fang club.
o=style.tube('OutpostSword',[hand+Vector((-.055,0,-.13)),hand+Vector((-.055,0,.15)),hand+Vector((-.055,0,.80)),hand+Vector((-.055,0,.98))],[.035,.055,.045,.002],iron);bind(o,arm,bone='DEF-hand.R')
save('outpost_guard',arm)

# Rock spider: CC0 scan shell, authored eight articulated legs, no TRELLIS source.
bpy.ops.wm.read_factory_settings(use_empty=True)
rocks=imp('godot/assets/gorge/moss_boulder.glb');rock=next(o for o in rocks if o.type=='MESH')
bpy.context.view_layer.objects.active=rock;rock.select_set(True)
mod=rock.modifiers.new('Shell budget','DECIMATE');mod.ratio=.40;bpy.ops.object.modifier_apply(modifier=mod.name)
coords=[v.co for v in rock.data.vertices];lo=Vector([min(v[i]for v in coords)for i in range(3)]);hi=Vector([max(v[i]for v in coords)for i in range(3)])
for v in rock.data.vertices:v.co=Vector([(v.co[i]-(lo[i]+hi[i])/2)/(hi[i]-lo[i])for i in range(3)])
rockmat=rock.data.materials[0]
legmat=style.surface('Spider moss basalt',(.21,.24,.17),'skin')
armdata=bpy.data.armatures.new('SpiderSkeleton');arm=bpy.data.objects.new('SpiderRig',armdata);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def spiderbone(name,head,tail,parent=None):
 b=armdata.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=armdata.edit_bones[parent]
spiderbone('root',(0,0,0),(0,0,.2));spiderbone('body',(0,0,.65),(0,-.3,.65),'root');spiderbone('head',(0,-.35,.65),(0,-.8,.65),'body')
legs=[]
for s in [-1,1]:
 for i in range(4):
  y=-.57+i*.36;hip=(s*.30,y,.65);knee=(s*(1.08+(.13 if i in [1,2]else 0)),y+(-.3+i*.18),.86);toe=(s*(1.44+(.16 if i in [1,2]else 0)),y+(-.65+i*.36),.025)
  n='leg_%s_%s'%(s,i);legs.append((n,hip,knee,toe));spiderbone(n,hip,knee,'body');spiderbone(n+'_lower',knee,toe,n)
bpy.ops.object.mode_set(mode='OBJECT')
for name,loc,dim,b in [('Abdomen',(0,.40,.72),(1.35,1.5,.65),'body'),('Carapace',(0,-.40,.63),(1.00,.90,.53),'head')]:
 o=bpy.data.objects.new(name,rock.data.copy());bpy.context.collection.objects.link(o)
 for v in o.data.vertices:v.co=Vector([v.co[i]*dim[i]+loc[i]for i in range(3)])
 bind(o,arm,bone=b)
for n,hip,knee,toe in legs:
 mid=Vector(hip).lerp(Vector(knee),.42)+Vector((0,0,.06));o=style.tube('BasaltCoxa',[hip,mid,knee],[.10,.15,.10],legmat);bind(o,arm,bone=n)
 mid=Vector(knee).lerp(Vector(toe),.48);o=style.tube('BasaltTibia',[knee,mid,toe],[.105,.068,.018],legmat);bind(o,arm,bone=n+'_lower')
for o in rocks:bpy.data.objects.remove(o,do_unlink=True)
chitin=style.surface('Spider dark chitin',(.18,.20,.16))
for s in [-1,1]:
 o=style.tube('Mandible',[(s*.20,-.73,.58),(s*.28,-.94,.44),(s*.10,-1.08,.31)],[.105,.078,.008],chitin);bind(o,arm,bone='head')
# Small amber sensory pits, not luminous cartoon eyeballs.
eye=material('Spider amber',(.28,.15,.04),.7)
for s in [-1,1]:
 for i in range(2):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.025,location=(s*(.09+i*.095),-.815,.69+i*.025));o=bpy.context.object;o.name='SpiderEye';o.data.materials.append(eye);world=o.matrix_world.copy()
  for v in o.data.vertices:v.co=world@v.co
  bind(o,arm,bone='head')
arm.animation_data_create()
for clip,seconds in [('idle',3),('walk',1.1),('run',.65),('windup',.7),('attack',.42),('cast',.65),('hit',.24),('death',1.1)]:
 action=bpy.data.actions.new(clip);arm.animation_data.action=action;frames=round(seconds*24)
 for f in range(frames+1):
  t=f/frames;phase=t*math.tau
  for p in arm.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
  body=arm.pose.bones['body'];head=arm.pose.bones['head']
  if clip=='idle':body.scale=(1+math.sin(phase)*.008,1,1+math.sin(phase)*.006)
  elif clip in ['walk','run']:
   for j,(n,_,_,_) in enumerate(legs):
    wave=math.sin(phase+((j%4+j//4)%2)*math.pi);p=arm.pose.bones[n];p.rotation_euler.z=wave*.18;p.rotation_euler.x=wave*.18
    arm.pose.bones[n+'_lower'].rotation_euler.x=max(0,-wave)*.32
  elif clip=='windup':head.rotation_euler.x=t*.24;body.location.y=-t*.04
  elif clip in ['attack','cast']:head.rotation_euler.x=-math.sin(t*math.pi)*.3;body.location.z=-math.sin(t*math.pi)*.15
  elif clip=='hit':body.rotation_euler.z=math.sin(t*math.pi)*.09
  else:
   fall=min(1,t*1.5);arm.pose.bones['root'].rotation_euler.z=fall*math.pi/2;arm.pose.bones['root'].location.y=math.sin(fall*math.pi/2)*1.5
   for n,_,_,_ in legs:arm.pose.bones[n+'_lower'].rotation_euler.x=fall*.65
  for p in arm.pose.bones:p.keyframe_insert('rotation_euler',frame=f);p.keyframe_insert('location',frame=f);p.keyframe_insert('scale',frame=f)
 track=arm.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,0,action);arm.animation_data.action=None
for track in arm.animation_data.nla_tracks:track.mute=True
for p in arm.pose.bones:p.matrix_basis.identity()
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in bpy.context.scene.objects:
 if o.type=='MESH' and o.parent==arm:o.select_set(True)
# One skinned mesh, four shared materials: eight legs do not cost sixteen draws.
bpy.ops.object.select_all(action='DESELECT')
parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==arm]
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name='RockSpiderBody'
arm.select_set(True)
bpy.context.scene.render.fps=24
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'cliff_spider.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True)
