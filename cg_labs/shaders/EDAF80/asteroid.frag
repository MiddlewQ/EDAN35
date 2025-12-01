#version 410

in VS_OUT {
    vec3 world;
    vec3 normals;
    vec2 uv;
} fs_in;

uniform vec3 light_position;
uniform vec3 camera_position;

out vec4 fragColor;

void main(){
    vec3 N = normalize(fs_in.normals);
    vec3 L = normalize(light_position - fs_in.world);
    vec3 V = normalize(camera_position - fs_in.world);
    vec3 H = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 32.0);

    vec3 albedo = vec3(0.586, 0.556, 0.520);   // rock-ish
    vec3 color  = albedo * (0.1 + 0.9*diff) + spec*0.15;

    fragColor = vec4(color, 1.0);
}
