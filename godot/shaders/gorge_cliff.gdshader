shader_type spatial;
uniform sampler2D stone : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D stone_normal : hint_normal, filter_linear_mipmap_anisotropic;
uniform sampler2D stone_arm : filter_linear_mipmap_anisotropic;
uniform sampler2D moss : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec3 falls_position;
varying vec3 wp;
varying vec3 wn;
void vertex(){ wp=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz; wn=normalize(MODEL_NORMAL_MATRIX*NORMAL); }
void fragment(){
 vec3 base=texture(stone,UV).rgb;
 float damp=(1.0-smoothstep(12.0,48.0,distance(wp.xz,falls_position.xz)))*(1.0-smoothstep(falls_position.y+8.0,falls_position.y+28.0,wp.y));
 float growth=smoothstep(.25,.85,wn.y)*(0.35+0.65*damp);
 vec3 green=texture(moss,wp.xz*.24).rgb;
 ALBEDO=mix(base*mix(vec3(.8,.83,.8),vec3(.37,.45,.43),damp),green*.7,growth*.7);
 NORMAL_MAP=texture(stone_normal,UV).rgb;
 NORMAL_MAP_DEPTH=.8;
 vec3 arm=texture(stone_arm,UV).rgb;
 AO=arm.r; ROUGHNESS=mix(arm.g,.26,damp*.75); SPECULAR=.28;
}
