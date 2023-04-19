#version 450

// DP model indexes
#define MODEL_BDP 	0
#define MODEL_UDP 	1
#define MODEL_EDP 	2

// important constants/macros
#define EDP_MAX_SAMPLES		64		// maximum of backward-search samples in EDP
#define BDP_EPSILON			0.0005

// input attributes from vertex shader
in PIN
{
	vec3 epos;			// eye-space position
	vec3 wpos;			// world-space position
	vec3 normal;		// eye-space normal
	vec2 tex;			// texture coordinate
	flat uint draw_id;	// object ID
} pin;

// output fragment color
out vec4 pout;

// uniform texture
uniform sampler2D	SRC;			// previous layer texture (encoded as RGBZI format)

// uniform variables
uniform float	height;				// vertical screen resolution
uniform int		model;				// index in { MODEL_BDP, MODEL_UDP, MODEL_EDP }
uniform int		layer_index;		// h: index of the current layer
uniform uint	edp_sample_count;	// number of backward-search samples in EDP (default: 14)
uniform float	edp_delta;			// depth threshold for connectivity test (default: 0.002)

// uniform buffers
layout(std140, binding=10) uniform SAM
{
	// circular Poisson-Disk (or Halton) samples in [-1,1]: using .xy only
	vec4 PD[EDP_MAX_SAMPLES];
};

// BDP: Implementation of Baseline Depth Peeling [Everitt 2001]
// Cass Everitt. Interactive order-independent transparency. NVIDIA 2001.
// input: fragment depth, normalized blocker depth (in the previous layer)
bool cull_bdp( float d, float zf )
{
	if( zf==0 || zf>0.999 ) return true; // invalid/empty blocker
	if( d < mix( cam.dnear, cam.dfar, zf+BDP_EPSILON )) return true;
	return false;
}

// UDP: Implementation of Umbra culling-based Depth Peeling [Lee et al. 2010]
// Sungkil Lee, Elmar Eisemann, and Hans-Peter Seidel. Real-Time Lens Blur Effects and Focus Control, ACM SIGGRAPH 2010.
// input: fragment eye-space position, normalized blocker depth (in the previous layer)
bool cull_umbra( vec3 epos, float zf )
{
	float d = -epos.z; // fragment depth
	float df = mix( cam.dnear, cam.dfar, zf ); // blocker depth
	float s  = tan( cam.fovy*0.5f )*2.0f*df/height; // pixel geometry size
	if(cam.E<s) return true; // no more peeling, because the pixel geometry size > lens size
	float x  = df*s/(cam.E-s);
	return d < df+x;
}

// Algorithm 1. LCOC()
float LCOC( float d, float df ) // fragment depth, blocker depth
{
	float K = float(height)*0.5f/df/tan(cam.fovy*0.5f); // screen-space LCOC scale
	return K*cam.E*abs(df-d)/d; // relative radius of COC against df (blocker depth)
}

// Algorithm 1. InPVHV()
// input: texture coordinate, eye-space position of input fragment (i.e., p)
bool InPVHV( vec2 tc, vec3 epos )
{
	float d		= -epos.z; // fragment depth
	vec4 q		= texelFetch( SRC, ivec2(tc), 0 ); // blocker
	uint q_item	= floatBitsToInt(q.w); if(q_item<0) return false; // bypass invalid blocker
	
	if(cull_bdp(d,q.z)) return false; // early culling with BDP
	if(layer_index>2) return !cull_umbra(epos,q.z); // hybrid DP: use UDP for h>2

	float df = mix(cam.dnear, cam.dfar, q.z);
	float R = LCOC(d, df);
	for( int k=0; k < edp_sample_count; k++ )
	{
		vec2 offset = PD[k].xy*R;	// sample offset
		vec4 w = texelFetch(SRC, ivec2(round(tc+offset)), 0); // fetch sample
		uint w_item = floatBitsToInt(w.w); if(w_item<0) return false;
		if(w.z==0) return true;		// empty sample
		if(w.z>0.99f) continue;		// background

		// Correspond to Algorithm 1. EdgeExists()
		if( q_item != w_item ) return true;			// edge exists
		else if( w.z>=q.z+edp_delta ) return true;	// edge exists
		// conservative approximation: Line 17 in Algorithm 1
		else if( w.z<=q.z-edp_delta ) return true;	
		// otherwise, the sample w is connected to blocker, requiring more tests
		else continue; // just for readability: this can be commented out in practice
	}

	return false;
}

void main()
{
	// fragment culling
	if(model==MODEL_EDP)
	{
		if(!InPVHV( tc, pin.epos )) discard;
	}
	else // BDP or UDP
	{
		float zf = texelFetch( SRC, ivec2(gl_FragCoord.xy), 0 ).z; // blocker depth
		if(	model==MODEL_BDP && cull_bdp( -pin.epos.z, zf )) discard;
		else if(model==MODEL_UDP && cull_umbra( pin.epos, zf )) discard;
	}

	// apply shading (e.g., Phong shading)
	if(!phong(pout, pin.epos, pin.normal, pin.tex, pin.draw_id)) discard;

	// encode output in RGBZI (color, depth, item) format
	pout.r = uintBitsToFloat(packHalf2x16(pout.rg));		// color.rg
	pout.g = uintBitsToFloat(packHalf2x16(pout.ba));		// color.ba
	pout.z = (-pin.epos.z-cam.dnear)/(cam.dfar-cam.dnear);	// normalized linear depth
	pout.a = uintBitsToFloat(pin.draw_id);					// object ID
}
