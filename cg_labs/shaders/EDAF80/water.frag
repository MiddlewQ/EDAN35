#version 410

uniform vec3 light_position;
uniform vec3 camera_position;

uniform sampler2D water_texture;
uniform sampler2D normal_texture;
uniform samplerCube cubemap;

uniform mat4 normal_model_to_world;  // inverse-transpose of model

uniform float t;


in VS_OUT {
	vec3 world;
	vec2 object_xz;
	vec2 texcoord;
	vec2 normal_coord[3];
} fs_in;

out vec4 frag_color;

float wave_value(vec2 position, vec2 direction, float frequency, float phase, float time)
{
	return (direction.x * position.x + direction.y * position.y) * frequency + time * phase;
}

float alpha_wave(vec2 position, vec2 direction, float frequency, float phase, float time)
{
	return 0.5 + 0.5 * sin((direction.x * position.x + direction.y * position.y) * frequency + time * phase);
}

float wave_d(vec2 pos, vec2 dir, float amp, float freq, float phase, float sharp, float time, bool dx)
{
	float alpha = alpha_wave(pos, dir, freq, phase, time);
	float calc = 0.5 * sharp * freq * amp * pow(alpha, sharp - 1.0) * cos(wave_value(pos, dir, freq, phase, time));
    calc *= dx ? dir.x : dir.y;
	
	return calc;
}



void main()
{
	// Slopes
	vec2 pos = fs_in.object_xz;
	float dhdx = 0.0;
	float dhdz = 0.0;
	dhdx += wave_d(pos, vec2(-1.0,  0.0), 1.0, 0.2, 0.5, 2.0, t, true);
	dhdz += wave_d(pos, vec2(-1.0,  0.0), 1.0, 0.2, 0.5, 2.0, t, false);

	dhdx += wave_d(pos, vec2(-0.7, 0.7), 0.5, 0.4, 1.3, 2.0, t, true);
    dhdz += wave_d(pos, vec2(-0.7, 0.7), 0.5, 0.4, 1.3, 2.0, t, false);


	// Normal Mapping
	vec3 n_0 = texture(normal_texture, fs_in.normal_coord[0]).xyz * 2.0 - 1.0;
	vec3 n_1 = texture(normal_texture, fs_in.normal_coord[1]).xyz * 2.0 - 1.0;
	vec3 n_2 = texture(normal_texture, fs_in.normal_coord[2]).xyz * 2.0 - 1.0;
	vec3 n_bump = normalize(n_0 + n_1 + n_2);

	vec3 T = normalize(vec3(1.0, dhdx, 0.0));
	vec3 B = normalize(vec3(0.0, dhdz, 1.0));
	vec3 N_tan = normalize(vec3(-dhdz, 1, -dhdx));
	mat3 TBN = mat3(T, B, N_tan);

	// Normal (world space)
	vec3 N = mat3(normal_model_to_world) * TBN * n_bump;
	N = normalize(N);

	float eta = 1.0/1.33; // air / water
	if (gl_FrontFacing) {
		eta = 1.33;
		N = -N;
	}

	vec3 V = camera_position - fs_in.world;
	V = normalize(V);

	// Deep and Shallow Water
	vec4 colour_deep = vec4(0.0, 0.0, 0.1, 1.0);
	vec4 colour_shallow = vec4(0.0, 0.5, 0.5, 1.0);

	float facing = 1 - max(dot(V, N), 0);
	vec4 color_water = mix(colour_deep, colour_shallow, facing); 


	// Reflection
	vec3 R = reflect(-V, N);
	vec4 reflection = texture(cubemap, R);


	// Refraction
	R = normalize(refract(-V, N, eta));
	vec4 refraction = texture(cubemap, R);


	// Fresnel
	float R_0 = 0.02037;
	float fresnel = R_0 + (1 - R_0) * pow(1.0 - dot(V, N), 5);


	frag_color = color_water + reflection * fresnel + refraction * (1 - fresnel);
	//frag_color = refraction * (1.0-fresnel);
}
