shader_type spatial;
render_mode cull_disabled, depth_prepass_alpha;
uniform sampler2D ground_texture : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
varying vec3 world_position;
void vertex() { world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz; }
float noise(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void fragment() {
 vec2 p=world_position.xz;
 vec3 soil=texture(ground_texture,p*.32).rgb;
 float grain=noise(floor(p*18.0));
 float edge=min(UV.x,1.0-UV.x);
 float irregular=.035*sin(p.x*2.7+p.y*1.9)+.025*sin(p.y*6.3);
 float grey=dot(soil,vec3(.299,.587,.114));
 ALBEDO=mix(vec3(grey),soil,.38)*vec3(.75,.67,.54)*(0.92+grain*.13);
 ROUGHNESS=.98;
 ALPHA=smoothstep(.015,.16,edge+irregular);

}
