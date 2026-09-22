shader_type spatial;
// Горная река Громового ущелья: течение вдоль UV.y, пена у берегов и на перекатах.
// UV.x — поперёк русла (0..1), UV.y — пройденный путь в метрах / 6; COLOR.r — крутизна участка.
render_mode cull_disabled, depth_draw_opaque;
uniform float flow_speed = 0.55;
uniform bool radial = false; // бочаг: пена по кругу, край круглый
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
 vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void fragment() {
 float steep = COLOR.r;
 vec2 uv = vec2(UV.x * 3.0, UV.y - TIME * flow_speed * (1.0 + steep * 2.5));
 float streak = n(uv * vec2(4.0, 1.4)) * 0.6 + n(uv * vec2(9.0, 3.0)) * 0.4;
 float edge = 1.0 - smoothstep(0.0, 0.22, min(UV.x, 1.0 - UV.x));
 float ring = length(UV - 0.5) * 2.0;
 if (radial) {
  uv = vec2(atan(UV.y - 0.5, UV.x - 0.5) * 2.0, ring * 3.0 - TIME * 0.6);
  streak = n(uv * vec2(4.0, 1.4)) * 0.6 + n(uv * vec2(9.0, 3.0)) * 0.4;
  edge = smoothstep(0.7, 1.0, ring) * 0.8 + (1.0 - smoothstep(0.0, 0.45, ring)) * 0.9;
 }
 float foam = clamp(smoothstep(0.62, 0.9, streak) * (0.35 + steep) + edge * 0.55, 0.0, 1.0);
 vec3 deep = vec3(0.05, 0.19, 0.22), shallow = vec3(0.16, 0.36, 0.38);
 ALBEDO = mix(mix(deep, shallow, streak * 0.6), vec3(0.86, 0.92, 0.93), foam);
 float wob = n(uv * 6.0) - 0.5;
 NORMAL_MAP = normalize(vec3(wob * 0.6, (streak - 0.5) * 0.9, 1.0)) * 0.5 + 0.5;
 ROUGHNESS = mix(0.12, 0.6, foam);
 METALLIC = 0.15;
 SPECULAR = 0.7;
 ALPHA = mix(0.82, 0.97, foam) * (radial ? 1.0 - smoothstep(0.92, 1.0, ring) : 1.0);
}
