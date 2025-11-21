#version 410

struct ViewProjTransforms
{
	mat4 view_projection;
	mat4 view_projection_inverse;
};

layout (std140) uniform CameraViewProjTransforms
{
	ViewProjTransforms camera;
};

layout (std140) uniform LightViewProjTransforms
{
	ViewProjTransforms lights[4];
};

uniform int light_index;

uniform sampler2D depth_texture;
uniform sampler2D normal_texture;
uniform sampler2D shadow_texture;

uniform vec2 inverse_screen_resolution;

uniform vec3 camera_position;

uniform vec3 light_color;
uniform vec3 light_position;
uniform vec3 light_direction;
uniform float light_intensity;
uniform float light_angle_falloff;

layout (location = 0) out vec4 light_diffuse_contribution;
layout (location = 1) out vec4 light_specular_contribution;


float PI = 3.141592653589793;

void main()
{
	vec2 shadowmap_texel_size = 1.0f / textureSize(shadow_texture, 0);

	// Phong Shading
	vec2 texcoord = gl_FragCoord.xy * inverse_screen_resolution;
	vec3 N = texture(normal_texture, texcoord).xyz * 2.0 - 1.0;
	N = normalize(N);

	vec4 depth = texture(depth_texture, texcoord);

	vec4 P = depth * camera.view_projection_inverse;
	P = P / P.w;
	P = normalize(P);

	vec3 L = normalize(light_position - P.xyz);
	vec3 V = normalize(camera_position - P.xyz);
	vec3 R = normalize(reflect(-L, N));

	float NdotL = max(dot(N, L), 0.0);
	float RdotV = max(dot(R, V), 0.0);

	float shininess = 100.0;

	// Light Falloff 
	float distance = length(light_position - P.xyz);
	float distance_falloff = clamp(1.0 / (distance * distance), 0.0, 1.0);

	float angle = acos(length(light_direction) / length(distance));
	angle = angle * 4 / PI;
	float angle_falloff = clamp(1.0 - angle, 0.0, 1.0);

	
	light_diffuse_contribution  = NdotL * light_intensity * distance_falloff * vec4(light_color, 1.0);
	light_specular_contribution = pow(RdotV, shininess) * light_intensity * distance_falloff * vec4(light_color, 1.0);
}
