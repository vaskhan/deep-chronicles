shader_type sky;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float cloud(vec2 p) { return noise(p)*.55+noise(p*2.03)*.27+noise(p*4.07)*.13+noise(p*8.1)*.05; }
void sky() {
 float up = max(EYEDIR.y,0.0);
 vec3 col = mix(vec3(.35,.62,.87),vec3(.035,.20,.53),pow(up,.55));
 if (EYEDIR.y > .025) {
  vec2 p = EYEDIR.xz / (EYEDIR.y + .22) * 2.8 + vec2(TIME*.003,0.0);
  float n = cloud(p);
  float mask = smoothstep(.51,.70,n) * smoothstep(.025,.16,up);
  col = mix(col, mix(vec3(.62,.73,.80),vec3(1.0,.96,.87),smoothstep(.48,.78,n)),mask*.92);
 }
 if (LIGHT0_ENABLED) {
  float sun = max(dot(EYEDIR,LIGHT0_DIRECTION),0.0);
  col += vec3(1.0,.75,.39)*pow(sun,32.0)*.16;
  col += vec3(1.0,.91,.68)*smoothstep(.9995,.9998,sun)*2.0;
 }
 COLOR = mix(vec3(.24,.29,.24),col,smoothstep(-.12,.015,EYEDIR.y));
}
