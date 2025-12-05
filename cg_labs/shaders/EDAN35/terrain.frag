//
//  terrain.frag
//  
//
//  Created by Olle Persson on 2025-12-02.
//

#version 410

uniform sampler2D diffuse_texture;
uniform int has_diffuse_texture;

uniform vec3 light_position;

in VS_OUT {
	vec3 world_position;
	vec3 normal;
	vec2 texcoord;
} fs_in;


bool castRay( in vec3 ro, in vec3 rd, out float resT )
{
    float dt = 0.01;
    float mint = 0.001;
    float maxt = 10.0;
    float lh = 0.0;
    float ly = 0.0;
    for( float t = mint; t<maxt; t += dt )
    {
        vec3  p = ro + rd*t;
        float h = f( p.xz );
        if( p.y < h )
        {
            // interpolate intersection distance
            resT = t-dt+dt*(lh-ly)/(p.y-ly-h+lh);
            return true;
        }
        // accuracy proportional to the distance
        dt = 0.01*t;
        lh = h;
        ly = p.y;
    }
    return false;
}

out vec4 frag_color;

void main()
{
	vec3 normal = normalize(fs_in.normal);

	vec3 light_direction = normalize(light_position - fs_in.world_position);
	// NdotL
	float light_impact = max(dot(normal,light_direction), 0.0);

	vec3 rock_color = vec3(0.894, 0.685, 0.610);

	vec3 color = light_impact * rock_color;
    frag_color = vec4(color, 1.0);

} 
