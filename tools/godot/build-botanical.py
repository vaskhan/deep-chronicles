"""Оригинальные разветвлённые деревья; Blender --background --python tools/godot/build-botanical.py.
Лист: assets/terrain/pbr/elm-leaf.png (imagegen); кора — существующая текстура проекта.
"""
import bpy, math, random
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'godot/assets/props'
TEX=ROOT/'godot/assets/terrain/pbr'
random.seed(761)
LEAF_COUNT=38
LEAF_GRID=2

class Builder:
 def __init__(self): self.v=[];self.f=[];self.uv=[]
 def face(self,points,uv):
  n=len(self.v);self.v.extend(points);self.f.append(tuple(range(n,n+len(points))));self.uv.extend(uv)
 def object(self,name,mat):
  m=bpy.data.meshes.new(name);m.from_pydata(self.v,[],self.f);m.update()
  layer=m.uv_layers.new(name='UVMap')
  for poly in m.polygons:
   poly.use_smooth=True
   for li in poly.loop_indices: layer.data[li].uv=self.uv[m.loops[li].vertex_index]
  o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.data.materials.append(mat);return o

def material(name,color,texture=None,leaf=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes.clear()
 p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.83
 out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
 if texture:
  im=m.node_tree.nodes.new('ShaderNodeTexImage');im.image=bpy.data.images.load(str(texture),check_existing=True)
  m.node_tree.links.new(im.outputs['Color'],p.inputs['Base Color'])
  if leaf:
   m.node_tree.links.new(im.outputs['Alpha'],p.inputs['Alpha']);m.surface_render_method='DITHERED';m.use_backface_culling=False
 return m

def tube(builder,points,radii,sides=9):
 rings=[]
 for j,p in enumerate(points):
  d=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
  side=d.cross(Vector((0,1,0)))
  if side.length<.01:side=d.cross(Vector((1,0,0)))
  side.normalize();other=d.cross(side).normalized()
  rings.append([p+(side*math.cos(a*math.tau/sides)+other*math.sin(a*math.tau/sides))*radii[j]*(1+.06*math.sin(a*3.7+j)) for a in range(sides)])
 for j in range(len(rings)-1):
  for i in range(sides):
   k=(i+1)%sides
   builder.face([rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]],[(i/sides,j*.6),((i+1)/sides,j*.6),((i+1)/sides,(j+1)*.6),(i/sides,(j+1)*.6)])
 builder.face(list(reversed(rings[0])),[(0,0)]*sides);builder.face(rings[-1],[(0,0)]*sides)

def leaf(builder,center,size,angle,tilt):
 q=Vector((math.cos(angle)*math.cos(tilt),math.sin(angle)*math.cos(tilt),math.sin(tilt))).to_track_quat('Y','Z')
 for y in range(LEAF_GRID):
  for x in range(LEAF_GRID):
   points=[];uv=[]
   for u,v in [(x/LEAF_GRID,y/LEAF_GRID),((x+1)/LEAF_GRID,y/LEAF_GRID),((x+1)/LEAF_GRID,(y+1)/LEAF_GRID),(x/LEAF_GRID,(y+1)/LEAF_GRID)]:
    points.append(center+q@Vector(((u-.5)*size*.65,v*size,size*.10*math.sin(v*math.pi)+abs(u-.5)*size*.07)))
    uv.append((u,v))
   builder.face(points,uv)

def branch(wood,leaves,start,direction,length,radius,depth):
 direction.normalize();pts=[]
 for i in range(6):
  t=i/5;pts.append(start+direction*length*t+Vector((math.sin(t*math.pi)*length*.08,0,length*.12*t*t)))
 tube(wood,pts,[radius*(1-i/6)*.9+.007 for i in range(6)],8 if depth else 6)
 if depth:
  for i in range(3):
   t=.45+i*.23;origin=pts[min(5,round(t*5))]
   yaw=random.random()*math.tau
   d=(direction*.5+Vector((math.cos(yaw)*.85,math.sin(yaw)*.85,random.uniform(.15,.6)))).normalized()
   branch(wood,leaves,origin,d,length*random.uniform(.43,.64),radius*.43,depth-1)
 else:
  for i in range(LEAF_COUNT):
   t=random.uniform(.25,1.12);center=start+direction*length*t+Vector((random.uniform(-.42,.42),random.uniform(-.42,.42),random.uniform(-.2,.4)))
   leaf(leaves,center,random.uniform(.62,.95),random.random()*math.tau,random.uniform(-.45,.8))

def broadleaf(name,height,seed,slim=False):
 random.seed(seed);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bark=material('Weathered bark',(.28,.21,.13),ROOT/'godot/generated/tex/bark.png')
 lm=material('Elm foliage alpha cutout',(.3,.48,.1),TEX/'elm-leaf.png',True)
 wood=Builder();leaves=Builder();r=.32 if slim else .53
 trunk=[Vector((math.sin(i*.6)*.14,math.sin(i*.37)*.15,i*height/12)) for i in range(13)]
 tube(wood,trunk,[r*(1-i/14)**1.2+.035 for i in range(13)],14)
 for i in range(7):
  a=i*math.tau/7;d=Vector((math.cos(a),math.sin(a),0));tube(wood,[d*1.2+Vector((0,0,.01)),d*.45+Vector((0,0,.2)),Vector((0,0,.75))],[.04,.14,r*.65],8)
 for i in range(17):
  a=i*2.399;z=height*(.29+i*.035)
  d=Vector((math.cos(a),math.sin(a),random.uniform(.25,.9)))
  length=(height*.37 if not slim else height*.27)*(1-.45*(i/17))
  branch(wood,leaves,Vector((0,0,z)),d,length,r*.42,2)
 wood.object('Branching trunk and exposed roots',bark);leaves.object('Curved individual leaves',lm)
 export(name)

def pine(name):
 random.seed(372);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 wood=Builder();needles=Builder();bark=material('Pine bark',(.25,.19,.13),ROOT/'godot/generated/tex/bark.png');green=material('Pine foliage alpha cutout',(.055,.17,.065),TEX/'spruce-spray.png',True)
 tube(wood,[Vector((.06*math.sin(i),0,i)) for i in range(14)],[.30*(1-i/14)+.025 for i in range(14)],12)
 for level in range(10):
  z=3+level*.94;reach=3.8*(1-level/12)
  for b in range(6):
   a=b*math.tau/6+level*1.19;d=Vector((math.cos(a),math.sin(a),0));side=Vector((-d.y,d.x,0));start=Vector((0,0,z))
   points=[start+d*reach*t+Vector((0,0,-.38*math.sin(t*math.pi)+t*.3)) for t in [0,.25,.5,.75,1]]
   tube(wood,points,[.10,.075,.05,.026,.009],7)
   for j in range(14):
    t=.16+j*.058;pos=start+d*reach*t+Vector((0,0,-.38*math.sin(t*math.pi)+t*.3))
    for sign in [-1,1]:
     end=pos+side*sign*(1-t)*.9+d*.25+Vector((0,0,.12))
     tube(wood,[pos,end],[.012,.004],5)
     for n in range(3):
      c=pos.lerp(end,(n+.3)/3)
      length=random.uniform(.42,.7)*(1-level*.035)
      for plane in range(2):
       up=Vector((0,0,1));axis=(end-pos).normalized()
       cross=axis.cross(up).normalized() if plane==0 else up
       center=c-axis*length*.2
       needles.face([center-cross*length*.32,center+cross*length*.32,center+axis*length+cross*length*.32,center+axis*length-cross*length*.32],[(0,0),(1,0),(1,1),(0,1)])
 wood.object('Natural pine trunk and tiered branches',bark);needles.object('Individual needle sprays',green);export(name)

def export(name):
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,export_animations=False)
 tris=0
 for o in bpy.context.scene.objects:
  if o.type=='MESH':o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
 print('BOTANICAL',name,tris)

def shrub(name,seed,dry=False):
 global LEAF_COUNT, LEAF_GRID
 LEAF_COUNT=10; LEAF_GRID=1
 random.seed(seed);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 wood=Builder();leaves=Builder()
 bark=material('Shrub bark',(.19,.11,.045))
 green=material('Elm foliage shrub',(.24,.42,.11),TEX/'elm-leaf.png',True)
 for i in range(6):
  angle=i*2.399;branch(wood,leaves,Vector((0,0,0)),Vector((math.cos(angle)*.5,math.sin(angle)*.5,1)),random.uniform(.7,1.2),.025,1)
 wood.object('Shrub branches',bark)
 if not dry: leaves.object('Dense broad leaves',green)
 export(name)
 LEAF_COUNT=38; LEAF_GRID=2

import sys
if '--shrubs-only' not in sys.argv:
 broadleaf('elm_field',10.5,134)
 broadleaf('elm_slender',12.0,871,True)
 broadleaf('alder_round',8.5,913)
shrub('shrub_hazel',711)
shrub('shrub_wild',941)
shrub('shrub_dry',292,True)
if '--shrubs-only' not in sys.argv: pine('pine_natural')
