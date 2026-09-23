shader_type spatial;
// Полотно водопада: быстрые вертикальные струи, пенные гребни, рваный край и туман внизу.
// UV.x — поперёк полотна (0..1), UV.y — сверху вниз (0 у кромки, 1 у бочага).
render_mode cull_disabled, depth_draw_opaque, shadows_disabled;
uniform float speed = 1.35;
uniform float veil = 0.0; // 0 — плотное полотно, 1 — лёгкая водяная пыль по краям
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) {
 vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void fragment() {
 float t = TIME * speed;
 vec2 p = vec2(UV.x * 14.0, UV.y * 12.0 - t * 3.0);
 float jets = n(p * vec2(1.0, 0.7)) * 0.55 + n(p * vec2(2.6, 1.8) + 7.0) * 0.3 + n(p * vec2(6.0, 2.0) + 3.0) * 0.15;
 float side = min(UV.x, 1.0 - UV.x);
 float edge = smoothstep(0.0, mix(0.12, 0.35, veil), side + (jets - 0.5) * 0.12);
 float foam = smoothstep(0.40, 0.84, jets) + smoothstep(0.72, 1.0, UV.y) * 0.45;
 vec3 water = mix(vec3(0.055, 0.19, 0.18), vec3(0.42, 0.61, 0.58), clamp(foam, 0.0, 1.0));
 ALBEDO = water;
 EMISSION = water * 0.035;
 NORMAL_MAP = normalize(vec3((jets - 0.5) * 1.4, 0.0, 1.0)) * 0.5 + 0.5;
 ROUGHNESS = 0.55;
 SPECULAR = 0.22;
 float channels=mix(.48,1.0,smoothstep(.22,.62,n(vec2(UV.x*24.0,TIME*.14))));
 float body = mix(0.93, 0.25, veil) * edge * mix(0.75, 1.0, jets);
 ALPHA = clamp(channels * body * (1.0 - smoothstep(0.9, 1.0, UV.y) * 0.6), 0.0, 1.0);
}
