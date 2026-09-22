shader_type spatial;
render_mode cull_disabled;
uniform sampler2D leaf : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D leaf_normal : hint_normal, filter_linear_mipmap_anisotropic;
uniform float fade_end=95.0;
varying float tint;
void vertex(){
 vec3 p=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 float sway=sin(p.x*.7+p.z*.38+TIME*1.5)+sin(p.z*.9-TIME*2.1)*.3;
 float weight=clamp(VERTEX.y*2.0,0.0,1.0);
 VERTEX.x+=sway*weight*weight*.07;
 VERTEX.z+=sway*weight*.04;
 float fade=1.0-smoothstep(fade_end-20.0,fade_end,distance(CAMERA_POSITION_WORLD,MODEL_MATRIX[3].xyz));
 VERTEX*=fade;
 tint=.82+.18*sin(MODEL_MATRIX[3].x*3.4);
}
void fragment(){
 vec4 color=texture(leaf,UV);
 ALBEDO=color.rgb*vec3(.68,.83,.53)*tint;
 ALPHA=color.a; ALPHA_SCISSOR_THRESHOLD=.45;
 NORMAL_MAP=texture(leaf_normal,UV).rgb;
 ROUGHNESS=.82; BACKLIGHT=ALBEDO*.12;
}
