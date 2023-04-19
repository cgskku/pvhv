#version 440

// input vertex attributes
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 texcoord;

// output attributes to fragment shader
out VOUT
{
	vec3 epos;			// eye-space position
	vec3 wpos;			// world-space position
	vec3 normal;		// eye-space normal
	vec2 tex;			// texture coordinate
	flat uint draw_id;	// object ID
} vout;

// uniform variables
uniform uint	DrawID;			// multidraw can use gl_DrawID alternatively
uniform mat4	model_matrix;	// object transformation matrix
uniform struct	camera_t
{
	mat4	view_matrix;
	mat4	projection_matrix;
	float	fovy, dnear, dfar, padding; // dummy padding for 4-byte alignment
} cam;

void main()
{
	vout.wpos		= (model_matrix*vec4(position,1)).xyz;
	vout.epos		= (cam.view_matrix*vec4(vout.wpos,1)).xyz;
	gl_Position		= cam.projection_matrix*vec4(vout.epos,1);

	vout.normal		= normalize(mat3(model_matrix)*normal);
	vout.texcoord	= texcoord;
	vout.draw_id	= DrawID;
}
