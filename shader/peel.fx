//*************************************
//#define EXPAND_RROC		// further expansion of search bound; very low gain from this
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

// K0 = p_cam->coc_scale(output->height())*p_cam->df;

float relative_roc( float d, float df )
{
	float K = K0/df;			// reconstruct K using dynamic df
	float rroc = K*(d-df)/d;	// relative radius of COC against df (nearer object's depth)
	return abs(rroc);
}

bool cull_simple_thresh( float d, float zf, float thresh )
{
	if(zf==0||zf>0.999) return true; // previous layer was empty
	if(d<mix(cam.dnear,cam.dfar,zf+thresh)) return true; // early reject
	return false;
}

bool cull_simple( float d, float zf )
{
	return cull_simple_thresh( d, zf, EPSILON );
}

bool cull_umbra( vec3 epos, float zf )
{
	float d = -epos.z;
	float df = mix(cam.dnear,cam.dfar,zf);
	float h  = umbra.y*length(epos.xy)/df;	// never use xy.length(), which is just two
	float e  = umbra.x;
	float s  = tan(cam.fovy*0.5f)*2.0f*df/height*umbra_scale;
	if(e+h<s) return true; // no more peeling, because the pixel geometry size > lens size
	float t  = (df-umbra.y)*s/(e+h-s);
	return d < df+t;
}

bool edp_in_pvhv_lens( vec2 tc, vec3 epos, int depth_index ) // if frag is in pvhv, it returns true;
{
	float d = -epos.z;
	vec4 P = texelFetch( SRC, ivec2(tc), 0 );
	uint P_item = floatBitsToInt(P.w); if(P_item<0) return false;
	float zf = P[depth_index];
	if(cull_simple(d,zf)) return false;
	if(b_edp_umbra&&layer_index>2) return !cull_umbra(epos,zf);

	float df = mix(cam.dnear, cam.dfar, zf); 
	float bound = relative_roc(d, df);

	for( int k=0; k<edp_sample_count; k++ )
	{
		vec2 v = PD[k].xy*bound; 
		vec2 tc_q = round(tc+v); 
		vec4 Q = texelFetch(SRC, ivec2(tc_q), 0);
		uint Q_item = floatBitsToInt(Q.w); if(Q_item<0) return false;
		float zq = Q[depth_index]; if(zq==0) return true; if(zq>0.99f) continue;  

		// test whether sample is on the flat surface, or not
		if( P_item != Q_item ) return true;
		else if( zq >= zf + flat_thresh ) return true;
		else if( zq <= zf - flat_thresh )
		{
#ifndef EXPAND_RROC		// simpler test
		return true;
#else
		zf = zq; df = mix(cam.dnear, cam.dfar, zf); bound = relative_roc(d, df); 
#endif
		}
	}

	return false;
}

bool is_culled( vec2 tc, vec3 epos, int depth_index )
{
	if(model==EDP_LENS)			return !edp_in_pvhv_lens(tc,epos,depth_index);
	return cull_frag(tc,epos,depth_index);
}

shader psRGBZIPeel( in PSIN pin, out vec4 pout )
{
	if(is_culled(gl_FragCoord.xy,pin.epos,2)) discard;
	if(!phong(pout, pin.epos, pin.normal, pin.tex, pin.draw_id)) discard;
	pout = encode_rgbzi( pin.epos, pout, pin.draw_id );
}

program rgbzi_peel {	vs(440)=vsFixed(); fs(440)=psRGBZIPeel(); };