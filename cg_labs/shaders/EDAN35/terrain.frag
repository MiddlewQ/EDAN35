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
	vec2 texcoord;
} fs_in;

out vec4 frag_color;

void main()
{
	frag_color = vec4(1.0, 1.0, 1.0, 1.0);
}
