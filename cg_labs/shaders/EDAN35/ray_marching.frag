#version 410

// Terrain Uniforms
uniform int octaves;

// Camera Uniforms
uniform vec3 camera_position;
uniform vec3 camera_front;
uniform vec3 camera_right;
uniform vec3 camera_up;

// Atmosphere Uniforms 
uniform bool use_lighting_position;
uniform vec3 light_position;
uniform vec3 light_direction;
uniform float atmosphere_dimming;

// Terrain Uniforms
uniform int binary_search_depth;
uniform float terrain_scale;
uniform int max_steps;
uniform float max_distance;

uniform float min_step;
uniform float max_step;

// Generation Uniforms
const float terrain_base_y = 50.0;
const float terrain_amplitude = 80.0;
const float sea_level = 20.0;
const float grass_level = 30.0;
const float snow_level = 50.0;

in VS_OUT {
	vec2 texcoord;
} fs_in;

out vec4 frag_color;


struct Ray {
	vec3 origin_world;
	vec3 direction_world;
};

struct HitInfo {
	bool hit;
	float hit_distance;
	vec3 hit_point_world;
	vec3 normal_world;
};

// --------------------------------------------------------------
// ------------------------ START NOISE -------------------------
// --------------------------------------------------------------

float hash2d_to_float(vec2 p) {
    p = floor(p);
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}


// 2D value noise
float value_noise(vec2 p) {
    vec2 i = floor(p);      // integer grid cell
    vec2 f = fract(p);      // fractional part inside the cell

    // Random values at the corners of the cell
    float v00 = hash2d_to_float(i + vec2(0.0, 0.0));
    float v10 = hash2d_to_float(i + vec2(1.0, 0.0));
    float v01 = hash2d_to_float(i + vec2(0.0, 1.0));
    float v11 = hash2d_to_float(i + vec2(1.0, 1.0));

    // Smooth interpolation weights
    vec2 u = vec2(smoothstep(0.0, 1.0, f.x), smoothstep(0.0, 1.0, f.y));

    // Bilinear interpolation
    float nx0 = mix(v00, v10, u.x);
    float nx1 = mix(v01, v11, u.x);
    float n   = mix(nx0, nx1, u.y);

    return n; // in [0,1]
}

// Fractional Brownian Motion
float fbm(vec2 pos) {
    float sum = 0.0;
    float amplitude = 1.0;
    float freq = 1.0;
	float amplitude_sum = 0.0;

	const mat2 rotation_matrix = mat2(
		4.0/5.0, 3.0/5.0,
		-3.0/5.0, 4.0/5.0
	);
	mat2 current_matrix = mat2(1.0);


    for (int i = 0; i < octaves; ++i) {
        sum += value_noise(pos * freq * current_matrix) * amplitude;
		amplitude_sum += amplitude;

		// New matrix for next octave (high frequency & lower amplitude, rotated)
        freq *= 2.0;   
        amplitude *= 0.5;
		//current_matrix *= rotation_matrix;
    }
    return sum / amplitude_sum; 
}

// --------------------------------------------------------------
// ------------------------- END NOISE --------------------------
// --------------------------------------------------------------

// --------------------------------------------------------------
// --------------------- START ATMOSPHERE -----------------------
// --------------------------------------------------------------


vec3 atmosphere_mixer(float t) {
	float scaled_t = t / 2.0;
	vec3 lambda = exp(-atmosphere_dimming * scaled_t * vec3(1.0, 2.0, 4.0)); 
	
	return lambda;
}


vec3 sky(vec3 light_position, vec3 ray_origin_world, vec3 ray_direction_world) {
	// Sky color
	vec3 sky_color = vec3(0.5, 0.7, 1.1) - ray_direction_world.y * 0.4; 

	// -- Show Light Source Location
	vec3 light_to_camera = normalize(light_position - ray_origin_world);
	float alignment = dot(ray_direction_world, light_to_camera);
	float sun_threshold = 0.98;
	float sun_mask = smoothstep(sun_threshold, 1.0, alignment);
	vec3 sun_color = vec3(1.0, 0.95, 0.7);
	sky_color = mix(sky_color, sun_color, sun_mask);


	return sky_color;

}


vec3 sky_clouds(vec3 ray_origin_world, vec3 ray_direction_world)
{

    // Base sky
    vec3 sky_color = vec3(0.42,0.62,1.1) - ray_direction_world.y*0.4;

    // clouds
    float travel_distance = (150.0 - ray_origin_world.y) / ray_direction_world.y;

    if(travel_distance > 0.0) {
        vec2 position_xz = (ray_origin_world + travel_distance * ray_direction_world).xz;

        float cl = fbm( position_xz * 0.007);
        float dl = smoothstep(0.25, 0.6, cl);
        sky_color = mix(sky_color, vec3(1.0), 0.50 * dl);
    }

	vec3 sun_direction_world =
        use_lighting_position
            ? normalize(light_position - ray_origin_world)   // camera->light
            : normalize(light_direction);					 // camera->sun direction

	float alignment = dot(ray_direction_world, sun_direction_world);

	// Disk size and edge softness
    float sun_disk_start = 0.9975;
    float sun_disk_end   = 0.9999;
    float sun_disk = smoothstep(sun_disk_start, sun_disk_end, alignment);

    // Glow
    float sun_glow_power = 64.0;
    float sun_glow = pow(clamp(alignment, 0.0, 1.0), sun_glow_power);

    vec3 sun_color = vec3(1.0, 0.95, 0.7);

	// Additive glow + disk blend
    sky_color = mix(sky_color, sun_color, sun_disk);
    sky_color += sun_color * 0.25 * sun_glow;

	return sky_color;
}


// --------------------------------------------------------------
// ---------------------- END ATMOSHPERE ------------------------
// --------------------------------------------------------------



// --------------------------------------------------------------
// ----------------------- START TERRAIN ------------------------
// --------------------------------------------------------------


// Unnused function
/*
float terrain_height_lod(vec2 plane, float travel_distance) {
	float scale = terrain_scale;

	const float NEAR_LOD = 30.0;
	const float FAR_LOD = 300.0;


	float level_of_detail = clamp((travel_distance - NEAR_LOD) / (FAR_LOD - NEAR_LOD), 0.0, 1.0);
	float min_octaves = 8.0;
	float max_octaves = float(octaves);
	

	float height = fbm(plane * scale) * 2.0 - 1.0; // [-1,1]
	
	float amplitude = 80.0;
	height = height * amplitude + 50.0;


	return height;
}
*/

float terrain_height(vec2 plane) {
    float n = fbm(plane * terrain_scale) * 2.0 - 1; // [-1, 1]
	return n * terrain_amplitude + terrain_base_y;
}

vec3 terrain_normal(vec3 world_position, float t) {
	float epsilon = 0.03;

	vec2 plane = world_position.xz;

	float h_right    = terrain_height(plane + vec2( epsilon, 0.0));
	float h_left     = terrain_height(plane + vec2(-epsilon, 0.0));
	float h_forward  = terrain_height(plane + vec2(0.0, epsilon));
	float h_backward = terrain_height(plane + vec2(0.0, -epsilon));

	vec3 normal = vec3(
		h_left - h_right,
		2.0 * epsilon,
		h_backward - h_forward
	);

	return normalize(normal);
}

float terrain_diffuse(vec3 light_dir, vec3 normals) {
	float NdotL = dot(normals, light_dir);
	return max(NdotL, 0.0);
}

float terrain_shadow(vec3 ray_origin_world, vec3 ray_direction_world, float max_distance_to_light) {

	const int max_shadow_steps = 64;
	float max_shadow_distance = min(max_distance, max_distance_to_light);

	if (max_shadow_distance <= 1e-4)
        return 1.0;


	const float factor = 32.0;

	float visibility = 1.0;
	float step_distance = max_shadow_distance / float(max_shadow_steps);
	float travel_distance = step_distance; // Avoid starting at 0.0 for invalid division

	for (int i = 0; i < max_shadow_steps; ++i) {
        vec3 hit_position = ray_origin_world + travel_distance * ray_direction_world;
		float terrain_height = terrain_height(hit_position.xz);
		float height_delta = hit_position.y - terrain_height;

		if (height_delta < 0.0)
            return 0.0;

		visibility = min(visibility, factor * height_delta / travel_distance);

		travel_distance += step_distance;
        if (travel_distance >= max_shadow_distance)
            break;
    }
	visibility = smoothstep(0.0, 1.0, visibility);
	return visibility;
}

/**
 * Raymarching function to find intersection with terrain
 * @param ray_origin Origin of the ray in world space
 * @param ray_direction Direction of the ray in world space (should be normalized)
 * @param hit_distance Output parameter to store the distance to the hit point
 * @return If the terrain was hit by the ray
 */
bool terrain_raymarch(
	vec3 ray_origin,
	vec3 ray_direction,
	out float hit_distance)
{
	int max_steps_count      = max_steps;
	float max_trace_distance = max_distance;
	float min_step_distance  = min_step;
	float max_step_distance  = max_step;

	// Raymarch t (travel_distance)
	float travel_distance = min_step_distance;

	// If ray is above highest terrain, limit max distance (or return early)
	// Massive improvements looking at the sky (reduce unnecessary rays)
	const float terrain_max_y = 130.0;
	if (ray_direction.y > 0.0) {
		float t_to_ceiling_along_ray = (terrain_max_y - ray_origin.y) / ray_direction.y;
		if (t_to_ceiling_along_ray <= 0.0)
			return false;
		max_trace_distance = min(max_trace_distance, t_to_ceiling_along_ray);
	}


	// If view starts above highest terrain, we can move starting point until it at max height
	// Massive improvements at high elevations
	if (ray_origin.y > terrain_max_y && ray_direction.y < 0.0) {
		float t_to_ceiling_along_ray = (terrain_max_y - ray_origin.y) / ray_direction.y;
		travel_distance = max(travel_distance, t_to_ceiling_along_ray);
	}

	// If we start inside terrain:
	float prev_travel_distance = 0.0;
    float prev_height_above = ray_origin.y - terrain_height(ray_origin.xz);
    if (prev_height_above < 0.0) {
        hit_distance = 0.0;
        return true;
    }


	// Main loop
	for(int i = 0; i < max_steps_count && travel_distance < max_trace_distance; ++i) {

		vec3 position      = ray_origin + travel_distance * ray_direction;
		float terrain_h    = terrain_height(position.xz);
		float height_delta = position.y - terrain_h;


		float epsilon = 1e-4 * travel_distance;   
		if (height_delta < epsilon) {
			// Locally refine height value to prevent wobble

			float t_min = prev_travel_distance;
			float t_max = travel_distance;

			// Binary search using X iterations
			for (int j = 0; j < binary_search_depth; ++j) {
				float t_mid = 0.5 * (t_min + t_max);
				vec3 mid_pos = ray_origin + t_mid * ray_direction;
				float mid_height = terrain_height(mid_pos.xz);
				float mid_delta = mid_pos.y - mid_height;

				if (mid_delta > 0.0) 
					t_min = t_mid;
				else
					t_max = t_mid; 
			}

			hit_distance = 0.5 * (t_min + t_max);
			return true;
		}	
		prev_travel_distance = travel_distance;

		float abs_ray_dir_y = abs(ray_direction.y);
		float travel_distance_to_surface = height_delta / max(abs_ray_dir_y, 0.002);

		float distance_factor = smoothstep(1000.0, 2000.0, travel_distance); // 0 near, 1 far
		float step_scale	  = mix(0.2, 0.8, distance_factor);
		float dt_raw          = travel_distance_to_surface * step_scale;
		float dt              = clamp(dt_raw, min_step_distance, max_step_distance);

		travel_distance += dt;
	}

	hit_distance = max_trace_distance;
	return false;
}

// --------------------------------------------------------------
// ------------------------ END TERRAIN -------------------------
// --------------------------------------------------------------

Ray make_view_ray(vec2 texcoord)
{
    float x_ndc = texcoord.x * 2.0 - 1.0;
    float y_ndc = texcoord.y * 2.0 - 1.0;

    vec3 ray_direction_camera = normalize(vec3(x_ndc, y_ndc, 1.0));

    Ray ray;
    ray.origin_world = camera_position;
    ray.direction_world =
        normalize(ray_direction_camera.x * camera_right +
                  ray_direction_camera.y * camera_up +
                  ray_direction_camera.z * camera_front);
    return ray;
}


void main() {

	vec3 color;

	Ray view_ray = make_view_ray(fs_in.texcoord);

	HitInfo hit_info;
	hit_info.hit_distance = 0.0;
	hit_info.hit = terrain_raymarch(view_ray.origin_world,
									view_ray.direction_world,
									hit_info.hit_distance);

	hit_info.hit_point_world = view_ray.origin_world + view_ray.direction_world * hit_info.hit_distance;

	// Did not hit terrain, use sky instead
	if (!hit_info.hit) {
		color = sky_clouds(view_ray.origin_world, view_ray.direction_world);
		frag_color = vec4(color, 1.0);
		return;
	}

	// -- Render Terrain 
	hit_info.normal_world = terrain_normal(hit_info.hit_point_world, hit_info.hit_distance);

	
	// Lighting
	vec3 light_direction_world;
	float max_distance_to_light;

	if (use_lighting_position) {
	    vec3 light_vector_world = light_position - hit_info.hit_point_world;
		light_direction_world   = normalize(light_vector_world);
		max_distance_to_light   = length(light_vector_world);
	} else {
		light_direction_world = normalize(light_direction);
		max_distance_to_light = max_distance; // Very far away
	}


	// Shadow Ray
	vec3 shadow_origin_world = hit_info.hit_point_world + hit_info.normal_world * 0.1; 	// Move shadow slightly
	Ray shadow_ray;
	shadow_ray.origin_world = shadow_origin_world;
	shadow_ray.direction_world = light_direction_world;


	// Lighting Terms
	float ambient = 0.2;
	float diffuse = terrain_diffuse(light_direction_world, hit_info.normal_world);
	float shadow  = terrain_shadow(shadow_ray.origin_world, shadow_ray.direction_world, max_distance_to_light);
	float light_term = ambient + diffuse * shadow;

	// Material
	vec3 water_color = vec3(0.0, 0.3, 0.7);
	vec3 atmosphere_color = vec3(0.8);
	vec3 snow_color = vec3(1.0);
	
	vec3 rock_color = vec3(228.0/255.0, 172.0/255.0, 155.0/255.0);
	vec3 grass_color = vec3(0.51, 0.51, 0.05);

	float grass_flat_surface_factor = smoothstep(0.6, 0.7, hit_info.normal_world.y);
	float grass_low_altitude_factor = smoothstep(snow_level*1.05, grass_level, hit_info.hit_point_world.y);
	vec3 terrain_base_color = mix(rock_color, grass_color, grass_flat_surface_factor * grass_low_altitude_factor);

	float snow_blend = smoothstep(snow_level*0.95, 70.0, hit_info.hit_point_world.y);
	terrain_base_color = mix(terrain_base_color, snow_color, snow_blend);


	// -- Combine
	color = (hit_info.hit_point_world.y > sea_level) ? terrain_base_color : water_color;
	color *= light_term;
	color = mix(atmosphere_color, color, atmosphere_mixer(hit_info.hit_distance));


	frag_color = vec4(color, 1.0);
}
