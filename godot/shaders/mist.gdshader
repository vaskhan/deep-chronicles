shader_type spatial;
// Мягкий клуб тумана и брызг: круглый размытый спрайт для частиц у подножия водопада.
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, blend_mix;
uniform vec4 tint : source_color = vec4(0.9, 0.95, 0.97, 0.35);
void vertex() {
 // частица всегда лицом к камере
 MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
 MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0, 0, 0), vec4(0, length(MODEL_MATRIX[1].xyz), 0, 0), vec4(0, 0, length(MODEL_MATRIX[2].xyz), 0), vec4(0, 0, 0, 1));
}
void fragment() {
 float d = length(UV - 0.5) * 2.0;
 float puff = (1.0 - smoothstep(0.2, 1.0, d));
 ALBEDO = tint.rgb * COLOR.rgb;
 ALPHA = puff * tint.a * COLOR.a;
}
