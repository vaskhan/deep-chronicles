// Replace presentation meshes only. Server colliders, height field and spawn
// coordinates remain the original deterministic world-core.js output.
import { heightAt } from "../../src/world-core.js";
// Exact triangular surface rendered by Godot (4 m grid, same diagonal).
export function presentationHeightAt(x, z) {
  if (x > 2100) return 0;
  const x0 = Math.floor(x / 4) * 4, z0 = Math.floor(z / 4) * 4, u = (x-x0)/4, v = (z-z0)/4;
  const a = heightAt(x0,z0), b = heightAt(x0+4,z0), c = heightAt(x0,z0+4), d = heightAt(x0+4,z0+4);
  return u+v <= 1 ? a*(1-u-v)+b*u+c*v : b*(1-v)+c*(1-u)+d*(u+v-1);
}
export function groundPlacement(row) {
  const [id, x, , z, , w, h, d] = row;
  const radius = id.startsWith('rock') ? 0.35 : id === 'bush' ? 0.2 : 0;
  const levels = [presentationHeightAt(x,z)];
  for (let i=0; radius && i<8; i++) levels.push(presentationHeightAt(x+Math.cos(i*Math.PI/4)*w*radius,z+Math.sin(i*Math.PI/4)*d*radius));
  row[2] = Math.min(...levels) - (id.startsWith('rock') ? Math.min(h*0.15,0.6) : ['oak','pine','bush'].includes(id) ? 0.12 : 0.02);
  return row;
}
export function artPlacements(shapes, towns, crypt) {
  const models = [], omitted = new Set();
  const add = (id, r, y, w, h, d = w) => models.push([id, r[2], y, r[4], r[5], w, h, d]);
  for (let i = 0; i < shapes.length; i++) {
    if (omitted.has(i)) continue;
    const r = shapes[i], next = shapes[i+1], kind = r[9];
    const town=towns.find(t=>Math.hypot(r[2]-t.x,r[4]-t.z)<t.r+20), scale=town?.scale || 1;
    if (kind === 'house') {
      // Жилые дома строятся собственным модульным набором в town_architecture.gd.
      omitted.add(i); omitted.add(i+1);
    } else if (kind === 'bark' && next?.[9] === 'leaves') {
      const pine = next[0] === 'cone';
      add(pine ? 'pine' : 'oak', r, r[3]-r[7]/2, next[6]*(pine?1:2), pine?r[7]/2+next[7]:r[7]+next[7]*1.5, next[8]*(pine?1:2));
      omitted.add(i); omitted.add(i+1);
    } else if (kind === 'brick' && r[0] === 'cyl' && next?.[0] === 'cone') {
      add('tower', r, r[3]-r[7]/2, 6.5*scale, 16.5, 6.5*scale); omitted.add(i); omitted.add(i+1);
    } else if (kind === 'brick' && r[0] === 'box' && Math.abs(r[6]-16*scale)<1e-6 && r[7] === 14) {
      add('temple', r, r[3]-7, 18*scale, 32, 15*scale); omitted.add(i); omitted.add(i+1);
    } else if (kind === 'brick' && r[2] === crypt.x && r[4] === crypt.z && r[7] === 10) {
      add('crypt', r, r[3]-5, 14, 18, 14); omitted.add(i); omitted.add(i+1); omitted.add(i+2);
    } else if (kind === 'stone' && r[0] === 'cyl' && Math.abs(r[6]-8*scale)<1e-6) {
      add('fountain', r, r[3]-1, 8*scale, 5, 8*scale); omitted.add(i); omitted.add(i+1); omitted.add(i+2);
    } else if (kind === 'stone' && Math.abs(r[6]-6*scale)<1e-6 && r[7] === 0.6) {
      add('portal', r, r[3]-.3, 6*scale, 1.5, 6*scale); omitted.add(i);
    } else if (kind === 'sandstone' && r[0] === 'ico') {
      add('rock_b', r, r[3]-r[7]*.6, r[6]*2, r[7]*2, r[8]*2); omitted.add(i);
    } else if (kind === 'granite' && r[0] === 'ico') {
      // Громовое ущелье: валуны у подошвы стен и в русле — серый мшистый камень (песчаник rock_b тут чужой).
      add('rock_a', r, r[3]-r[7]*.6, r[6]*2, r[7]*2, r[8]*2); omitted.add(i);
    }
  }
  // Low planting beds around the square stay clear of all four radial roads.
  for (const town of towns) for (let i=0;i<20;i++) {
    const a = Math.PI*2*(i+.5)/20;
    if (Math.abs(Math.sin(a*2))<.4) continue;
    models.push(['bush',town.x+Math.cos(a)*28*town.scale,heightAt(town.x,town.z),town.z+Math.sin(a)*28*town.scale,a,2.4,1.35,2.4]);
  }
  return { shapes: shapes.filter((_, i) => !omitted.has(i)), modelPlacements: models.map(groundPlacement) };
}
