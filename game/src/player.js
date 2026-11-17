// player.js — Lena "Vex" Marlowe on foot and behind the wheel.
// On foot: run, punch, shoot (aim with mouse), enter cars (E).
// Driving: arcade handling tuned per vehicle spec, handbrake slides,
// collisions with buildings/traffic/peds, ramming, spike-strip blowouts.
import THREE from './three-shim.js';
import { makeVehicleMesh, VEHICLE_TYPES } from './vehicles.js';
import { GameState, raiseWanted } from './state.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xd81a5a, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.34), jacket);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 }));
  head.position.y = 1.74; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
  hair.position.y = 1.78; g.add(hair);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1a2438, roughness: 1 });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), legMat); l1.position.set(-0.15, 0.31, 0); g.add(l1);
  const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), legMat); l2.position.set(0.15, 0.31, 0); g.add(l2);
  // pistol in hand when armed
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 }));
  gun.position.set(0.36, 1.05, 0.25); gun.visible = false; g.add(gun);
  g.userData.legs = [l1, l2]; g.userData.gun = gun;
  return g;
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = makePlayerMesh();
    this.mesh.position.set(-180, 0, -230);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = 0;
    this.speed = 0;          // on-foot speed
    this.inCar = false;
    this.car = null;         // {mesh, type, spec, speed, steering}
    this.carSpeed = 0;
    this.walkPhase = 0;
    this.shootCooldown = 0;
    this.tireBlown = 0;      // seconds of blown-tire handling after spikes
    this.aimYaw = 0;
  }
  get position() { return this.pos; }
  get forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  enterCar(car) {
    this.inCar = true;
    this.car = car;
    this.carSpeed = 0;
    this.tireBlown = 0;
    this.mesh.visible = false;
    this.heading = car.mesh.rotation.y;
  }
  exitCar() {
    if (!this.car) return;
    const m = this.car.mesh;
    this.pos.set(m.position.x + Math.sin(m.rotation.y + Math.PI / 2) * 2.5, 0, m.position.z + Math.cos(m.rotation.y + Math.PI / 2) * 2.5);
    this.heading = m.rotation.y;
    this.mesh.visible = true;
    this.inCar = false;
    this.car = null;
  }
  // Steal a parked/traffic car: returns the car object, or null
  stealCar(cars, maxDist = 5) {
    let best = null, bd = maxDist;
    for (const c of cars) {
      const d = Math.hypot(c.mesh.position.x - this.pos.x, c.mesh.position.z - this.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  update(dt, input, colliders, onCollide) {
    this.shootCooldown -= dt;
    if (this.inCar) this.updateDriving(dt, input, colliders, onCollide);
    else this.updateOnFoot(dt, input, colliders);
  }
  updateOnFoot(dt, input, colliders) {
    const run = input.shift ? 7.5 : 4;
    let mx = 0, mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    // Camera-relative movement: forward = away from camera
    const camYaw = input.camYaw || 0;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
    const len = Math.hypot(dx, dz);
    if (len > 0.01) {
      const nx = dx / len, nz = dz / len;
      this.pos.x += nx * run * dt;
      this.pos.z += nz * run * dt;
      this.heading = Math.atan2(nx, nz);
      this.walkPhase += dt * (run * 1.6);
      this.speed = run;
    } else this.speed = 0;
    this.mesh.rotation.y = this.heading;
    const s = Math.sin(this.walkPhase);
    this.mesh.userData.legs[0].rotation.x = s * 0.7;
    this.mesh.userData.legs[1].rotation.x = -s * 0.7;
    this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06;
    this.resolveCollisions(colliders);
    this.clampCity();
  }
  updateDriving(dt, input, colliders, onCollide) {
    const car = this.car;
    const spec = car.spec;
    const grip = this.tireBlown > 0 ? spec.grip * 0.45 : spec.grip;
    this.tireBlown = Math.max(0, this.tireBlown - dt);
    // throttle / brake / reverse
    if (input.forward) this.carSpeed += spec.accel * dt;
    else if (input.back) this.carSpeed -= (this.carSpeed > 0.5 ? spec.accel * 1.4 : spec.accel * 0.6) * dt;
    else this.carSpeed -= Math.sign(this.carSpeed) * Math.min(Math.abs(this.carSpeed), 6 * dt);
    if (input.handbrake) this.carSpeed -= Math.sign(this.carSpeed) * Math.min(Math.abs(this.carSpeed), 22 * dt);
    this.carSpeed = THREE.MathUtils.clamp(this.carSpeed, -12, spec.top);
    // steering: sharper at low speed, looser at high speed; handbrake slides
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerFactor = THREE.MathUtils.clamp(Math.abs(this.carSpeed) / 12, 0.25, 1);
    const steer = steerInput * 1.9 * steerFactor * (input.handbrake ? 1.7 : 1);
    if (Math.abs(this.carSpeed) > 0.1) {
      car.mesh.rotation.y += steer * dt * Math.sign(this.carSpeed) * (input.handbrake ? 1.4 : 1);
    }
    this.heading = car.mesh.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const old = car.mesh.position.clone();
    car.mesh.position.addScaledVector(fwd, this.carSpeed * dt);
    this.pos.copy(car.mesh.position);
    // wheel spin + body lean
    for (const w of car.mesh.userData.wheels) w.rotation.x += this.carSpeed * dt * 2;
    car.mesh.rotation.z = THREE.MathUtils.lerp(car.mesh.rotation.z, -steerInput * 0.03 * Math.min(1, Math.abs(this.carSpeed) / 20), dt * 6);
    // collisions
    const hit = this.resolveCarCollisions(colliders, old, onCollide);
    if (hit) this.carSpeed *= 0.35;
    this.clampCity();
    // keep the car mesh on the ground
    car.mesh.position.y = 0;
  }
  resolveCollisions(colliders) {
    for (const c of colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      if (Math.abs(dx) < c.hx && Math.abs(dz) < c.hz) {
        const px = c.hx - Math.abs(dx), pz = c.hz - Math.abs(dz);
        if (px < pz) this.pos.x += Math.sign(dx || 1) * px;
        else this.pos.z += Math.sign(dz || 1) * pz;
      }
    }
  }
  resolveCarCollisions(colliders, old, onCollide) {
    let hit = false;
    const p = this.car.mesh.position;
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      if (Math.abs(dx) < c.hx + 1.2 && Math.abs(dz) < c.hz + 1.2) {
        p.copy(old);
        hit = true;
        if (onCollide) onCollide(Math.abs(this.carSpeed));
      }
    }
    return hit;
  }
  clampCity() {
    const L = 300;
    if (this.inCar) {
      this.car.mesh.position.x = THREE.MathUtils.clamp(this.car.mesh.position.x, -L, L);
      this.car.mesh.position.z = THREE.MathUtils.clamp(this.car.mesh.position.z, -L, L);
      this.pos.copy(this.car.mesh.position);
    } else {
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -L, L);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -L, L);
    }
  }
  shoot(origin, dir) {
    if (this.shootCooldown > 0) return false;
    if (GameState.weapon === 2) {
      if (GameState.ammo <= 0) return false;
      GameState.ammo--;
    }
    this.shootCooldown = 0.28;
    return true;
  }
}
