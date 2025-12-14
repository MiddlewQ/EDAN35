#version 410

// Terrain Uniforms
uniform int octaves;

// Camera Uniforms
uniform vec3 camera_position;
uniform vec3 camera_front;
uniform vec3 camera_right;
uniform vec3 camera_up;

// Variable uniforms
uniform vec3 light_position;
uniform float atmosphere_dimming;
uniform int binary_search_depth;
uniform float terrain_scale;
uniform int max_steps;
uniform float max_distance;
uniform float max_step;


float sea_level = 20.0;

float snow_level = 50.0;

in VS_OUT {
	vec2 texcoord;
} fs_in;

out vec4 frag_color;


// --------------------------------------------------------------
// ------------------------ START NOISE -------------------------
// --------------------------------------------------------------

float hash2(vec2 p) {
    // floor not strictly needed if you only pass integer coords,
    // but it doesn't hurt
    p = floor(p);
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

// Smooth interpolation curve (Hermite)
float smoothstep01(float x) {
    return x * x * (3.0 - 2.0 * x);
}

// 2D value noise
float value_noise(vec2 p) {
    vec2 i = floor(p);      // integer grid cell
    vec2 f = fract(p);      // fractional part inside the cell

    // Random values at the corners of the cell
    float v00 = hash2(i + vec2(0.0, 0.0));
    float v10 = hash2(i + vec2(1.0, 0.0));
    float v01 = hash2(i + vec2(0.0, 1.0));
    float v11 = hash2(i + vec2(1.0, 1.0));

    // Smooth interpolation weights
    vec2 u = vec2(smoothstep01(f.x), smoothstep01(f.y));

    // Bilinear interpolation
    float nx0 = mix(v00, v10, u.x);
    float nx1 = mix(v01, v11, u.x);
    float n   = mix(nx0, nx1, u.y);

    return n; // in [0,1]
}

float fbm(vec2 pos, int levels) {
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.0;

	mat2 rotation_matrix = mat2(
		4.0/5.0, 3.0/5.0,
		-3.0/5.0, 4.0/5.0
	);
	mat2 current_matrix = mat2(
		1.0, 0.0,
		0.0, 1.0
	);

    // tweak octaves count later, start with 5
    for (int i = 0; i < octaves; ++i) {
        sum += value_noise(pos * freq * current_matrix) * amp;
        freq *= 2.0;   
        amp *= 0.5;    
		current_matrix *= rotation_matrix;
    }


    const float norm = 1.0 / (1.0 + 0.5 + 0.25 + 0.125 + 0.0625); 
    return sum * norm; 
}





// --------------------------------------------------------------
// ------------------------- END NOISE --------------------------
// --------------------------------------------------------------

// --------------------------------------------------------------
// --------------------- START ATMOSPHERE -----------------------
// --------------------------------------------------------------


vec3 atmosphere_mixer(float t) {
	vec3 lambda = exp(-atmosphere_dimming * t * vec3(1.0, 2.0, 4.0)); 
	
	return lambda;
}


vec3 sky(vec3 light_position, vec3 ray_origin_world, vec3 ray_direction_world) {
	// Sky color
	vec3 sky_color = vec3(0.5, 0.7, 1.0);
	sky_color -= ray_direction_world.y * 0.4; 

	// -- Show Light Source Location
	vec3 light_to_camera = normalize(light_position - ray_origin_world);
	float alignment = dot(ray_direction_world, light_to_camera);
	float sun_threshold = 0.98;
	float sun_mask = smoothstep(sun_threshold, 1.0, alignment);
	vec3 sun_color = vec3(1.0, 0.95, 0.7);
	sky_color = mix(sky_color, sun_color, sun_mask);


	return sky_color;

}


vec3 sky_clouds( in vec3 ray_origin, in vec3 ray_direction)
{
    // background sky     
    //vec3 col = vec3(0.45,0.6,0.85)/0.85 - rd.y*vec3(0.4,0.36,0.4);
    //vec3 col = vec3(0.4,0.6,1.1) - rd.y*0.4;
    vec3 sky_color = vec3(0.42,0.62,1.1) - ray_direction.y*0.4;

    // clouds
    float t = (2500.0-ray_origin.y)/ray_direction.y;
    if( t>0.0 )
    {
        vec2 position_xz = (ray_origin+t*ray_direction).xz;
        float cl = fbm( position_xz * 0.00104, 1 );
        float dl = smoothstep(0.25,0.6,cl);
        sky_color = mix( sky_color, vec3(1.0), 0.50*dl );
    }
    
	// sun glare    
    //float sun = clamp( dot(kSunDir,rd), 0.0, 1.0 );
    //col += 0.2*vec3(1.0,0.6,0.3)*pow( sun, 32.0 );
    
	return sky_color;
}


// --------------------------------------------------------------
// ---------------------- END ATMOSHPERE ------------------------
// --------------------------------------------------------------



// --------------------------------------------------------------
// ----------------------- START TERRAIN ------------------------
// --------------------------------------------------------------

/*
float base_height(vec2 plane) {
	const float scale = 1.0 / 2000.0;;
	float e = fbm_low(plane * scale);
	e = e * 600.0 + 600.0;
	return e;
}

float detail_height(vec2 plane) {
	const scale = 0.02;
	float d = fbm_high(plane * scale);
	return return d * 3.0;
}
*/

// Terrain with level of detail depending on distance t from camera
float terrain_height_lod(vec2 plane, float t) {
	float scale = terrain_scale;

	const float NEAR_LOD = 30.0;
	const float FAR_LOD = 300.0;


	float lod = clamp((t - NEAR_LOD) / (FAR_LOD - NEAR_LOD), 0.0, 1.0);
	float min_octaves = 8.0;
	float max_octaves = float(octaves);
	int levels = int(mix(min_octaves, max_octaves, 1.0 - lod));
	

	float height = fbm(plane * scale, levels); // [0,1]
	height = height * 2.0 - 1.0;               // [-1,1]
	
	float amplitude = 80.0;
	height = height * amplitude + 50.0;


	return height;
}

float terrain_height(vec2 plane) {
    // controls "zoom" of the terrain
    //const float TERRAIN_DOMAIN_SCALE = 0.008;

    float n = fbm(plane * terrain_scale, octaves); // [0,1]
    n = n * 2.0 - 1.0;            // [-1,1]

    float amplitude = 80.0;
    float h = n * amplitude + 50.0;

    // optional: 'sea level'
    //float sea_level = -30.0;
    //h = max(h, sea_level);

    return h;
}

vec3 terrain_normal(vec3 world_position, float t) {
	// Steps in world position to get the surrounding terrain
	float epsilon = 0.03;

	vec2 plane = world_position.xz;

	float h_right    = terrain_height_lod(plane + vec2( epsilon, 0.0), t);
	float h_left     = terrain_height_lod(plane + vec2(-epsilon, 0.0), t);
	float h_forward  = terrain_height_lod(plane + vec2(0.0, epsilon), t);
	float h_backward = terrain_height_lod(plane + vec2(0.0, -epsilon), t);

	vec3 normal = vec3(
		h_left - h_right,
		2.0 * epsilon,
		h_backward - h_forward
	);

	return normalize(normal);
}




float terrain_diffuse(vec3 light_direction, vec3 normals) {
	float NdotL = dot(normals, light_direction);
	return max(NdotL, 0.0);
}

float terrain_shadow(vec3 ray_origin, vec3 light_direction, float max_dist) {

	const int MAX_STEPS = 64;
	float MAX_DISTANCE = max_dist;

	float t = 0.0;
	float dt = MAX_DISTANCE / float(MAX_STEPS);

   for (int i = 0; i < MAX_STEPS; ++i) {

        vec3 position = ray_origin + light_direction * t;
        //float h = terrain_height_lod(position.xz, t);
		float h = terrain_height_lod(position.xz, t);
		if (position.y < h) {
            return 0.0;
        }

		t += dt;
        if (t >= max_dist)
            break;
    }

	return 1.0;
}

bool terrain_raymarch(
	vec3 ray_origin,
	vec3 ray_direction,
	out float t_hit)
{
	int MAX_STEPS = max_steps;
	float MAX_DISTANCE = max_distance;
	//const float STEP_DISTANCE = MAX_DISTANCE / float(MAX_STEPS);
	const float MIN_STEP = 0.025;
	float MAX_STEP = max_step;

	float t = 0.0;
	float prev_t = 0.0;
	float prev_dis = 0.0;
	bool has_prev = false;


	for(int i = 0; i < MAX_STEPS; ++i) {

		vec3 position      = ray_origin + t * ray_direction;
		float terrain_h    = terrain_height_lod(position.xz, t);
		float height_delta = position.y - terrain_h;

		if (height_delta < 0.0) {
			if (!has_prev) {
				t_hit = t;
				return true;
			}

			// Locally refine height value to prevent wobble
			float t_min = prev_t;
			float t_max = t;

			// Binary search using X iterations
			for (int j = 0; j < binary_search_depth; ++j) {
				float t_mid = 0.5 * (t_min + t_max);
				vec3 mid_pos = ray_origin + t_mid * ray_direction;
				float mid_height = terrain_height_lod(mid_pos.xz, t_mid);
				float mid_delta = mid_pos.y - mid_height;

				if (mid_delta > 0.0) 
					t_min = t_mid;
				else
					t_max = t_mid;
			}

			t_hit = 0.5 * (t_min + t_max);
			return true;
		}	

		has_prev = true;
		prev_t = t;

		float ray_dir_y = abs(ray_direction.y);
		float step_ray = height_delta / max(ray_dir_y, 0.002);

		float far_factor = smoothstep(100.0, 2000.0, t); // 0 near, 1 far
		float scale = mix(0.2, 0.8, far_factor);
		float dt_raw = step_ray * scale;

		float dt = clamp(dt_raw, MIN_STEP, MAX_STEP);

		t += dt;
		if (t > MAX_DISTANCE) 
			break;
	}
	t = t_hit;
	return false;
}

// --------------------------------------------------------------
// ------------------------ END TERRAIN -------------------------
// --------------------------------------------------------------


void main() {
	float x = fs_in.texcoord.x * 2.0 - 1.0;
	float y = fs_in.texcoord.y * 2.0 - 1.0;


	vec3 ray_origin_world = camera_position;

	vec3 ray_direction_camera = normalize(vec3(x, y, 1.0));
	vec3 ray_direction_world = 
		normalize(ray_direction_camera.x * camera_right
	            + ray_direction_camera.y * camera_up
	            + ray_direction_camera.z * camera_front);

    float t_hit = 0.0;

	vec3 color;

	bool ray_hit = terrain_raymarch(ray_origin_world, ray_direction_world, t_hit);
	vec3 hit_point = ray_origin_world + ray_direction_world * t_hit;
	
	if (ray_hit) {
		float distance_to_hit = length(ray_origin_world - hit_point);
		vec3 normal = terrain_normal(hit_point, distance_to_hit);
		float light_distance = length(light_position - hit_point);
		vec3 light_direction = normalize(light_position - hit_point);
		vec3 origin_shadow = hit_point + normal * 0.1;
		//vec3 origin_shadow = hit_point + vec3(0.0, 0.3, 0.0);


		// lighting
		float ambient = 0.2;
		float diffuse = terrain_diffuse(light_direction, normal);
		float shadow  = terrain_shadow(origin_shadow, light_direction, light_distance);
		float light_term = ambient + diffuse * shadow;

		vec3 water_color = vec3(0.0, 0.3, 0.7);
		vec3 rock_color  = vec3(0.5, 0.3, 0.2);
		vec3 atmosphere_color = vec3(0.8);
		vec3 snow_color = vec3(1.0);
		
		vec3 rockvid_color = vec3(228.0/255.0, 172.0/255.0, 155.0/255.0);
		vec3 base_color = rockvid_color;
		vec3 grass_color = vec3(0.51, 0.51, 0.05);
		float lambda_point = smoothstep(snow_level*1.05, sea_level, hit_point.y);
		float lambda_normal = smoothstep(0.6, 0.7, normal.y);
		base_color = mix(rockvid_color, grass_color, lambda_point*lambda_normal);
		float snow_factor = smoothstep(snow_level*0.95, 70.0, hit_point.y);
		base_color = mix(base_color, snow_color, snow_factor);



		// Mix between grass and rock color
		color = (hit_point.y > sea_level) ? base_color : water_color;
		//color = base_color;
		color *= light_term;
		color = mix(atmosphere_color, color, atmosphere_mixer(distance_to_hit));
	} else {
		//color = sky(light_position, ray_origin_world, ray_direction_world);
		color = sky_clouds(ray_origin_world, ray_direction_world);
		
	}
	
	//float h = terrain_height(hit_point.xz);
	//vec3 debug_color = vec3(h * 0.03 + 0.5); // simple mapping
	//color = debug_color;

	frag_color = vec4(color, 1.0);
}
