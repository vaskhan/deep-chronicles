shader_type spatial;
uniform vec4 base_color : source_color = vec4(0.65,0.60,0.49,1.0);
varying vec3 world_pos;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void vertex(){world_pos=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){float wear=noise(world_pos*1.9)*0.6+noise(world_pos*12.0)*0.4;ALBEDO=base_color.rgb*mix(0.76,1.09,wear);ROUGHNESS=0.97;}
