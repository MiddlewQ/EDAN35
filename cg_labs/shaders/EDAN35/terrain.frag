//
//  terrain.frag
//  
//
//  Created by Olle Persson on 2025-12-02.
//

#version 410

uniform sampler2D diffuse_texture;
uniform int has_diffuse_texture;

in VS_OUT {
	vec3 normals;
	vec2 texcoord;
} fs_in;

out vec4 frag_color;

void main()
{
	vec3 N = normalize(fs_in.normals);

    frag_color = vec4(N, 1.0);

}
