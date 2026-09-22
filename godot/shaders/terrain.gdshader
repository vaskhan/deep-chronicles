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
// Громовое ущелье: те же ось и изгиб, что в src/gorge.js (A=(410,330), направление (0.6,0.8)).
// Возвращает (u, s, вес дна ущелья).
// Трипланарная выборка: на отвесах текстура не растягивается в вертикальные полосы.
vec3 triplanar(sampler2D t, vec3 wp, vec3 n, float scale) {
 vec3 b = pow(abs(n), vec3(4.0)); b /= max(b.x + b.y + b.z, .0001);
 return texture(t, wp.zy * scale).rgb * b.x + texture(t, wp.xz * scale).rgb * b.y + texture(t, wp.xy * scale).rgb * b.z;
}
vec3 gorge_frame(vec2 p) {
 vec2 d = p - vec2(410.0, 330.0);
 float u = dot(d, vec2(0.6, 0.8));
 float s = dot(d, vec2(0.8, -0.6)) - 24.0 * sin(u / 440.0 * 3.14159265 * 1.6);
 float w = mix(mix(46.0, 34.0, smoothstep(170.0, 215.0, u)), 60.0, smoothstep(330.0, 372.0, u));
 float inside = (1.0 - smoothstep(w + 6.0, w + 40.0, abs(s))) * smoothstep(-70.0, -20.0, u) * (1.0 - smoothstep(480.0, 510.0, u));
 return vec3(u, s, inside);
}
// Горный массив вокруг ущелья (та же маска, что gorgeMask в src/gorge.js).
float gorge_massif(vec3 gf) {
 return (1.0 - smoothstep(130.0, 190.0, abs(gf.y))) * smoothstep(-120.0, -50.0, gf.x);
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
 vec3 gf=gorge_frame(p);
 float gorge=gf.z;
 float massif=gorge_massif(gf);
 float gw=mix(mix(46.0,34.0,smoothstep(170.0,215.0,gf.x)),60.0,smoothstep(330.0,372.0,gf.x));
 // Дно ущелья: на террасах мох и мокрая тёмная земля, выше — голый камень, на вершине — холодный серый.
 vec3 rock_col=mix(texture(rock,p/4.0).rgb,triplanar(rock,world_pos,world_normal,.18),max(massif,gorge));
 vec3 moss=forest_col*vec3(.78,.95,.74);
 vec3 wet=rock_col*vec3(.52,.58,.6);
 float tier2=smoothstep(185.0,215.0,gf.x), tier3=smoothstep(330.0,360.0,gf.x);
 vec3 gorge_col=mix(mix(moss,wet,smoothstep(.3,.75,macro)*.7),wet*1.1,tier2*.75);
 // вершина: выветренный серо-бурый камень с землёй — белыми остаются только кромки
 vec3 summit_col=mix(rock_col*vec3(.6,.6,.58),texture(dirt,p/4.0).rgb*vec3(.7,.68,.64),.35);
 gorge_col=mix(gorge_col,summit_col,tier3);
 col=mix(col,gorge_col,gorge);
 // В горах камень выходит уже на умеренных склонах: скалы, а не заснеженные холмы.
 float rocky=max(smoothstep(mix(.35,.16,massif),mix(.6,.34,massif),1.0-world_normal.y),smoothstep(38.0,55.0,world_pos.y)*(1.0-gorge));
 // В ущелье стены — мокрый тёмный камень, с высотой светлее.
 vec3 wall_col=mix(rock_col*vec3(.5,.55,.58),rock_col*vec3(.86,.88,.92),smoothstep(40.0,110.0,world_pos.y));
 col=mix(col,mix(rock_col,wall_col,max(gorge,massif*.8)),rocky);
 float snowy=smoothstep(72.0,86.0,world_pos.y);
 // Над ущельем снег держится только на пологих гребнях и выше; отвесы остаются голым камнем.
 float line=mix(92.0,78.0,tier3);
 snowy=mix(snowy,smoothstep(line,line+16.0,world_pos.y)*smoothstep(.62,.86,world_normal.y),massif);
 // Вершина: снег ложится на кромки и уступы ниже общей снеговой линии.
 // у подошвы кромок — снег, по двору — лёгкая изморозь
 float rim=smoothstep(gw-14.0,gw-1.0,abs(gf.y))*.95+.04;
 snowy=max(snowy,gorge*tier3*rim*smoothstep(.72,.9,world_normal.y));
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
 normal=normalize(mix(normal,vec3(0.0,0.0,1.0),max(max(roads,gorge*.6),max(rocky,snowy))));
 NORMAL_MAP=normal*.5+.5;
 ROUGHNESS=mix(mix(.88,texture(forest_roughness,uv).r,weights.y),.55,gorge*(1.0-tier3)*(1.0-snowy));
 AO=mix(1.0,mix(.88,1.0,texture(forest_height,uv).r),weights.y);
 ALBEDO=col;
 SPECULAR=.25;
}
