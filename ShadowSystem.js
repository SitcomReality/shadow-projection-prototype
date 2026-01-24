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
    
    this.casters.forEach(caster => {
      const objPos = caster.position.clone();
      const groundDist = typeof caster.groundDistance === 'function' 
        ? caster.groundDistance() 
        : 0;
      
      // Get the four corners of the object's footprint
      const halfWidth = caster.size.x / 2;
      const halfDepth = caster.size.y / 2;
      const objectHeight = caster.height + groundDist;
      
      const corners3D = [
        new THREE.Vector3(objPos.x - halfWidth, objectHeight, objPos.z - halfDepth),
        new THREE.Vector3(objPos.x + halfWidth, objectHeight, objPos.z - halfDepth),
        new THREE.Vector3(objPos.x + halfWidth, objectHeight, objPos.z + halfDepth),
        new THREE.Vector3(objPos.x - halfWidth, objectHeight, objPos.z + halfDepth)
      ];
      
      // Project each corner onto the ground plane
      const shadowCorners = corners3D.map(corner => 
        this.projectPointToGround(corner, lightPos)
      );
      
      // Update shadow geometry
      this.updateShadowGeometry(caster.shadowMesh, shadowCorners);
      
      // Update debug lines
      if (this.debugMode && caster.debugLines) {
        this.updateDebugLines(caster.debugLines, corners3D, shadowCorners, lightPos);
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
  
  updateShadowGeometry(mesh, corners) {
    // Create quad from 4 corners
    const positions = new Float32Array([
      corners[0].x, corners[0].y, 0,
      corners[1].x, corners[1].y, 0,
      corners[2].x, corners[2].y, 0,
      
      corners[0].x, corners[0].y, 0,
      corners[2].x, corners[2].y, 0,
      corners[3].x, corners[3].y, 0
    ]);
    
    mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mesh.geometry.computeBoundingSphere();
  }
  
  updateDebugLines(lineSegments, corners3D, shadowCorners, lightPos) {
    const positions = [];
    
    // Lines from light to each corner
    for (let i = 0; i < 4; i++) {
      positions.push(lightPos.x, lightPos.y, lightPos.z);
      positions.push(corners3D[i].x, corners3D[i].y, corners3D[i].z);
      
      // Line from corner to shadow
      positions.push(corners3D[i].x, corners3D[i].y, corners3D[i].z);
      positions.push(shadowCorners[i].x, 0, shadowCorners[i].y);
    }
    
    lineSegments.geometry.setAttribute(
      'position', 
      new THREE.BufferAttribute(new Float32Array(positions), 3)
    );
  }
}