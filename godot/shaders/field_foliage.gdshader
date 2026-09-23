shader_type spatial;
render_mode cull_disabled;
varying vec3 shade;
void vertex() {
 vec3 anchor = MODEL_MATRIX[3].xyz;
 vec3 p = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
 float gust = sin(p.x * .19 + p.z * .13 + TIME * 1.7) + .4 * sin(p.z * .41 - TIME * 2.4);
 VERTEX.x += gust * UV.y * UV.y * .12;
 VERTEX.z += gust * UV.y * UV.y * .065;
 shade = COLOR.rgb;
 float d = distance(CAMERA_POSITION_WORLD, anchor);
 VERTEX *= 1.0 - smoothstep(140.0, 180.0, d);
}
void fragment() {
 ALBEDO = shade * mix(.72, 1.12, UV.y);
 ROUGHNESS = .89;
 BACKLIGHT = shade * .08;

}
