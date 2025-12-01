#version 410

layout (location = 0) in vec3 vertex;
layout (location = 1) in vec3 normal;
layout (location = 2) in vec2 texcoord;


uniform mat4 vertex_model_to_world;
uniform mat4 vertex_world_to_clip;
uniform mat4 normal_model_to_world;

uniform float t;

out VS_OUT {
	vec3 world;
	vec2 object_xz;
	vec2 texcoord;
	vec2 normal_coord[3];
} vs_out;

float wave_value(vec2 position, vec2 direction, float frequency, float phase, float time)
{
	return (direction.x * position.x + direction.y * position.y) * frequency + time * phase;
}

float alpha_wave(vec2 position, vec2 direction, float frequency, float phase, float time)
{
	return 0.5 + 0.5 * sin((direction.x * position.x + direction.y * position.y) * frequency + time * phase);
}

float wave(vec2 pos, vec2 dir, float amp, float freq, float phase, float sharp, float time)
{
	return amp * pow(alpha_wave(pos, dir, freq, phase, time), sharp);
}


vec2 normal_coord(float tex_factor, float speed_factor, float time)
{
	vec2 tex_scale = vec2(8, 4);
	float normal_time = mod(time, 100.0);
	vec2 normal_speed = vec2(-0.05, 0.0);
	return texcoord.xy * tex_scale * tex_factor + normal_time * normal_speed * speed_factor;
}


void main()
{
	vec3 displaced_vertex = vertex;

	float wave_sum = 0.0;
	float wave_sum_dx = 0.0;
	float wave_sum_dz = 0.0;

	wave_sum += wave(vertex.xz, vec2(-1.0,  0.0), 1.0, 0.2, 0.5, 2.0, t);
	wave_sum += wave(vertex.xz, vec2(-0.7, 0.7), 0.5, 0.4, 1.3, 2.0, t);
	displaced_vertex.y += wave_sum;


	vec2 texScale = vec2(8, 4);
	float normalTime = mod(t, 100.0);
	vec2 normalSpeed = vec2(-0.05, 0.0);

	vec4 world = vertex_model_to_world * vec4(displaced_vertex, 1.0);

	vs_out.world = world.xyz;
	vs_out.object_xz = vertex.xz;
	vs_out.texcoord = texcoord;
	vs_out.normal_coord[0] = normal_coord(1.0, 1.0, t);
	vs_out.normal_coord[1] = normal_coord(2.0, 4.0, t);
	vs_out.normal_coord[2] = normal_coord(4.0, 8.0, t);

	gl_Position = vertex_world_to_clip * world;
}
