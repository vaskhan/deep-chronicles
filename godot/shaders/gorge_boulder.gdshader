shader_type spatial;
uniform sampler2D stone : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D stone_normal : hint_normal, filter_linear_mipmap_anisotropic;
uniform sampler2D moss : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
varying vec3 wp;
varying vec3 wn;
void vertex(){wp=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;wn=normalize(MODEL_NORMAL_MATRIX*NORMAL);}
void fragment(){
 vec2 d=wp.xz-vec2(410.0,330.0);
 float u=dot(d,vec2(.6,.8));
 float s=dot(d,vec2(.8,-.6))-24.0*sin(u/440.0*3.14159265*1.6);
 float bank=abs(s-(-20.0+3.0*sin(u*.045)));
 float wet=(1.0-smoothstep(4.0,9.0,bank))*(1.0-smoothstep(195.0,210.0,u));
 vec3 base=texture(stone,UV).rgb;
 base=mix(vec3(dot(base,vec3(.2126,.7152,.0722))),base,.25)*vec3(.53,.62,.59);
 vec3 green=texture(moss,wp.xz*.55).rgb*vec3(.45,.68,.36);
 float growth=smoothstep(.2,.8,wn.y)*(.65+.2*sin(wp.x*2.0+wp.z*1.3));
 ALBEDO=mix(base,green,growth)*mix(1.0,.6,wet);
 NORMAL_MAP=texture(stone_normal,UV).rgb; NORMAL_MAP_DEPTH=.65;
 ROUGHNESS=mix(.87,.38,wet); SPECULAR=.22;
}
