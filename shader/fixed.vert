# version 440

interface PSIN { vec3 epos; vec3 wpos; vec3 normal; vec2 tex; flat uint draw_id; };

uniform struct	camera_t { mat4 view_matrix,projection_matrix;float fovy,dnear,dfar,padding;} cam;

uniform mat4 model_matrix;

layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 texcoord;

out PSIN vout;

void main()
{
	vout.draw_id = DrawID;
	vout.wpos = (model_matrix*vec4(position, 1)).xyz;
	vout.epos = (cam.view_matrix*vec4(vout.wpos,1)).xyz;
	gl_Position = cam.projection_matrix*vec4(vout.epos,1);

	vout.tex = texcoord;
	vout.normal = normalize(mat3(model_matrix)*normal);
}
