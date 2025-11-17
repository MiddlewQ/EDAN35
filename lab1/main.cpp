/*
 *  main.cpp
 *  swTracer
 *
 *  Created by Michael Doggett on 2021-09-23.
 *  Copyright (c) 2021 Michael Doggett
 */
#define _USE_MATH_DEFINES
#include <cfloat>
#include <cmath>
#include <ctime>
#include <iostream>
#include <random>

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#include "swCamera.h"
#include "swIntersection.h"
#include "swMaterial.h"
#include "swRay.h"
#include "swScene.h"
#include "swSphere.h"
#include "swVec3.h"

using namespace sw;

inline float clamp(float x, float min, float max) {
    if (x < min) return min;
    if (x > max) return max;
    return x;
}

float uniform() {
    // Will be used to obtain a seed for the random number engine
    static std::random_device rd;
    // Standard mersenne_twister_engine seeded with rd()
    static std::mt19937 gen(rd());
    static std::uniform_real_distribution<float> dis(0.0f, 1.0f);
    return dis(gen);
}

void writeColor(int index, Vec3 p, uint8_t *pixels) {
    // gamma correct for gamma=2.2, x^(1/gamma), more see :
    // https://www.geeks3d.com/20101001/tutorial-gamma-correction-a-story-of-linearity/
    for (int n = 0; n < 3; n++) {
        p.m[n] = pow(p.m[n], 1.0f / 2.2f);
        pixels[index + n] = (uint8_t)(256 * clamp(p.m[n], 0.0f, 0.999f));
    }
}

Color traceRay(const Ray &r, Scene scene, int depth) {
    Color c, directColor, reflectedColor, refractedColor;
    if (depth < 0) return c;
    
    Intersection hit, shadow;
    if (!scene.intersect(r, hit)) return Color(0.0f, 0.0f, 0.0f); // Background color
    

    const Vec3 lightPos(0.0f, 30.0f, -5.0f);
    Vec3 lightDir = lightPos - hit.position;
    lightDir.normalize();
    float ndotL = clamp(hit.normal * lightDir, 0.0f , 1.0f);
    
    Ray shadowRay = hit.getShadowRay(lightPos);
    
    float shadowColor = 0.0f;

    auto reflec = hit.material.reflectivity;
    directColor = ndotL * hit.material.color;
    
    if (depth > 0 && hit.material.reflectivity > 0.0f) {
        const Ray refr = hit.getReflectedRay();
        reflectedColor = reflec * traceRay(refr, scene, depth - 1);
    }
    
    auto trans = hit.material.transparency;
    if (depth > 0 && hit.material.transparency > 0.0f) {
        const Ray refr = hit.getRefractedRay();
        refractedColor = trans * traceRay(refr, scene, depth - 1);
    }
    
    if (scene.intersect(shadowRay, shadow))
        directColor *= shadowColor;
    
    c = (1 - reflec - trans) * directColor + reflectedColor + refractedColor;
    return c;
}

int main() {
    const int imageWidth = 512;
    const int imageHeight = imageWidth;
    const int numChannels = 3;
    uint8_t *pixels = new uint8_t[imageWidth * imageHeight * numChannels];

    // Define materials
    Material whiteDiffuse = Material(Color(0.9f, 0.9f, 0.9f), 0.0f, 0.0f, 1.0f);
    Material greenDiffuse = Material(Color(0.1f, 0.6f, 0.1f), 0.0f, 0.0f, 1.0f);
    Material redDiffuse = Material(Color(1.0f, 0.1f, 0.1f), 0.0f, 0.0f, 1.0f);
    Material blueDiffuse = Material(Color(0.0f, 0.2f, 0.9f), 0.0f, 0.0f, 1.0f);
    Material yellowReflective = Material(Color(1.0f, 0.6f, 0.1f), 0.2f, 0.0f, 1.0f);
    Material transparent = Material(Color(1.0f, 1.0f, 1.0f), 0.2f, 0.8f, 1.3f);

    // Setup scene
    Scene scene;

    // Add three spheres with diffuse material
    scene.push(Sphere(Vec3(-7.0f, 3.0f, -20.0f), 3.0f, greenDiffuse));
    scene.push(Sphere(Vec3(0.0f, 3.0f, -20.0f), 3.0f, blueDiffuse));
    scene.push(Sphere(Vec3(7.0f, 3.0f, -20.0f), 3.0f, redDiffuse));

    // Define vertices for Cornell box
    Vec3 vertices[] = {
      Vec3(-20.0f, 0.0f, 50.0f),  Vec3(20.0f, 0.0f, 50.0f),    Vec3(20.0f, 0.0f, -50.0f),   // Floor 1
      Vec3(-20.0f, 0.0f, 50.0f),  Vec3(20.0f, 0.0f, -50.0f),   Vec3(-20.0f, 0.0f, -50.0f),  // Floor 2
      Vec3(-20.0f, 0.0f, -50.0f), Vec3(20.0f, 0.0f, -50.0f),   Vec3(20.0f, 40.0f, -50.0f),  // Back wall 1
      Vec3(-20.0f, 0.0f, -50.0f), Vec3(20.0f, 40.0f, -50.0f),  Vec3(-20.0f, 40.0f, -50.0f), // Back wall 2
      Vec3(-20.0f, 40.0f, 50.0f), Vec3(-20.0f, 40.0f, -50.0f), Vec3(20.0f, 40.0f, 50.0f),   // Ceiling 1
      Vec3(20.0f, 40.0f, 50.0f),  Vec3(-20.0f, 40.0f, -50.0f), Vec3(20.0f, 40.0f, -50.0f),  // Ceiling 2
      Vec3(-20.0f, 0.0f, 50.0f),  Vec3(-20.0f, 40.0f, -50.0f), Vec3(-20.0f, 40.0f, 50.0f),  // Red wall 1
      Vec3(-20.0f, 0.0f, 50.0f),  Vec3(-20.0f, 0.0f, -50.0f),  Vec3(-20.0f, 40.0f, -50.0f), // Red wall 2
      Vec3(20.0f, 0.0f, 50.0f),   Vec3(20.0f, 40.0f, -50.0f),  Vec3(20.0f, 40.0f, 50.0f),   // Green wall 1
      Vec3(20.0f, 0.0f, 50.0f),   Vec3(20.0f, 0.0f, -50.0f),   Vec3(20.0f, 40.0f, -50.0f)   // Green wall 2
    };

    // TODO: Uncomment to render floor triangles
    scene.push(Triangle(&vertices[0], whiteDiffuse)); // Floor 1
    scene.push(Triangle(&vertices[3], whiteDiffuse)); // Floor 2

    // TODO: Uncomment to render Cornell box
    scene.push(Triangle(&vertices[6], whiteDiffuse));  // Back wall 1
    scene.push(Triangle(&vertices[9], whiteDiffuse));  // Back wall 2
    scene.push(Triangle(&vertices[12], whiteDiffuse)); // Ceiling 1
    scene.push(Triangle(&vertices[15], whiteDiffuse)); // Ceiling 2
    scene.push(Triangle(&vertices[18], redDiffuse));   // Red wall 1
    scene.push(Triangle(&vertices[21], redDiffuse));   // Red wall 2
    scene.push(Triangle(&vertices[24], greenDiffuse)); // Green wall 1
    scene.push(Triangle(&vertices[27], greenDiffuse)); // Green wall 2

    // TODO: Uncomment to render reflective spheres
    scene.push(Sphere(Vec3(7.0f, 3.0f, 0.0f), 3.0f, yellowReflective));
    scene.push(Sphere(Vec3(9.0f, 10.0f, 0.0f), 3.0f, yellowReflective));

    // TODO: Uncomment to render refractive spheres
    scene.push(Sphere(Vec3(-7.0f, 3.0f, 0.0f), 3.0f, transparent));
    scene.push(Sphere(Vec3(-9.0f, 10.0f, 0.0f), 3.0f, transparent));

    // Setup camera
    Vec3 eye(0.0f, 10.0f, 30.0f);
    Vec3 lookAt(0.0f, 10.0f, -5.0f);
    Vec3 up(0.0f, 1.0f, 0.0f);
    Camera camera(eye, lookAt, up, 52.0f, (float)imageWidth / (float)imageHeight);
    camera.setup(imageWidth, imageHeight);

    // Ray trace pixels
    int depth = 3;
    std::cout << "Rendering... ";
    clock_t start = clock();
    int ssm = 3, ssn = 3;
    for (int j = 0; j < imageHeight; ++j) {
        for (int i = 0; i < imageWidth; ++i) {
            float tot_pixel_r = 0.0;
            float tot_pixel_g = 0.0;
            float tot_pixel_b = 0.0;
        
            for (int m = 0; m < ssm; ++m) {
                float lower_bound_row = (m) / ssm;
                float upper_bound_row = (m+1) / ssm;
                for (int n = 0; n < ssn; ++n) {
                    Color pixel;
                    
                    float lower_bound_col = n / ssn;
                    float upper_bound_col = (n+1) / ssn;
                        
                    // Get center of pixel coordinate
                    //float cx = ((float)i) + 0.5f;
                    //float cy = ((float)j) + 0.5f;
                    
                    float u_r = uniform();
                    float u_c = uniform();
                    
                    float u_r_bounded = (1 - u_r)*lower_bound_row + u_r*upper_bound_row;
                    float u_c_bounded = (1 - u_c)*lower_bound_col + u_c*upper_bound_col;
                    
                    float cx = ((float)i) + u_r_bounded;
                    float cy = ((float)j) + u_c_bounded;

                    // Get a ray and trace it
                    Ray r = camera.getRay(cx, cy);
                    pixel = traceRay(r, scene, depth);
                    
                    
                    
                    tot_pixel_r += pixel[0];
                    tot_pixel_g += pixel[1];
                    tot_pixel_b += pixel[2];

                    // Write pixel value to image
                    //writeColor((j * imageWidth + i) * numChannels, pixel, pixels);
                }
            }
            int nr_samples = ssm * ssn;
            float mean_pixel_r = tot_pixel_r / nr_samples;
            float mean_pixel_g = tot_pixel_g / nr_samples;
            float mean_pixel_b = tot_pixel_b / nr_samples;
            
            Color sspixel = Vec3(mean_pixel_r, mean_pixel_g, mean_pixel_b);
            
            writeColor((j * imageWidth + i) * numChannels, sspixel, pixels);
        }
    }

    // Save image to file
    stbi_write_png("out.png", imageWidth, imageHeight, numChannels, pixels, imageWidth * numChannels);

    // Free allocated memory
    delete[] pixels;

    std::cout << "Done\n";
    std::cout << "Time: " << (float)(clock() - start) / CLOCKS_PER_SEC << " s" << std::endl;
}
