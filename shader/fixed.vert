# version 440

interface PSIN { vec3 epos; vec3 wpos; vec3 normal; vec2 tex; flat uint draw_id; };	// struct not working for fragment shader

uniform struct	camera_t { mat4 view_matrix,projection_matrix;float fovy,aspect,dnear,dfar;vec4 eye,center,up;float F,E,df,fn; } cam;

uniform uint DrawID;	// for non-multidraw; see fixed-multi for multidraw

layout (std430, binding=0, row_major) readonly buffer GEO { geometry geometries[]; };

layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 texcoord;

out PSIN vout;

void main()
{
	vout.draw_id = DrawID;
	vout.wpos = (geometries[vout.draw_id].mtx*vec4(position, 1)).xyz;
	vout.epos = (cam.view_matrix*vec4(vout.wpos,1)).xyz;
	gl_Position = cam.projection_matrix*vec4(vout.epos,1);

	vout.tex = texcoord;
	vout.normal = normalize(mat3(geometries[vout.draw_id].mtx)*normal);
}
