"""Skin generated quadrupeds/arthropods to a small native skeleton and bake clips.
blender -b -P tools/godot/rig-creature.py -- input.glb output.glb wolf|rabbit|boar|spider|scorpion
"""
import bpy,sys,math
from mathutils import Vector,Matrix
src,out,kind=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=src)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
pts=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
lo=Vector([min(p[i]for p in pts)for i in range(3)]);hi=Vector([max(p[i]for p in pts)for i in range(3)])
center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));k=1/(hi.z-lo.z)
for m in meshes:
 world=m.matrix_world.copy();m.parent=None
 for v in m.data.vertices:v.co=(world@v.co-center)*k
 m.matrix_world=Matrix.Identity(4)
 for mat in m.data.materials:
  if mat:mat.use_backface_culling=False
W,L,H=(hi-lo)*k
arthropod=kind in ['spider','scorpion']
armdata=bpy.data.armatures.new('CreatureSkeleton');arm=bpy.data.objects.new('CreatureRig',armdata);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
bones={}
def bone(name,head,tail,parent=None):
 b=armdata.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=armdata.edit_bones[parent]
 bones[name]=(Vector(head),Vector(tail));return b
body_z=.4 if arthropod else .64
bone('root',(0,0,0),(0,0,.15))
bone('body',(0,L*.18,body_z),(0,-L*.22,body_z),'root')
bone('head',(0,-L*.22,body_z),(0,-L*.43,.7 if not arthropod else .43),'body')
legs=[]
for side in [-1,1]:
 for i in range(4 if arthropod else 2):
  y=L*(-.28+i*(.18 if arthropod else .52));x=side*W*(.12 if arthropod else .26)
  mid=(side*W*.38,y+L*.06,.5 if arthropod else .33)
  end=(side*W*.49,y+L*.12,.02) if arthropod else (x,y-.02*L,.04)
  name=f'leg_{side}_{i}';legs.append(name)
  bone(name,(x,y,body_z),mid,'body');bone(name+'_lower',mid,end,name)
if kind in ['wolf','boar','scorpion']:
 bone('tail',(0,L*.25,.62),(0,L*.47,.92 if kind=='scorpion' else .5),'body')
bpy.ops.object.mode_set(mode='OBJECT')
def distance(p,a,b):
 v=b-a;t=max(0,min(1,(p-a).dot(v)/max(v.length_squared,1e-7)));return (p-(a+v*t)).length
for m in meshes:
 for name in bones:m.vertex_groups.new(name=name)
 for v in m.data.vertices:
  p=v.co;names=list(bones)
  names.remove('root')
  if not arthropod:
   if p.z>.57:names=[n for n in names if not n.startswith('leg')]
   elif p.z<.35 and abs(p.x)>W*.1:names=[n for n in names if n.startswith('leg')]
  ds=sorted((distance(p,*bones[n]),n) for n in names)[:3]
  values=[(n,1/max(d,.025)**5)for d,n in ds];total=sum(w for _,w in values)
  for n,w in values:m.vertex_groups[n].add([v.index],w/total,'REPLACE')
 m.parent=arm;mod=m.modifiers.new('Skin','ARMATURE');mod.object=arm
arm.animation_data_create()
for clip,seconds in [('idle',3),('walk',1.1),('run',.65),('windup',.7),('attack',.42),('cast',.65),('hit',.24),('death',1.1)]:
 action=bpy.data.actions.new(clip);arm.animation_data.action=action
 frames=round(seconds*24)
 for f in range(frames+1):
  t=f/frames;phase=t*math.tau
  for p in arm.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
  body=arm.pose.bones['body'];head=arm.pose.bones['head'];root=arm.pose.bones['root']
  if clip=='idle':body.scale=(1+math.sin(phase)*.012,1,1+math.sin(phase)*.008);head.rotation_euler.z=math.sin(phase)*.04
  elif clip in ['walk','run']:
   # Diagonal trot, four-beat walk; rabbits bound with paired rear legs.
   running=clip=='run'; amplitude=.65 if running else .32
   body.location.y=abs(math.sin(phase))*(.065 if running else .018)
   body.rotation_euler.z=math.sin(phase)*(.025 if running else .012)
   for j,name in enumerate(legs):
    side=j//(4 if arthropod else 2);pair=j%(4 if arthropod else 2)
    shift=(pair%2+side)%2*math.pi
    if not running:shift=(pair*.5+side)*math.pi
    if kind=='rabbit':shift=pair*math.pi*.7
    s=math.sin(phase+shift);p=arm.pose.bones[name]
    p.rotation_euler.x=s*(.30 if arthropod else amplitude)
    if arthropod:p.rotation_euler.z=s*.18
    arm.pose.bones[name+'_lower'].rotation_euler.x=max(0,-s)*(.85 if running else .4)
   head.rotation_euler.x=math.sin(phase)*.045
   if kind=='rabbit' and running:
    body.location.y=max(0,math.sin(phase))*.14;body.rotation_euler.x=math.sin(phase)*.13
  elif clip=='windup':
   ease=t*t*(3-2*t);head.rotation_euler.x=ease*.25
   body.rotation_euler.x=-ease*.08;body.location.y=-ease*.055
   for name in legs:arm.pose.bones[name+'_lower'].rotation_euler.x=ease*.15
   if kind=='scorpion':arm.pose.bones['tail'].rotation_euler.x=-ease*.65
  elif clip in ['attack','cast']:
   pulse=math.sin(t*math.pi)**2
   head.rotation_euler.x=-pulse*(.55 if kind=='wolf' else .3)
   body.rotation_euler.x=pulse*.16;body.location.z=-pulse*.18
   # Both front legs plant for a bite/tusk thrust; rear legs push the weight forward.
   for j,name in enumerate(legs):
    front=(j%(4 if arthropod else 2))==0
    arm.pose.bones[name].rotation_euler.x=-pulse*(.32 if front else -.16)
   if kind=='scorpion':arm.pose.bones['tail'].rotation_euler.x=pulse*1.0
  elif clip=='hit':
   pulse=math.sin(t*math.pi);head.rotation_euler.z=pulse*.15;body.rotation_euler.x=-pulse*.09
  else:
   fall=min(1,t*1.5);fall=fall*fall*(3-2*fall)
   # Root local Y points upward: rotating it only spins the animal in place.
   # Roll around local Z, keeping the flank above the ground.
   angle=fall*math.pi/2;root.rotation_euler.z=angle
   root.location.y=math.sin(angle)*W*.5
   for name in legs:arm.pose.bones[name+'_lower'].rotation_euler.x=fall*.45
  if 'tail'in arm.pose.bones:arm.pose.bones['tail'].rotation_euler.z=math.sin(phase)*.2
  for p in arm.pose.bones:
   p.keyframe_insert('rotation_euler',frame=f);p.keyframe_insert('location',frame=f);p.keyframe_insert('scale',frame=f)
 track=arm.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,0,action)
 arm.animation_data.action=None
# Export all named NLA tracks; disable animation evaluation for the rest mesh.
for track in arm.animation_data.nla_tracks:track.mute=True
for p in arm.pose.bones:p.matrix_basis.identity()
bpy.context.scene.render.fps=24
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True)
print('RIGGED CREATURE',kind,out)
