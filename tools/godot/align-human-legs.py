"""Align generated warrior lower-leg geometry to its canonical bind skeleton.
Usage: python3 tools/godot/align-human-legs.py source.glb output.glb
Run once on the original rigged asset (before this correction). UVs, joints,
weights, topology, textures and animation data are preserved byte-for-byte.
Only POSITION/NORMAL buffers and position bounds change. No mesh remeshing.
"""
import json, math, statistics, struct, sys
from pathlib import Path

def align(source, output):
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
            axis=.089; heights=[.1,.25,.45,.65,.82,.94]
            profiles={}
            for side in [-1,1]:
                deltas=[]
                for h in heights[:-1]:
                    xs=[side*p[0] for p,w in zip(positions,influence) if side*p[0]>0 and abs(p[1]-h)<.035 and w>.7]
                    # Fade the correction into the pelvis; preserve its width.
                    target=axis if h<=.65 else .105
                    deltas.append(max(0,statistics.median(xs)-target) if xs else 0)
                deltas.append(0)
                profiles[side]=deltas
                print(Path(source).name,'side',side,'lower-leg offsets', [round(d,4) for d in deltas])
            changed=[]
            for i,(p,w) in enumerate(zip(positions,influence)):
                x,y,z=p;side=1 if x>=0 else -1;deltas=profiles[side];offset=slope=0
                if y<=heights[0]:offset=deltas[0]
                elif y<heights[-1]:
                    for k in range(len(heights)-1):
                        lo,hi=heights[k:k+2]
                        if lo<=y<hi:
                            t=(y-lo)/(hi-lo);smooth=t*t*(3-2*t)
                            offset=deltas[k]+(deltas[k+1]-deltas[k])*smooth
                            slope=(deltas[k+1]-deltas[k])*6*t*(1-t)/(hi-lo)
                            break
                shift=side*offset*w
                q=(x-shift,y,z);changed.append(q);struct.pack_into(pfmt,blob,poff[i],*q)
                # Inverse-transpose of the lateral warp preserves source normals.
                nx,ny,nz=struct.unpack_from(nfmt,blob,noff[i]);ny+=side*slope*w*nx
                norm=math.sqrt(nx*nx+ny*ny+nz*nz) or 1
                struct.pack_into(nfmt,blob,noff[i],nx/norm,ny/norm,nz/norm)
            a['min']=[min(p[k] for p in changed) for k in range(3)]
            a['max']=[max(p[k] for p in changed) for k in range(3)]
    text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
    result=struct.pack('<III',0x46546c67,2,12+8+len(text)+8+len(blob))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(blob),0x004e4942)+blob
    Path(output).write_bytes(result)
if __name__=='__main__':align(*sys.argv[1:])
