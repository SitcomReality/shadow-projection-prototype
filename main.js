import * as THREE from 'three';
import { ShadowSystem } from './ShadowSystem.js';

const canvas = document.getElementById('canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 8, 12);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Ground
const groundGeometry = new THREE.PlaneGeometry(50, 50);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x90ee90 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Grid
const gridHelper = new THREE.GridHelper(50, 50, 0x000000, 0x000000);
gridHelper.material.opacity = 0.1;
gridHelper.material.transparent = true;
scene.add(gridHelper);

// Player (light source)
const playerGeometry = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
const playerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.set(0, 1.2, 0);
scene.add(player);

// Player shadow (simple circle)
const playerShadowGeometry = new THREE.CircleGeometry(0.4, 16);
const playerShadowMaterial = new THREE.MeshBasicMaterial({ 
  color: 0x000000, 
  transparent: true, 
  opacity: 0.5,
  depthWrite: false
});
const playerShadow = new THREE.Mesh(playerShadowGeometry, playerShadowMaterial);
playerShadow.rotation.x = -Math.PI / 2;
playerShadow.position.y = 0.001;
scene.add(playerShadow);

// Shadow system
const shadowSystem = new ShadowSystem(scene);

// Game objects
class GameObject {
  constructor(position, size, height, color) {
    this.position = position.clone();
    this.size = size;
    this.height = height;
    this.groundDistance = 0;
    this.velocity = new THREE.Vector3();
    
    // Visual mesh
    const geometry = new THREE.BoxGeometry(size.x, height, size.z);
    const material = new THREE.MeshBasicMaterial({ 
      color: color,
      wireframe: false
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.mesh.position.y = height / 2;
    scene.add(this.mesh);
    
    // Debug wireframe
    const wireframeGeometry = new THREE.BoxGeometry(size.x, height, size.z);
    const wireframeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x000000,
      wireframe: true,
      opacity: 0.3,
      transparent: true
    });
    this.wireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
    this.wireframe.position.copy(this.mesh.position);
    scene.add(this.wireframe);
  }
  
  update(deltaTime) {
    // Gravity
    if (this.groundDistance > 0) {
      this.velocity.y -= 9.8 * deltaTime;
      this.groundDistance += this.velocity.y * deltaTime;
      
      if (this.groundDistance <= 0) {
        this.groundDistance = 0;
        this.velocity.y = 0;
      }
    }
    
    this.mesh.position.y = this.height / 2 + this.groundDistance;
    this.wireframe.position.copy(this.mesh.position);
  }
  
  jump() {
    this.velocity.y = 5;
    this.groundDistance = 0.01;
  }
  
  destroy() {
    scene.remove(this.mesh);
    scene.remove(this.wireframe);
  }
}

const gameObjects = [];

function createRandomObject() {
  const x = (Math.random() - 0.5) * 20;
  const z = (Math.random() - 0.5) * 20;
  const width = 0.5 + Math.random() * 1.5;
  const depth = 0.5 + Math.random() * 1.5;
  const height = 0.5 + Math.random() * 2;
  const color = new THREE.Color().setHSL(Math.random(), 0.7, 0.6);
  
  const obj = new GameObject(
    new THREE.Vector3(x, 0, z),
    new THREE.Vector2(width, depth),
    height,
    color
  );
  
  gameObjects.push(obj);
  shadowSystem.addCaster({
    position: obj.position,
    size: obj.size,
    height: obj.height,
    groundDistance: () => obj.groundDistance
  });
}

// Initial objects
function resetScene() {
  gameObjects.forEach(obj => obj.destroy());
  gameObjects.length = 0;
  shadowSystem.clearCasters();
  
  // Add variety of objects
  const positions = [
    { pos: new THREE.Vector3(-4, 0, -4), size: new THREE.Vector2(1, 1), height: 0.8, color: 0xff6b6b },
    { pos: new THREE.Vector3(4, 0, -4), size: new THREE.Vector2(1.5, 0.8), height: 1.5, color: 0x4ecdc4 },
    { pos: new THREE.Vector3(-4, 0, 4), size: new THREE.Vector2(0.6, 1.2), height: 2, color: 0xffe66d },
    { pos: new THREE.Vector3(4, 0, 4), size: new THREE.Vector2(1.2, 1.2), height: 0.5, color: 0x95e1d3 },
    { pos: new THREE.Vector3(0, 0, -6), size: new THREE.Vector2(0.8, 0.8), height: 1.2, color: 0xf38181 },
  ];
  
  positions.forEach(({ pos, size, height, color }) => {
    const obj = new GameObject(pos, size, height, color);
    gameObjects.push(obj);
    shadowSystem.addCaster({
      position: obj.position,
      size: obj.size,
      height: obj.height,
      groundDistance: () => obj.groundDistance
    });
  });
}

resetScene();

// Controls
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  
  if (e.key === ' ') {
    e.preventDefault();
    const randomObj = gameObjects[Math.floor(Math.random() * gameObjects.length)];
    if (randomObj) randomObj.jump();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// UI Controls
document.getElementById('showDebug').addEventListener('change', (e) => {
  shadowSystem.setDebugMode(e.target.checked);
  gameObjects.forEach(obj => {
    obj.wireframe.visible = e.target.checked;
  });
});

document.getElementById('shadowOpacity').addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  document.getElementById('opacityValue').textContent = value.toFixed(2);
  shadowSystem.setShadowOpacity(value);
});

document.getElementById('lightHeight').addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  document.getElementById('lightHeightValue').textContent = value.toFixed(1);
  shadowSystem.setLightHeight(value);
});

document.getElementById('addObject').addEventListener('click', createRandomObject);
document.getElementById('resetScene').addEventListener('click', resetScene);

// Animation
let lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);
  
  const deltaTime = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  
  // Move player
  const speed = 5;
  const moveDir = new THREE.Vector3();
  
  if (keys['w']) moveDir.z -= 1;
  if (keys['s']) moveDir.z += 1;
  if (keys['a']) moveDir.x -= 1;
  if (keys['d']) moveDir.x += 1;
  
  if (moveDir.length() > 0) {
    moveDir.normalize();
    player.position.x += moveDir.x * speed * deltaTime;
    player.position.z += moveDir.z * speed * deltaTime;
    
    // Clamp to ground
    player.position.x = Math.max(-20, Math.min(20, player.position.x));
    player.position.z = Math.max(-20, Math.min(20, player.position.z));
    
    playerShadow.position.x = player.position.x;
    playerShadow.position.z = player.position.z;
  }
  
  // Update game objects
  gameObjects.forEach(obj => obj.update(deltaTime));
  
  // Update shadow system
  shadowSystem.update(player.position);
  
  renderer.render(scene, camera);
}

animate(0);

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});