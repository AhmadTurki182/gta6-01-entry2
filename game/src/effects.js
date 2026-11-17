// effects.js — particles (muzzle flash, skid smoke, explosion, sparks),
// floating damage text helpers, and the mission waypoint beacon.
import THREE from './three-shim.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = []; // {mesh, vel, life, maxLife}
    this.beacon = null;
    this.beaconLight = null;
  }
  burst(pos, color, n = 14, speed = 8, size = 0.35, life = 0.7, gravity = -9) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(pos);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      this.parts.push({
        mesh: m, gravity,
        vel: new THREE.Vector3(Math.cos(a) * Math.cos(e) * speed, Math.sin(e) * speed + 3, Math.sin(a) * Math.cos(e) * speed),
        life, maxLife: life,
      });
    }
  }
  muzzle(pos, dir) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe95e }));
    m.position.copy(pos).addScaledVector(dir, 1);
    this.scene.add(m);
    this.parts.push({ mesh: m, vel: dir.clone().multiplyScalar(2), life: 0.08, maxLife: 0.08, gravity: 0 });
  }
  explosion(pos) {
    this.burst(pos, 0xff7a00, 26, 14, 0.6, 1.0);
    this.burst(pos, 0xffd23f, 18, 10, 0.45, 0.7);
    this.burst(pos, 0x555555, 14, 5, 0.8, 1.4, -1);
    const light = new THREE.PointLight(0xff8a00, 80, 60, 1.5);
    light.position.copy(pos); light.position.y += 2;
    this.scene.add(light);
    this.parts.push({ mesh: light, vel: new THREE.Vector3(), life: 0.4, maxLife: 0.4, gravity: 0, isLight: true });
  }
  setBeacon(pos) {
    this.clearBeacon();
    if (!pos) return;
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    beam.position.y = 30; g.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.3, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; g.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    arrow.rotation.x = Math.PI; arrow.position.y = 12; g.add(arrow);
    g.position.set(pos.x, 0, pos.z);
    this.scene.add(g);
    this.beacon = g;
  }
  clearBeacon() { if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; } }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.mesh); this.parts.splice(i, 1); continue; }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (!p.isLight && p.mesh.material) p.mesh.material.opacity = p.life / p.maxLife;
    }
    if (this.beacon) {
      this.beacon.rotation.y += dt * 1.5;
      const s = 1 + Math.sin(performance.now() * 0.005) * 0.15;
      this.beacon.scale.set(s, 1, s);
    }
  }
}
