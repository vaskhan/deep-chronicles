shader_type spatial;
// Один слой: вода, мягкая отмель и пена у сканов. Без screen/depth texture.
render_mode cull_disabled, depth_prepass_alpha;
uniform float flow_speed = .55;
uniform vec2 pool_center;
varying vec3 wp;
void vertex(){wp=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void fragment(){
 vec2 uv=vec2(UV.x*5.0,UV.y+TIME*flow_speed);
 float detail=n(uv*vec2(5.0,2.5))*.65+n(uv*vec2(11.0,6.0))*.35;
 float ripples=sin(distance(wp.xz,pool_center)*4.0-TIME*3.0+detail*2.0)*.5+.5;
 float rings=pow(ripples,9.0)*COLOR.g*.065;
 float foam=smoothstep(.52,.76,detail)*(COLOR.b*.8+COLOR.r*.32)+rings;
 float edge=(1.0-COLOR.a)*.25*smoothstep(.45,.7,detail);
 vec3 water=mix(vec3(.018,.073,.068),vec3(.06,.18,.15),detail);
 ALBEDO=mix(water,vec3(.65,.75,.69),clamp(foam+edge,0.0,.8));
 NORMAL=normalize((VIEW_MATRIX*vec4((detail-.5)*.19,1.0,(ripples-.5)*.08,0.0)).xyz);
 ROUGHNESS=mix(.55,.85,foam); SPECULAR=.12;
 ALPHA=COLOR.a*.94;
}
