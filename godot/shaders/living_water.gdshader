shader_type spatial;
render_mode cull_disabled;
varying vec3 world;
float wave(vec2 p) {
 return sin(p.x * .85 + p.y * .45 + TIME * .8) * .45 + sin(p.x * -.38 + p.y * 1.1 - TIME * 1.1) * .3 + sin(p.x * 2.9 + p.y * 2.2 + TIME * 1.5) * .12;
}
void vertex() { world = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz; }
void fragment() {
 vec2 p = world.xz;
 float w = wave(p);
 vec2 slope = vec2(wave(p + vec2(.1,0.0))-w, wave(p + vec2(0.0,.1))-w) * 1.7;
 NORMAL_MAP = normalize(vec3(-slope.x, -slope.y, 1.0)) * .5 + .5;
 float shimmer = smoothstep(.52,.83,w);
 ALBEDO = mix(vec3(.025,.16,.20), vec3(.075,.34,.37), w * .35 + .5) + shimmer * vec3(.035,.055,.05);
 METALLIC = .25;
 ROUGHNESS = .2;
 SPECULAR = .65;
}
