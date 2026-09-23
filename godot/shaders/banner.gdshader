shader_type spatial;
render_mode cull_disabled;
void vertex() {
	VERTEX.z += sin(TIME * 1.6 + VERTEX.y * 1.4 + MODEL_MATRIX[3].x) * 0.12 * UV.y;
}
void fragment() {
	vec2 p = UV - vec2(0.5, 0.38);
	float diamond = abs(p.x) + abs(p.y) * 0.55;
	float crest = 1.0 - smoothstep(0.15, 0.17, diamond);
	float inset = 1.0 - smoothstep(0.095, 0.11, diamond);
	float border = step(UV.x, 0.065) + step(0.935, UV.x) + step(0.94, UV.y);
	float thread = sin(UV.x * 520.0) * sin(UV.y * 900.0) * 0.015;
	ALBEDO = mix(vec3(0.25, 0.045, 0.065), vec3(0.65, 0.45, 0.19), clamp(border + crest - inset, 0.0, 1.0)) + thread;
	ROUGHNESS = 0.95;
}
