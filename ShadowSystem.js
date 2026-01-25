import * as THREE from 'three';

export class ShadowSystem {
  constructor(scene) {
    this.scene = scene;
    this.casters = [];
    this.shadowMeshes = [];
    this.debugMode = true;
    this.shadowOpacity = 0.7;
    this.lightHeight = 1.8;
    
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: this.shadowOpacity,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }
  
  addCaster(casterData) {
    const caster = {
      position: casterData.position,
      size: casterData.size,
      height: casterData.height,
      groundDistance: casterData.groundDistance,
      shadowMesh: null,
      debugLines: null
    };
    
    // Create shadow mesh
    const shadowGeometry = new THREE.BufferGeometry();
    caster.shadowMesh = new THREE.Mesh(shadowGeometry, this.shadowMaterial);
    // Removed rotation: we now define geometry directly in world-space XZ coordinates
    caster.shadowMesh.position.y = 0.002;
    this.scene.add(caster.shadowMesh);
    
    // Create debug lines
    if (this.debugMode) {
      const debugMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff0000,
        opacity: 0.5,
        transparent: true
      });
      const debugGeometry = new THREE.BufferGeometry();
      caster.debugLines = new THREE.LineSegments(debugGeometry, debugMaterial);
      this.scene.add(caster.debugLines);
    }
    
    this.casters.push(caster);
    this.shadowMeshes.push(caster.shadowMesh);
  }
  
  clearCasters() {
    this.casters.forEach(caster => {
      this.scene.remove(caster.shadowMesh);
      if (caster.debugLines) this.scene.remove(caster.debugLines);
    });
    this.casters = [];
    this.shadowMeshes = [];
  }
  
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.casters.forEach(caster => {
      if (caster.debugLines) {
        caster.debugLines.visible = enabled;
      }
    });
  }
  
  setShadowOpacity(opacity) {
    this.shadowOpacity = opacity;
    this.shadowMaterial.opacity = opacity;
  }
  
  setLightHeight(height) {
    this.lightHeight = height;
  }
  
  update(lightPosition) {
    const lightPos = new THREE.Vector3(
      lightPosition.x,
      lightPosition.y + this.lightHeight,
      lightPosition.z
    );
    
    this.casters.forEach(caster => {
      const objPos = caster.position;
      const groundDist = typeof caster.groundDistance === 'function' 
        ? caster.groundDistance() 
        : 0;
      
      const hw = caster.size.x / 2;
      const hd = caster.size.y / 2;
      const h = caster.height;
      
      // All 8 corners of the box (bottom and top)
      const corners = [
        new THREE.Vector3(objPos.x - hw, groundDist, objPos.z - hd),
        new THREE.Vector3(objPos.x + hw, groundDist, objPos.z - hd),
        new THREE.Vector3(objPos.x + hw, groundDist, objPos.z + hd),
        new THREE.Vector3(objPos.x - hw, groundDist, objPos.z + hd),
        new THREE.Vector3(objPos.x - hw, groundDist + h, objPos.z - hd),
        new THREE.Vector3(objPos.x + hw, groundDist + h, objPos.z - hd),
        new THREE.Vector3(objPos.x + hw, groundDist + h, objPos.z + hd),
        new THREE.Vector3(objPos.x - hw, groundDist + h, objPos.z + hd)
      ];

      // Project all 8 vertices to the ground plane
      const projected = corners.map(c => this.projectPointToGround(c, lightPos));
      
      // The shadow footprint is the convex hull of these projected points
      const hull = this.getConvexHull(projected);
      
      this.updateShadowGeometry(caster.shadowMesh, hull);
      
      if (this.debugMode && caster.debugLines) {
        // For debugging, identify which corners define the hull and draw rays
        const debugRays = [];
        hull.forEach(hp => {
          const idx = projected.findIndex(p => p.distanceToSquared(hp) < 0.0001);
          if (idx !== -1) {
            debugRays.push({ src: corners[idx], dst: projected[idx] });
          }
        });
        this.updateDebugLines(caster.debugLines, debugRays, lightPos);
      }
    });
  }

  getConvexHull(points) {
    if (points.length <= 2) return points;
    const pts = points.slice().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
    
    const cross = (a, b, o) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower = [];
    for (let p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      let p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }
  
  projectPointToGround(point, lightPos) {
    // Ray from light through point to ground (y=0)
    const direction = new THREE.Vector3().subVectors(point, lightPos);
    
    // If point is at or above light, shadow goes to infinity (clamp it)
    if (point.y >= lightPos.y - 0.01) {
      // Project far away in the direction
      const farPoint = lightPos.clone().add(direction.normalize().multiplyScalar(100));
      return new THREE.Vector2(farPoint.x, farPoint.z);
    }
    
    // t = how far along the ray to reach y=0
    const t = -lightPos.y / direction.y;
    
    const shadowPoint = new THREE.Vector3(
      lightPos.x + direction.x * t,
      0,
      lightPos.z + direction.z * t
    );
    
    return new THREE.Vector2(shadowPoint.x, shadowPoint.z);
  }
  
  updateShadowGeometry(mesh, v) {
    if (v.length < 3) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    // Convert polygon to triangle fan
    const positions = [];
    for (let i = 1; i < v.length - 1; i++) {
      positions.push(v[0].x, 0, v[0].y);
      positions.push(v[i].x, 0, v[i].y);
      positions.push(v[i+1].x, 0, v[i+1].y);
    }
    
    mesh.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }
  
  updateDebugLines(lineSegments, rays, lightPos) {
    const positions = [];
    
    rays.forEach(ray => {
      // Ray from light to caster point
      positions.push(lightPos.x, lightPos.y, lightPos.z);
      positions.push(ray.src.x, ray.src.y, ray.src.z);
      
      // Ray from caster point to ground
      positions.push(ray.src.x, ray.src.y, ray.src.z);
      positions.push(ray.dst.x, 0, ray.dst.y);
    });
    
    lineSegments.geometry.setAttribute(
      'position', 
      new THREE.BufferAttribute(new Float32Array(positions), 3)
    );
  }
}