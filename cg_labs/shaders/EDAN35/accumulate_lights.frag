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

void main()
{
	
	// Phong Shading
	vec2 texcoord = gl_FragCoord.xy * inverse_screen_resolution;
	vec2 texcoord_alt = texcoord * 2.0 - 1.0;
	vec3 N_tex = texture(normal_texture, texcoord).xyz;
	vec3 N = N_tex * 2.0 - 1.0;
	N = normalize(N);

	float depth = texture(depth_texture, texcoord).r;
	float depth_ndc = depth * 2.0 - 1.0;

	vec4 P = camera.view_projection_inverse * vec4(texcoord_alt, depth_ndc, 1.0); 
	P = P / P.w;
	
	vec3 L = normalize(light_position - P.xyz);
	vec3 V = normalize(camera_position - P.xyz);
	vec3 R = normalize(reflect(-L, N));
	vec3 D = normalize(light_direction);
	
	float NdotL = max(dot(N, L), 0.0);
	float RdotV = max(dot(R, V), 0.0);

	float shininess = 10.0;

	float diffuse = NdotL;
	float specular = pow(RdotV, shininess);

	// Light Falloff 
	float distance = length(light_position - P.xyz);
	float distance_falloff = clamp(1.0 / (distance * distance), 0.0, 1.0);

	float cos_angle = dot(D, -L);
	float cos_inner = cos(radians(0.0));
	float cos_outer = cos(light_angle_falloff);
	float angle_falloff = clamp((cos_angle - cos_outer) / (cos_inner - cos_outer), 0.0, 1.0);
	float light_effect = light_intensity * distance_falloff * angle_falloff;

	// Shadow Mapping
	vec4 P_light = lights[light_index].view_projection * P; // [0, 1]
	P_light = P_light / P_light.w;

	float frag_depth = P_light.z; // [0, 1]


	vec2 shadowmap_texel_size = 1.0f / textureSize(shadow_texture, 0);
	

	vec2 shadow_texcoord = P_light.xy * 0.5 + 0.5;

	// Percentage Closer Filtering (PCF)
	float shadow = 0;
	for(int row = -2; row < 2; row++) {
		float y_texel = shadow_texcoord.y + shadowmap_texel_size.y * row;
		for(int col = -2; col < 2; col++) {
			float x_texel = shadow_texcoord.x + shadowmap_texel_size.x * col;
			vec2 shadow_uv = vec2(x_texel, y_texel);
			float shadow_depth = texture(shadow_texture, shadow_uv).r;
			float bias = 0.001;
			shadow += frag_depth > shadow_depth + bias ? 0.0 : 1.0;
		}
	}

	shadow /= 16;

	light_diffuse_contribution = shadow * diffuse * light_effect * vec4(light_color, 1.0);
	light_specular_contribution = shadow * specular * light_effect * vec4(light_color, 1.0);
}
