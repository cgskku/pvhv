# version 440

//*************************************
//#define EXPAND_RROC		// further expansion of search bound; very low gain from this
//*************************************

uniform bool		b_edp_umbra;
uniform int		model;
uniform int		layer_index;
uniform uint		edp_sample_count;
uniform float		K0;
uniform float		flat_thresh;
uniform float		umbra_scale;
uniform vec2		umbra;

uniform sampler2D	SRC;

layout (std140, binding=10 ) uniform SAM { vec4 PD[EDP_MAX_SAMPLES]; };

out vec4 pout;
in PSIN pin;

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

// Shader Implementation of the PVHV
float relative_roc( float d, float df )
{
        // float coc_norm_scale() const { float E=F/fn*0.5f; return E/df/tan(fovy*0.5f); } // normalized coc scale in the screen space; E: lens_radius
        // float coc_scale( int height ) const { return coc_norm_scale()*float(height)*0.5f; } // screen-space coc scale; so called "K" so far
	// K0 = p_cam->coc_scale(output->height())*p_cam->df;
	float K = K0/df;			// reconstruct K using dynamic df
	float rroc = K*(d-df)/d;	// relative radius of COC against df (nearer object's depth)
	return abs(rroc);
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

vec4 encode_rgbzi( vec3 epos, vec4 color, uint draw_id )
{
	return vec4(	uintBitsToFloat(packHalf2x16(color.rg)),
					uintBitsToFloat(packHalf2x16(color.ba)),
					(-epos.z-cam.dnear)/(cam.dfar-cam.dnear),		// linear depth in 32 bits
					uintBitsToFloat(draw_id) );				// geometry ID (to find material ID and to generate motion later)
}

bool is_culled( vec2 tc, vec3 epos, int depth_index )
{
	float zf = texelFetch( SRC, ivec2(tc), 0 )[depth_index];
	if(model==BDP) return cull_simple(-epos.z,zf)
	if(model==UDP) return cull_umbra(epos,zf)
	if(model==EDP) return !edp_in_pvhv_lens(tc,epos,depth_index);
}	

void main()
{
	if(is_culled(gl_FragCoord.xy,pin.epos,2)) discard;
	if(!phong(pout, pin.epos, pin.normal, pin.tex, pin.draw_id)) discard;
	pout = encode_rgbzi( pin.epos, pout, pin.draw_id );
}