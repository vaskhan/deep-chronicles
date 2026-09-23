"""Align generated warrior lower-leg geometry to its canonical bind skeleton.
Usage: python3 tools/godot/align-human-legs.py source.glb output.glb [appearance.glb]
Appearance keeps the current materials/textures while geometry comes from the original.
Run once on the original rigged asset (before this correction). UVs, joints,
weights, topology, textures and animation data are preserved byte-for-byte.
Only POSITION/NORMAL buffers and position bounds change. No mesh remeshing.
"""
import json, math, statistics, struct, sys
from pathlib import Path

def align(source, output, appearance=None):
    raw=Path(source).read_bytes()
    size=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+size])
    start=20+size
    length,kind=struct.unpack_from('<II',raw,start)
    assert kind==0x004e4942
    blob=bytearray(raw[start+8:start+8+length])
    def accessor(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
        assert not a.get('sparse') and not a.get('normalized')
        fmt={5126:'f',5123:'H',5121:'B'}[a['componentType']]
        count={'VEC3':3,'VEC4':4}[a['type']]
        pack='<'+fmt*count;stride=v.get('byteStride',struct.calcsize(pack))
        offset=v.get('byteOffset',0)+a.get('byteOffset',0)
        return a,pack,[offset+i*stride for i in range(a['count'])]
    processed=set()
    for node in doc['nodes']:
        if 'mesh' not in node or 'skin' not in node:continue
        assert not any(k in node for k in ['matrix','translation','rotation','scale'])
        joints=[doc['nodes'][i]['name'] for i in doc['skins'][node['skin']]['joints']]
        for prim in doc['meshes'][node['mesh']]['primitives']:
            attrs=prim['attributes']
            if attrs['POSITION'] in processed:continue
            processed.add(attrs['POSITION'])
            a,pfmt,poff=accessor(attrs['POSITION']);_,nfmt,noff=accessor(attrs['NORMAL'])
            _,jfmt,joff=accessor(attrs['JOINTS_0']);_,wfmt,woff=accessor(attrs['WEIGHTS_0'])
            positions=[struct.unpack_from(pfmt,blob,o) for o in poff]
            influence=[]
            for jo,wo in zip(joff,woff):
                js=struct.unpack_from(jfmt,blob,jo);ws=struct.unpack_from(wfmt,blob,wo)
                influence.append(sum(w for j,w in zip(js,ws) if joints[j].startswith(('DEF-thigh.','DEF-shin.','DEF-foot.','DEF-toe.'))))
            # Fit the complete thigh-to-ankle centerline to the bind skeleton.
            # The old calf-only warp left the thigh on its original slanted axis;
            # an added knee bulge then created a second bend instead of fixing it.
            axis=.089; profiles={}
            def regression(samples):
                my=statistics.mean(h for h,x in samples)
                mx=statistics.mean(x for h,x in samples)
                slope=sum((h-my)*(x-mx) for h,x in samples)/sum((h-my)**2 for h,x in samples)
                return mx-slope*my,slope
            for side in [-1,1]:
                samples=[]
                for h in [.18,.24,.30,.36,.42,.48,.54,.60,.66,.72,.78,.82]:
                    xs=sorted(side*p[0] for p,w in zip(positions,influence)
                              if side*p[0]>0 and abs(p[1]-h)<.02 and w>.9)
                    if xs:
                        samples.append((h,(xs[int(len(xs)*.1)]+xs[int(len(xs)*.9)])*.5-axis))
                leg=regression(samples)
                # Original boots also point sideways. Fit their longitudinal
                # axis separately, retaining the sole height and toe length.
                samples=[]
                for z in [-.08,-.04,0,.04,.08,.12,.16]:
                    xs=sorted(side*p[0] for p,w in zip(positions,influence)
                              if side*p[0]>0 and p[1]<.12 and abs(p[2]-z)<.015 and w>.9)
                    if xs:
                        samples.append((z,(xs[int(len(xs)*.1)]+xs[int(len(xs)*.9)])*.5-axis))
                foot=regression(samples)
                profiles[side]=(leg,foot)
                print(Path(source).name,'side',side,'leg/foot correction',profiles[side])
            def offset_at(y,z,profile):
                (intercept,gradient),(foot_intercept,foot_gradient)=profile
                hip=.82; pelvis=1.00
                if y<=hip: offset=intercept+gradient*max(.14,y)
                elif y<pelvis:
                    t=(y-hip)/(pelvis-hip);v=intercept+gradient*hip
                    offset=(2*t**3-3*t*t+1)*v+(t**3-2*t*t+t)*(pelvis-hip)*gradient
                else: offset=0
                t=max(0,min(1,(y-.10)/.12));blend=1-t*t*(3-2*t)
                return offset*(1-blend)+(foot_intercept+foot_gradient*z)*blend
            changed=[]
            for i,(p,w) in enumerate(zip(positions,influence)):
                x,y,z=p;side=1 if x>=0 else -1;profile=profiles[side]
                offset=offset_at(y,z,profile)
                q=(x-side*offset*w,y,z);changed.append(q);struct.pack_into(pfmt,blob,poff[i],*q)
                # Inverse-transpose includes both shin alignment and toe yaw.
                epsilon=.0001
                dy=(offset_at(y+epsilon,z,profile)-offset_at(y-epsilon,z,profile))/(2*epsilon)
                dz=(offset_at(y,z+epsilon,profile)-offset_at(y,z-epsilon,profile))/(2*epsilon)
                nx,ny,nz=struct.unpack_from(nfmt,blob,noff[i]);ny+=side*dy*w*nx;nz+=side*dz*w*nx
                norm=math.sqrt(nx*nx+ny*ny+nz*nz) or 1
                struct.pack_into(nfmt,blob,noff[i],nx/norm,ny/norm,nz/norm)
            a['min']=[min(p[k] for p in changed) for k in range(3)]
            a['max']=[max(p[k] for p in changed) for k in range(3)]
    if appearance:
        raw=Path(appearance).read_bytes();size=struct.unpack_from('<I',raw,12)[0]
        current=json.loads(raw[20:20+size]);current_blob=bytearray(raw[28+size:])
        for original_mesh,current_mesh in zip(doc['meshes'],current['meshes']):
            for original_prim,current_prim in zip(original_mesh['primitives'],current_mesh['primitives']):
                for semantic in ['POSITION','NORMAL']:
                    old=doc['accessors'][original_prim['attributes'][semantic]]
                    new=current['accessors'][current_prim['attributes'][semantic]]
                    assert old['count']==new['count'] and old['type']==new['type']=='VEC3'
                    ov=doc['bufferViews'][old['bufferView']];nv=current['bufferViews'][new['bufferView']]
                    for i in range(old['count']):
                        a=ov.get('byteOffset',0)+old.get('byteOffset',0)+i*ov.get('byteStride',12)
                        b=nv.get('byteOffset',0)+new.get('byteOffset',0)+i*nv.get('byteStride',12)
                        current_blob[b:b+12]=blob[a:a+12]
                    if semantic=='POSITION':new['min']=old['min'];new['max']=old['max']
        doc=current;blob=current_blob
    text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
    result=struct.pack('<III',0x46546c67,2,12+8+len(text)+8+len(blob))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(blob),0x004e4942)+blob
    Path(output).write_bytes(result)
if __name__=='__main__':align(*sys.argv[1:])
