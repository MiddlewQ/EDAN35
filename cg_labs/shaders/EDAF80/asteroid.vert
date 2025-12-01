#version 410

layout (location = 0) in vec3 vertex;
layout (location = 1) in vec3 normal;
layout (location = 2) in vec2 texcoord;
layout (location = 3) in vec3 tangent;
layout (location = 4) in vec3 binormal;

uniform mat4 vertex_model_to_world;
uniform mat4 normal_model_to_world;
uniform mat4 vertex_world_to_clip;

uniform vec3 noise_params;
uniform vec3 squash_scale;

out VS_OUT {
    vec3 world;
    vec3 normals;
    vec2 uv;
} vs_out;

// --- tiny value-noise + fbm ---
float hash31(vec3 p){
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float valueNoise(vec3 p){
    vec3 i = floor(p);
    vec3 f = fract(p);
    float n000 = hash31(i + vec3(0,0,0));
    float n100 = hash31(i + vec3(1,0,0));
    float n010 = hash31(i + vec3(0,1,0));
    float n110 = hash31(i + vec3(1,1,0));
    float n001 = hash31(i + vec3(0,0,1));
    float n101 = hash31(i + vec3(1,0,1));
    float n011 = hash31(i + vec3(0,1,1));
    float n111 = hash31(i + vec3(1,1,1));
    vec3 u = f*f*(3.0-2.0*f); // smoothstep
    float x00 = mix(n000,n100,u.x);
    float x10 = mix(n010,n110,u.x);
    float x01 = mix(n001,n101,u.x);
    float x11 = mix(n011,n111,u.x);
    float y0 = mix(x00,x10,u.y);
    float y1 = mix(x01,x11,u.y);
    return mix(y0,y1,u.z);
}
float fbm(vec3 p){
    float a=0.5, s=0.0;
    for(int i=0;i<4;i++){
        s += a * valueNoise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return s;
}
// displacement field (centered to [-1,1])
float disp_at(vec3 p, float freq, float seed){
    return (fbm(p*freq + seed) * 2.0 - 1.0);
}

void main(){
    float amp  = noise_params.x;
    float freq = noise_params.y;
    float seed = noise_params.z;

    // BTN
    vec3 B = normalize(binormal);
    vec3 T = normalize(tangent);
    vec3 N = normalize(normal);

    // optional ellipsoid feel BEFORE displacement
    vec3 v0 = vertex * squash_scale;

    // sample displacement along normal
    float d0 = disp_at(v0, freq, seed);
    vec3 displaced = v0 + N * (d0 * amp);

    // estimate displaced normal via finite differences along T/B
    float eps = 0.01;
    float dT = disp_at(v0 + T*eps, freq, seed);
    float dB = disp_at(v0 + B*eps, freq, seed);
    vec3 pT = (v0 + T*eps) + N * (dT * amp);
    vec3 pB = (v0 + B*eps) + N * (dB * amp);
    vec3 n_disp = normalize(cross(pT - displaced, pB - displaced));

    // to world
    vec4 wp = vertex_model_to_world * vec4(displaced, 1.0);
    vs_out.world = wp.xyz;
    vs_out.normals = normalize(mat3(normal_model_to_world) * n_disp);
    vs_out.uv = texcoord;

    gl_Position = vertex_world_to_clip * wp;
}
