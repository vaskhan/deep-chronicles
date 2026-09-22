shader_type spatial;
// Горная река Громового ущелья: течение вдоль UV.y, пена у берегов и на перекатах.
// UV.x — поперёк русла (0..1), UV.y — пройденный путь в метрах / 6; COLOR.r — крутизна участка.
render_mode cull_disabled, depth_draw_opaque;
uniform float flow_speed = 0.55;
uniform bool radial = false; // бочаг: пена по кругу, край круглый
varying vec3 wp;
void vertex(){wp=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
 vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void fragment() {
 float steep = COLOR.r;
 vec2 uv = vec2(UV.x * 3.0, UV.y + TIME * flow_speed * (1.0 + steep * 2.5));
 float streak = n(uv * vec2(4.0, 1.4)) * 0.6 + n(uv * vec2(9.0, 3.0)) * 0.4;
 float edge = 1.0 - smoothstep(0.0, 0.22, min(UV.x, 1.0 - UV.x));
 float ring = length(UV - 0.5) * 2.0;
 if (radial) {
  uv=wp.xz*.5+vec2(TIME*.2,-TIME*.15);
  streak=n(uv)*.6+n(uv*2.5)*.4;
  edge=(1.0-smoothstep(.1,.65,ring))*.8;
 }
 float foam = clamp(smoothstep(0.62, 0.9, streak) * (0.35 + steep) + edge * 0.18, 0.0, 1.0);
 vec3 deep = vec3(0.012, 0.055, 0.052), shallow = vec3(0.04, 0.13, 0.115);
 ALBEDO = mix(mix(deep, shallow, streak * 0.6), vec3(0.48, 0.61, 0.57), foam);
 float wob = n(uv * 6.0) - 0.5;
 NORMAL = normalize((VIEW_MATRIX * vec4(wob*.08,1.0,(streak-.5)*.08,0.0)).xyz);
 ROUGHNESS = mix(0.65, 0.85, foam);
 METALLIC = 0.0;
 SPECULAR = 0.12;
 if (radial && ring > .98) { discard; }
 if (!radial && min(UV.x,1.0-UV.x) < .015 + streak*.025) { discard; }
}
