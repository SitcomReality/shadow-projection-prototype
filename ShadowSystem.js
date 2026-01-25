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
    caster.shadowMesh.rotation.x = -Math.PI / 2;
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
    
    const lp2 = new THREE.Vector2(lightPos.x, lightPos.z);
    
    this.casters.forEach(caster => {
      const objPos = caster.position;
      const groundDist = typeof caster.groundDistance === 'function' 
        ? caster.groundDistance() 
        : 0;
      
      const hw = caster.size.x / 2;
      const hd = caster.size.y / 2;
      
      // 4 Footprint corners at current height
      const bCorners = [
        new THREE.Vector3(objPos.x - hw, groundDist, objPos.z - hd),
        new THREE.Vector3(objPos.x + hw, groundDist, objPos.z - hd),
        new THREE.Vector3(objPos.x + hw, groundDist, objPos.z + hd),
        new THREE.Vector3(objPos.x - hw, groundDist, objPos.z + hd)
      ];

      // Identify lateral indices (leftmost and rightmost from light's perspective)
      let leftIdx = 0;
      let rightIdx = 0;
      let farIdx = 0;
      let maxDistSq = -1;

      for (let i = 0; i < 4; i++) {
        let isLeft = true;
        let isRight = true;
        const v1 = new THREE.Vector2(bCorners[i].x - lp2.x, bCorners[i].z - lp2.y);
        
        for (let j = 0; j < 4; j++) {
          if (i === j) continue;
          const v2 = new THREE.Vector2(bCorners[j].x - lp2.x, bCorners[j].z - lp2.y);
          const cross = v1.x * v2.y - v1.y * v2.x; // 2D cross product
          if (cross < 0) isLeft = false;  // Something is to the left
          if (cross > 0) isRight = false; // Something is to the right
        }
        if (isLeft) leftIdx = i;
        if (isRight) rightIdx = i;
        
        const dSq = lp2.distanceToSquared(new THREE.Vector2(bCorners[i].x, bCorners[i].z));
        if (dSq > maxDistSq) {
          maxDistSq = dSq;
          farIdx = i;
        }
      }

      const tHeight = groundDist + caster.height;
      const getT = (idx) => new THREE.Vector3(bCorners[idx].x, tHeight, bCorners[idx].z);

      // Construct a 5-sided shadow polygon:
      // Project the two lateral bottom corners and the three non-near top corners.
      const v0 = this.projectPointToGround(bCorners[leftIdx], lightPos);
      const v1 = this.projectPointToGround(bCorners[rightIdx], lightPos);
      const v2 = this.projectPointToGround(getT(rightIdx), lightPos);
      const v3 = this.projectPointToGround(getT(farIdx), lightPos);
      const v4 = this.projectPointToGround(getT(leftIdx), lightPos);
      
      this.updateShadowGeometry(caster.shadowMesh, [v0, v1, v2, v3, v4]);
      
      if (this.debugMode && caster.debugLines) {
        this.updateDebugLines(caster.debugLines, [
          { src: bCorners[leftIdx], dst: v0 },
          { src: bCorners[rightIdx], dst: v1 },
          { src: getT(rightIdx), dst: v2 },
          { src: getT(farIdx), dst: v3 },
          { src: getT(leftIdx), dst: v4 }
        ], lightPos);
      }
    });
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
    // Create pentagon from 5 points using a triangle fan (3 triangles)
    const positions = new Float32Array([
      v[0].x, v[0].y, 0,  v[1].x, v[1].y, 0,  v[2].x, v[2].y, 0,
      v[0].x, v[0].y, 0,  v[2].x, v[2].y, 0,  v[3].x, v[3].y, 0,
      v[0].x, v[0].y, 0,  v[3].x, v[3].y, 0,  v[4].x, v[4].y, 0
    ]);
    
    mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
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