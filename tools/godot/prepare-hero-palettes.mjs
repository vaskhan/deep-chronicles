// Grade only embedded albedo/roughness. Nodes, skin, weights, geometry and clips stay byte-identical.
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const source = 'art/sources/hero-palettes';
const report = { sourceCommit: '499d3110d79be6389ef5f2bdbbc1ae6000d022b6', license: 'Existing project hero textures; provenance in art/README.md, not third-party CC0 pack assets.', sources: {}, outputs: {} };
for (const id of ['warrior_cloth', 'mage_native']) {
  const file = `godot/assets/characters/${id}.glb`, b = fs.readFileSync(file), length = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20,20+length)), bin = b.subarray(28+length);
  const chunks = j.bufferViews.map(v => Buffer.from(bin.subarray(v.byteOffset || 0,(v.byteOffset || 0)+v.byteLength)));
  const original = chunks.map(sha), replaced = new Set();
  for (const [index,image] of j.images.entries()) {
    const name = `${id}_${image.name}.webp`, input = fs.readFileSync(`${source}/${name}`);report.sources[name] = sha(input);
    let output;
    if (index === 0) output = await sharp(input).modulate({ saturation: id === 'mage_native' ? .52 : .58, brightness: .96 }).webp({lossless:true}).toBuffer();
    else {
      const { data, info } = await sharp(input).raw().toBuffer({resolveWithObject:true});
      for(let i=0;i<data.length;i+=info.channels) data[i+1]=Math.max(data[i+1],data[i+2]>100?155:200);
      output = await sharp(data,{raw:info}).webp({lossless:true}).toBuffer();
    }
    chunks[image.bufferView] = output;replaced.add(image.bufferView);
    fs.writeFileSync(`godot/assets/characters/${name}`,output);report.outputs[name]=sha(output);
  }
  const parts=[];let offset=0;
  for(const [i,chunk]of chunks.entries()){
    if(!replaced.has(i) && sha(chunk)!==original[i]) throw Error(`Geometry changed: ${id}/${i}`);
    j.bufferViews[i].byteOffset=offset;j.bufferViews[i].byteLength=chunk.length;parts.push(chunk);offset+=chunk.length;
    const padding=(4-offset%4)%4;if(padding){parts.push(Buffer.alloc(padding));offset+=padding;}
  }
  const data=Buffer.concat(parts);j.buffers[0].byteLength=data.length;
  const json=Buffer.from(JSON.stringify(j));const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+data.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(data.length,0);bh.writeUInt32LE(0x004e4942,4);
  fs.writeFileSync(file,Buffer.concat([header,padded,bh,data]));report.outputs[`${id}.glb`]=sha(fs.readFileSync(file));
}
fs.writeFileSync(`${source}/manifest.json`,JSON.stringify(report,null,2)+'\n');
