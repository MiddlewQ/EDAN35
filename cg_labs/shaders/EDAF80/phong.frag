#version 410


uniform vec3 light_position;
uniform vec3 camera_position;

uniform vec3 ambient_colour;
uniform vec3 diffuse_colour;
uniform vec3 specular_colour;

uniform float shininess_value;
uniform float index_of_refraction_value;
uniform float opacity_value;

uniform mat4 normal_model_to_world;

uniform bool use_normal_mapping;

uniform sampler2D diffuse_texture;
uniform sampler2D normal_texture;
uniform sampler2D roughness_texture;


in VS_OUT {
	vec3 normal;
	vec2 texcoord;
	mat3 TBN;
	vec3 light_pos;
	vec3 camera_pos;
} fs_in;



out vec4 frag_color;

void main()
{
	vec4 tex = texture(diffuse_texture, fs_in.texcoord);
	vec4 roughness = texture(roughness_texture, fs_in.texcoord);
	

	vec3 N = normalize(fs_in.normal);

	if (use_normal_mapping) {
		vec3 normal_tan = texture(normal_texture, fs_in.texcoord).rgb;	
		normal_tan = normal_tan * 2.0 - 1;
		N = normalize(mat3(normal_model_to_world) * fs_in.TBN * normal_tan);

	} 

	vec3 L = normalize(fs_in.light_pos);
	vec3 V = normalize(fs_in.camera_pos);
	vec3 R = normalize(reflect(-L, N));

	float NdotL = max(dot(N, L), 0.0);
	float RdotV = max(dot(R, V), 0.0);

	vec3 ambient = ambient_colour;
	vec3 diffuse = tex.rgb * diffuse_colour * NdotL;
	vec3 specular = specular_colour * pow(RdotV, shininess_value);

	
	frag_color.xyz = ambient + diffuse + specular;
	frag_color.w = 1.0;
}
