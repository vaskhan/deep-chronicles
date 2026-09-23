// The northern approach uses the broad valleys and offset hill shoulders of
// the island reference, adapted to our existing hunting route and town gates.
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function harborLandscapeHeight(x,z,base) {
  const mask=(1-smooth(150,220,Math.abs(x+435)))*(1-smooth(135,200,Math.abs(z-155)))*smooth(156,195,Math.hypot(x+430,z-400));
  if(mask===0)return base;
  const hill=(cx,cz,rx,rz,h)=>h*Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
  const shoulders=hill(-525,190,48,88,18)+hill(-345,115,62,85,24)+hill(-528,35,70,52,13);
  const axis=-435-17*Math.sin((z-80)/85);
  const valley=Math.exp(-(((x-axis)/28)**2));
  // Keep the hunting corridor broad and gently graded rather than a cliff.
  const floor=3.5+1.8*Math.sin(z/95);
  const shaped=(base*.45+shoulders)*(1-valley*.8)+floor*valley*.8;
  return base+(shaped-base)*mask;
}
