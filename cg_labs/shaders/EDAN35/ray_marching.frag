#version 410

// Terrain Uniforms
uniform int octaves;

// Camera Uniforms
uniform vec3 camera_position;
uniform vec3 camera_front;
uniform vec3 camera_right;
uniform vec3 camera_up;

// Atmosphere uniforms
uniform vec3 light_position;
uniform float atmosphere_dimming;



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

float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.0;

    // tweak octaves count later, start with 5
    for (int i = 0; i < octaves; ++i) {
        sum += value_noise(p * freq) * amp;
        freq *= 2.0;   // higher frequency each octave
        amp *= 0.5;    // lower amplitude each octave
    }

    // sum is in [0, something]; we can roughly normalize by total amp
    float norm = 1.0 / (1.0 + 0.5 + 0.25 + 0.125 + 0.0625); // ~1.94
    return sum * norm; // ~[0,1]
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


// --------------------------------------------------------------
// ---------------------- END ATMOSHPERE ------------------------
// --------------------------------------------------------------



// --------------------------------------------------------------
// ----------------------- START TERRAIN ------------------------
// --------------------------------------------------------------

float terrain_height(vec2 plane) {
    // controls "zoom" of the terrain
    float scale = 0.04;

    float n = fbm(plane * scale); // [0,1]
    n = n * 2.0 - 1.0;            // [-1,1]

    float amplitude = 25.0;
    float h = n * amplitude;

    // optional: 'sea level'
    float sea_level = -5.0;
    h = max(h, sea_level);

    return h;
}

vec3 terrain_normal(vec3 world_position) {
	// Steps in world position to get the surrounding terrain
	float epsilon = 0.1;

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




float terrain_diffuse(vec3 light_direction, vec3 normals) {
	float NdotL = dot(normals, light_direction);
	return max(NdotL, 0.0);
}

float terrain_shadow(vec3 ray_origin, vec3 light_direction, float max_dist) {

	const int MAX_STEPS = 64;
	float T_MAX = max_dist;

	float t = 0.0;
	float dt = T_MAX / float(MAX_STEPS);

   for (int i = 0; i < MAX_STEPS; ++i) {
        t += dt;
        if (t >= max_dist)
            break;

        vec3 position = ray_origin + light_direction * t;
        float h = terrain_height(position.xz);

        if (position.y < h) {
            return 0.0;
        }
    }

	return 1.0;
}

bool terrain_raymarch(vec3 ray_origin, vec3 ray_direction, out float t_hit)
{
	const int MAX_STEPS = 400;

	float t_min = 0.00;
	float t_max = 300.0;

	float t = t_min;
	float dt = 0.3;

	float lh = 0.0;
	float ly = 0.0;


	for(int i = 0; i < MAX_STEPS; ++i) {
		vec3 position = ray_origin + t * ray_direction;
		float h = terrain_height(position.xz);
		float dis = position.y - h;

		if(dis < 0.0) {
				
			float D0 = ly - lh;				// previous ray_y - terrain
            float D1 = dis;					// current  ray_y - terrain
            float alpha = D0 / (D0 - D1);

            t_hit = (t - dt) + alpha * dt;
			return true;
		}

		lh = h;
		ly = position.y;

		float a = 1.0 - smoothstep( 0.12, 0.13, abs(h+0.12) ); // flag high-slope areas (-0.25, 0.0)
		//dt = dis * 0.8 * (1.0 - 0.75 * a);
		t += dt;
		if (t > t_max) {
			break;
		}
	}

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
    bool ray_hit = terrain_raymarch(ray_origin_world, ray_direction_world, t_hit);
	vec3 hit_point = ray_origin_world + ray_direction_world * t_hit;


	vec3 color;
	

	float distance_to_hit = length(ray_origin_world - hit_point);
	if (ray_hit) {

		vec3 normal = terrain_normal(hit_point);
		float light_distance = length(light_position - hit_point);
		vec3 light_direction = normalize(light_position - hit_point);
		vec3 origin_shadow = hit_point + normal * 0.1;

		// lighting
		float ambient = 0.0;
		float diffuse = terrain_diffuse(light_direction, normal);
		float shadow  = terrain_shadow(origin_shadow, light_direction, light_distance);
		float light_term = ambient + diffuse * shadow;

		vec3 water_color = vec3(0.0, 0.3, 0.7);
		vec3 rock_color  = vec3(0.5, 0.3, 0.2);
		
		vec3 rockvid_color = vec3(228.0/255.0, 172.0/255.0, 155.0/255.0);
		vec3 grass_color = vec3(0.51, 0.51, 0.05);
		float lambda = smoothstep(0.6, 0.7, normal.y);
		vec3 base_color = mix(rockvid_color, grass_color, lambda);
		

		// Mix between grass and rock color
	    color = (hit_point.y > -4.999) ? base_color : water_color;
		color *= light_term;
	} else {
		// Sky color
		vec3 sky_color = vec3(0.5, 0.7, 1.0);

		// -- Show Light Source Location
		vec3 light_to_camera = normalize(light_position - ray_origin_world);
		float alignment = dot(ray_direction_world, light_to_camera);
		float sun_threshold = 0.98;
		float sun_mask = smoothstep(sun_threshold, 1.0, alignment);
		vec3 sun_color = vec3(1.0, 0.95, 0.7);

		color = mix(sky_color, sun_color, sun_mask);
	}

	vec3 atmosphere_color = vec3(0.8);
	color = mix(atmosphere_color, color, atmosphere_mixer(distance_to_hit));


	frag_color = vec4(color, 1.0);
}
