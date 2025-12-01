#version 410

layout (location = 0) in vec3 vertex;
layout (location = 1) in vec3 normal;
layout (location = 2) in vec2 texcoord;
layout (location = 3) in vec3 tangent;
layout (location = 4) in vec3 binormal;


uniform mat4 vertex_model_to_world;
uniform mat4 normal_model_to_world;
uniform mat4 vertex_world_to_clip;

uniform vec3 light_position;
uniform vec3 camera_position;


out VS_OUT {
	vec3 normal;
	vec2 texcoord;
	mat3 TBN;
	vec3 light_pos;
	vec3 camera_pos;
} vs_out;


void main()
{

	// Normal Mappings
	vec3 N = (normal_model_to_world * vec4(normal, 0.0)).xyz;
	vs_out.normal = N;

	vs_out.TBN = mat3(
		tangent,
		binormal,
		normal
	);

	vs_out.texcoord = texcoord;

	// Camera & Light Fixtures
	vec4 world_position = vertex_model_to_world * vec4(vertex, 1.0);
	vs_out.light_pos = light_position - world_position.xyz;
	vs_out.camera_pos = camera_position - world_position.xyz;

	gl_Position = vertex_world_to_clip * world_position;
}
