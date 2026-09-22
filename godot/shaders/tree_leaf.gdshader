shader_type spatial;
render_mode cull_disabled;
uniform sampler2D leaf_texture : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform float fade_end = 0.0;
varying float variation;
void vertex() {
 vec3 p=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 if (fade_end > 0.0) { VERTEX *= 1.0 - smoothstep(fade_end - 25.0, fade_end, distance(CAMERA_POSITION_WORLD, MODEL_MATRIX[3].xyz)); }
 variation=.86+.14*sin(p.x*.53+p.z*.72);
 VERTEX.x += sin(TIME*1.3+p.x*.6+p.z*.7)*.045*UV.y;
 VERTEX.z += sin(TIME*.9+p.z*.5)*.025*UV.y;
}
void fragment() {
 vec4 leaf=texture(leaf_texture,UV);
 ALBEDO=leaf.rgb*variation;
 ALPHA=leaf.a;
 ALPHA_SCISSOR_THRESHOLD=.42;
 ROUGHNESS=.82;
 BACKLIGHT=leaf.rgb*.18;
}
