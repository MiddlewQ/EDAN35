//
//  terrain.vert
//  
//
//  Created by Olle Persson on 2025-12-02.
//

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

uniform mat4 vertex_model_to_world;

layout (location = 0) in vec3 vertex;


float f(float x, float z) {
	return sin(x)*sin(z)
}


void main() {
	vec3 new_vertex = vec3(vertex.x ,f(vertex.x, vertex.z), vertex.z);
	gl_Position = camera.view_projection * vertex_model_to_world * vec4(new_vertex, 1.0);
}
