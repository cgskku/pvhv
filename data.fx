//*************************************
//#define EXPAND_RROC				// further expansion of search bound; very low gain from this
#define BOUND_THRESH	1.0	// minimum bound size to the neighbors
//*************************************

uniform bool		b_edp_umbra;
uniform int			model;
uniform int			layer_index;
uniform uint		edp_sample_count;
uniform float		umbra_scale;
uniform float		K0;
uniform float		flat_thresh;
uniform vec2		umbra;

uniform sampler2D	SRC;

layout (std140, binding=10 ) uniform SAM { vec4 PD[EDP_MAX_SAMPLES]; };