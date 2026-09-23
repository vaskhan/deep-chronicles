"""Locally authored CC0 palettes, cloth/leather textures and tribal accessories."""
import bpy, bmesh, math, random
from mathutils import Vector

def surface(name, rgb, kind='hide'):
 m=bpy.data.materials.get(name)
 if m:return m
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Roughness'].default_value=.66 if kind=='iron' else .88
 p.inputs['Metallic'].default_value=.75 if kind=='iron' else 0
 im=bpy.data.images.new(name,width=256,height=256);rng=random.Random(713);pixels=[]
 for y in range(256):
  for x in range(256):
   grain=(rng.random()-.5)*.025
   if kind=='fur':grain+=.055*math.sin(x*.72+math.sin(y*.11))
   elif kind=='skin':grain+=.006*math.sin(x*.28)*math.cos(y*.31)
   elif kind=='iron':grain+=.025*math.sin(y*.41+x*.018)
   else:grain+=.02*math.sin(x*.45)*math.sin(y*.49)
   pixels.extend([max(0,min(1,c+grain))for c in rgb]+[1])
 im.pixels[:]=pixels;im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
 m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color']);return m

def groups(mesh):
 adj=[set()for v in mesh.vertices]
 for e in mesh.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 left=set(range(len(adj)))
 while left:
  stack=[left.pop()];group=set(stack)
  while stack:
   for i in adj[stack.pop()]:
    if i in left:left.remove(i);group.add(i);stack.append(i)
  yield group

def fang(o,shaman):
 mesh=o.data
 if not mesh.materials:return
 image=next(n.image for n in mesh.materials[0].node_tree.nodes if n.type=='TEX_IMAGE');pix=list(image.pixels[:]);w,h=image.size
 def sample(p):
  uv=mesh.uv_layers.active.data[p.loop_start].uv;x=int(uv.x*w)%w;y=int(uv.y*h)%h
  return pix[(y*w+x)*4:(y*w+x)*4+3]
 samples={p.index:sample(p)for p in mesh.polygons};remove=set()
 # Remove disconnected crest/feathers; preserve the head shell and original weights.
 for g in groups(mesh):
  vs=[o.matrix_world@mesh.vertices[i].co for i in g];lo=min(v.z for v in vs);hi=max(v.z for v in vs)
  p=next(p for p in mesh.polygons if p.vertices[0] in g);r,bg,b=samples[p.index]
  if (not shaman and lo>2.45 and b>r*1.6) or (shaman and lo>2.84):remove.update(g);continue
  # Eyes and pupils share one pivot so they stay aligned; reduce the protrusion.
  if lo>2.12 and hi<2.50 and max(abs(v.x) for v in vs)<.52:
   sign=1 if sum(v.x for v in vs)>0 else -1
   pivot=Vector((sign*(.339 if shaman else .265),-.38 if shaman else -.46,2.29 if shaman else 2.35))
   for i in g:
    pos=o.matrix_world@mesh.vertices[i].co;mesh.vertices[i].co=o.matrix_world.inverted()@(pivot+(pos-pivot)*.78)
 skin=surface('Fang olive skin',(.23,.25,.18),'skin')
 leather=surface('Fang leather',(.27,.21,.16))
 accent=surface('Fang petrol' if shaman else 'Fang oxide',(.13,.19,.17)if shaman else(.22,.115,.08))
 bone=surface('Fang old bone',(.43,.40,.29))
 dark=surface('Fang charcoal',(.10,.11,.095))
 metal=surface('Fang dark iron',(.25,.27,.26),'iron')
 mats=[skin,leather,accent,bone,dark,metal];mesh.materials.clear()
 for m in mats:mesh.materials.append(m)
 for p in mesh.polygons:
  r,g,b=samples[p.index];pos=o.matrix_world@p.center
  if max(r,g,b)<.2:idx=4
  elif abs(r-g)<.08 and b>r*.85:idx=3
  elif (not shaman and g>r and g>b*1.15) or (shaman and r>g*1.6 and g>b*1.1):idx=0
  elif r>.7 and g>.4:idx=5
  elif b>g*1.05:idx=4
  else:idx=2 if shaman or (r<.5 and g>.30 and b<.30) else 1
  p.material_index=idx
 bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i]for i in remove],context='VERTS');bm.to_mesh(mesh);bm.free()
 # Palette UVs are tiny islands: replace them with metre-scale planar coordinates
 # to make the new skin pores, weave and leather grain visible rather than a flat tint.
 uv=mesh.uv_layers.active
 for p in mesh.polygons:
  axis=max(range(3),key=lambda k:abs(p.normal[k]));axes=[k for k in range(3)if k!=axis]
  for li in p.loop_indices:
   v=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(v[axes[0]]*.85,v[axes[1]]*.85)
 mesh.update()

def tube(name,points,radii,mat):
 verts=[];faces=[];n=8
 for j,p in enumerate(points):
  tangent=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(j-1,0)])
  tangent.normalize();u=tangent.cross(Vector((0,1,0))).normalized();v=tangent.cross(u).normalized()
  for i in range(n):verts.append(Vector(p)+(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))*radii[j])
 for j in range(len(points)-1):
  for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
 faces.extend([tuple(reversed(range(n))),tuple(range((len(points)-1)*n,len(points)*n))])
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();uv=me.uv_layers.new()
 for p in me.polygons:
  for li in p.loop_indices:
   vi=me.loops[li].vertex_index;uv.data[li].uv=(vi%n/n,vi//n/max(1,len(points)-1))
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(mat);return o

def braids(arm,bind,shaman):
 hair=surface('Fang braids',(.13,.12,.10),'fur');bone=surface('Fang braid bone',(.59,.56,.45))
 for s in [-1,1]:
  points=[(s*(.28+.013*math.sin(i*2)),.06,1.88-i*.055)for i in range(8)]
  o=tube('TempleBraid',points,[.045-i*.0025 for i in range(8)],hair);bind(o,arm,bone='DEF-head')
  o=tube('BraidClasp',[points[5],points[6]],[.041,.038],bone);bind(o,arm,bone='DEF-head')
 if shaman:
  for s in [-1,1]:
   o=tube('BoneCrown',[(s*.20,0,2.00),(s*.32,.015,2.16),(s*.37,.06,2.29)],[.055,.035,.004],bone);bind(o,arm,bone='DEF-head')
