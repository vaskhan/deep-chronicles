shader_type spatial;
render_mode cull_back;
uniform sampler2D grass : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D forest : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D sand : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D dirt : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D snow : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D forest_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D forest_roughness : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D forest_height : filter_linear_mipmap_anisotropic, repeat_enable;
varying vec3 world_pos;
varying vec3 world_normal;
void vertex() {
 world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
 world_normal = MODEL_NORMAL_MATRIX * NORMAL;
 TANGENT = normalize(vec3(1.0,0.0,0.0) - NORMAL * NORMAL.x);
 BINORMAL = normalize(cross(NORMAL,TANGENT));
}
float noise2(vec2 p) { return sin(p.x*.037+sin(p.y*.029))*sin(p.y*.041+sin(p.x*.025)); }
float town_roads(vec2 p, vec2 center) {
 vec2 d = p-center;
 float a=.0872665;
 d=mat2(vec2(cos(a),sin(a)),vec2(-sin(a),cos(a)))*d;
 float lanes=min(abs(d.x),abs(d.y));
 float ring=abs(length(d)-52.0);
 return (1.0-smoothstep(2.8,5.0,min(lanes,ring)))*(1.0-smoothstep(112.0,130.0,length(d)));
}
void fragment() {
 vec2 p=world_pos.xz;
 vec2 uv=p/3.5;
 float meadow_d=distance(p,vec2(-300.0,250.0))/320.0;
 float forest_d=distance(p,vec2(20.0,10.0))/300.0;
 float sand_d=distance(p,vec2(360.0,-120.0))/330.0;
 vec3 weights=exp(-12.0*vec3(meadow_d,forest_d,sand_d));
 weights/=max(dot(weights,vec3(1.0)),.00001);
 float town=1.0-smoothstep(95.0,118.0,min(distance(p,vec2(-430.0,400.0)),distance(p,vec2(430.0,-400.0))));
 weights=mix(weights,vec3(1.0,0.0,0.0),town*.9);
 vec3 grass_col=texture(grass,uv).rgb;
 vec3 forest_col=texture(forest,uv).rgb;
 vec3 sand_col=texture(sand,uv).rgb;
 // Микродеталь материала и крупные цветовые пятна имеют разные масштабы.
 float macro=noise2(p)*.5+.5;
 vec3 col=grass_col*weights.x+forest_col*weights.y+sand_col*weights.z;
 col*=mix(vec3(.84,.91,.80),vec3(1.09,1.05,.93),macro);
 float roads=town_roads(p,vec2(430.0,-400.0));
 col=mix(col,texture(dirt,p/4.0).rgb,roads);
 float rocky=max(smoothstep(.35,.6,1.0-world_normal.y),smoothstep(38.0,55.0,world_pos.y));
 col=mix(col,texture(rock,p/4.0).rgb,rocky);
 float snowy=smoothstep(72.0,86.0,world_pos.y);
 col=mix(col,texture(snow,p/4.0).rgb,snowy);
 // У сканированной лесной почвы согласованные normal/roughness/height.
 vec3 forest_n=texture(forest_normal,uv).rgb*2.0-1.0;
 // Для нарисованного albedo — только слабый приближённый микрорельеф.
 vec2 delta=vec2(.002,0.0);
 float h=dot(grass_col,vec3(.2126,.7152,.0722));
 float hx=dot(texture(grass,uv+delta).rgb,vec3(.2126,.7152,.0722));
 float hy=dot(texture(grass,uv+delta.yx).rgb,vec3(.2126,.7152,.0722));
 vec3 grass_n=normalize(vec3((h-hx)*2.5,(h-hy)*2.5,1.0));
 vec3 normal=normalize(grass_n*weights.x+forest_n*weights.y+vec3(0.0,0.0,1.0)*weights.z);
 normal=normalize(mix(normal,vec3(0.0,0.0,1.0),max(roads,max(rocky,snowy))));
 NORMAL_MAP=normal*.5+.5;
 ROUGHNESS=mix(.88,texture(forest_roughness,uv).r,weights.y);
 AO=mix(1.0,mix(.88,1.0,texture(forest_height,uv).r),weights.y);
 ALBEDO=col;
 SPECULAR=.25;
}
