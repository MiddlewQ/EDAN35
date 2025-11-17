#include "swTriangle.h"
#include <iostream>

namespace sw {

bool Triangle::intersect(const Ray &ray, Intersection &isect) const {
    
    const Vec3 v0 = vertices[0];
    const Vec3 v1 = vertices[1];
    const Vec3 v2 = vertices[2];
    
    const Vec3 e1 = v1 - v0;
    const Vec3 e2 = v2 - v0;
    
    auto n = e1 % e2;
    auto m = -n * v0;
    
    const Vec3 P = ray.orig;
    const Vec3 d = ray.dir;
    
    float t = (n * P + m) / (-n * d);
    
    const Vec3 Q = P + t*d;
    
    if (t < ray.minT || t > ray.maxT) return false;
    
    auto R = Q - v0;
    
    auto e1r = e1 % R;
    
    auto re2 = R % e2;
    
    auto v = sqrt(e1r * e1r) / sqrt(n * n);
    
    auto w = sqrt(re2 * re2) / sqrt(n * n);
    
    if ((e1 % R) * n >= 0.0f &&
        (R % e2) * n >= 0.0f &&
        v + w < 1.0f) {
        isect.hitT = t;
        isect.normal = n;
        isect.normal.normalize();
        isect.frontFacing = (-d * isect.normal) > 0.0f;
        if (!isect.frontFacing) isect.normal = -isect.normal;
        isect.position = Q;
        isect.material = material;
        isect.ray = ray;
        return true;
    }
    return !true;
}

} // namespace sw
