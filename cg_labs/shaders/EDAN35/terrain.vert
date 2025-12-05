//
//  terrain.vert
//  
//
//  Created by Olle Persson on 2025-12-02.
//

#version 410

layout (location = 0) in vec3 vertex;
layout (location = 1) in vec3 normal;
layout (location = 2) in vec2 texcoord;

uniform mat4 vertex_model_to_world;
uniform mat4 vertex_world_to_clip;

float eps = 0.001;


out VS_OUT {
	vec3 world_position;
	vec3 normal;
	vec2 texcoord;
} vs_out;

// ------------------- START NOISE
float hash(vec2 p)
{
    p  = 50.0*fract( p*0.3183099 + vec2(0.71,0.113));
    return -1.0+2.0*fract( p.x*p.y*(p.x+p.y) );
}	

float noise(in vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
	
    // quintic interpolant
    vec2 u = f*f*(f*(f*6.0-15.0)+10.0);

    return mix( mix( hash( i + vec2(0.0,0.0) ), 
                     hash( i + vec2(1.0,0.0) ), u.x),
                mix( hash( i + vec2(0.0,1.0) ), 
                     hash( i + vec2(1.0,1.0) ), u.x), u.y);
}

float height_displacement(vec2 position, int N)
{

	float height_sum = 0.0;
	float scaling_factor = 1.0;
	mat2 rotation_matrix = mat2(
		4.0/5.0, 3.0/5.0,
		-3.0/5.0, 4.0/5.0
	);
	mat2 current_matrix = mat2(
		1.0, 0.0,
		0.0, 1.0
	);

	for(int i = 0; i < N; i++) {
		height_sum += 1.0/scaling_factor * noise(scaling_factor * current_matrix * position); 
		scaling_factor *= 2.0;
		current_matrix *= rotation_matrix;
	}
	return height_sum;
}
// ------------------- End Noise

vec3 get_normal(const vec3 p, int N)
{

	float h_right   = height_displacement(vec2(p.x + eps, p.z), N);
	float h_left    = height_displacement(vec2(p.x - eps, p.z), N);
	float h_forward = height_displacement(vec2(p.x, p.z + eps), N);
	float h_back    = height_displacement(vec2(p.x, p.z - eps), N);

	vec3 normal = vec3(
		-(h_right - h_left),
		2.0f*eps,
		-(h_forward - h_back) 
	);


	return normalize(normal);
}


void main() {
	int N = 5;
	// World Position
	float height = height_displacement(vertex.xz, N);
	vec3 displaced_vertex = vec3(vertex.x, height, vertex.z);
    vec3 world_pos = vec3(vertex_model_to_world * vec4(displaced_vertex, 1.0));
	vs_out.world_position = world_pos;

	// Normals
	vec3 normal = get_normal(displaced_vertex, N);
	normal = vec3(vertex_model_to_world * vec4(normal, 0.0));
	vs_out.normal = normalize(normal);

	// Textures
	vs_out.texcoord = texcoord;

	gl_Position =  vertex_world_to_clip * vec4(world_pos, 1.0);
}
