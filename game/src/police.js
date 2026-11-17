// police.js — the SMART police AI, the signature system of SOLMAR.
// Tactics scale with wanted level:
//  ★1-2: patrol cars chase from behind, try to ram the player off the road.
//  ★3:   roadblocks form ahead of the player on their road; PIT manoeuvres.
//  ★4:   spike strips across the road ahead; helicopter + searchlight joins.
//  ★5:   flanking: two cars cut across side streets to intercept; roadblocks
//         get wider, spike strips more frequent, heli never leaves.
// Cops also lose the player: if unseen for a while they switch to SEARCH mode,
// sweep the last known area, then give up and the wanted level decays.
import THREE from './three-shim.js';
import { makeVehicleMesh } from './vehicles.js';
import { nearestRoad, roadCoords, CITY } from './city.js';

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.cops = [];      // ground units {mesh, speed, mode, stateT, lastSeen}
    this.heli = null;    // {mesh, light, angle}
    this.spikes = [];    // {mesh, x, z, active}
    this.roadblocks = [];
    this.searchTimer = 0;
    this.lastKnown = new THREE.Vector3(0, 0, 0);
    this.pitCooldown = 0;
    this.spikeCooldown = 0;
    this.blockCooldown = 0;
  }
  wantedCount(wanted) {
    return wanted <= 0 ? 0 : wanted === 1 ? 2 : wanted === 2 ? 3 : wanted === 3 ? 4 : wanted === 4 ? 5 : 6;
  }
  ensureUnits(wanted, playerPos) {
    const want = this.wantedCount(wanted);
    while (this.cops.length < want) {
      const mesh = makeVehicleMesh('police');
      // spawn on a road near the player, behind them
      const r = nearestRoad(playerPos.x + (Math.random() * 120 - 60));
      mesh.position.set(r, 0, playerPos.z + (Math.random() < 0.5 ? -70 : 70));
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(mesh);
      this.cops.push({ mesh, speed: 0, mode: 'chase', stateT: 0, lastSeen: playerPos.clone(), pitT: 0 });
    }
    while (this.cops.length > want) {
      const c = this.cops.pop();
      this.scene.remove(c.mesh);
    }
    // Helicopter at 4+ stars
    if (wanted >= 4 && !this.heli) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4, metalness: 0.5 }));
      g.add(body);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.15, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      rotor.position.y = 1.2; g.add(rotor); g.userData.rotor = rotor;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lamp.position.set(0, -1, 2); g.add(lamp);
      const spot = new THREE.SpotLight(0xfff2b0, 60, 120, 0.35, 0.4);
      spot.position.set(0, -1, 2); g.add(spot); g.add(spot.target);
      g.userData.spot = spot;
      this.scene.add(g);
      this.heli = { mesh: g, angle: 0 };
    }
    if (wanted < 4 && this.heli) { this.scene.remove(this.heli.mesh); this.heli = null; }
  }
  clearField() {
    for (const s of this.spikes) this.scene.remove(s.mesh);
    for (const b of this.roadblocks) this.scene.remove(b.mesh);
    this.spikes = []; this.roadblocks = [];
  }
  laySpikes(playerPos, playerDir) {
    // Spike strip across the road 40m ahead of the player
    const ahead = playerPos.clone().addScaledVector(playerDir, 42);
    ahead.x = nearestRoad(ahead.x);
    const g = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 }));
      spike.position.set(i * 2.2, 0.4, 0); g.add(spike);
    }
    g.position.set(ahead.x, 0, ahead.z);
    this.scene.add(g);
    this.spikes.push({ mesh: g, x: ahead.x, z: ahead.z, active: true });
  }
  buildRoadblock(playerPos, playerDir) {
    // Two police cars parked across the road ahead, with a gap only at high skill
    const ahead = playerPos.clone().addScaledVector(playerDir, 55);
    const roadX = nearestRoad(ahead.x);
    const g = new THREE.Group();
    for (const off of [-4.5, 4.5]) {
      const car = makeVehicleMesh('police');
      car.position.set(off, 0, 0); car.rotation.y = Math.PI / 2;
      g.add(car);
    }
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0xff7a00, emissiveIntensity: 0.4 }));
    barrier.position.y = 0.8; g.add(barrier);
    g.position.set(roadX, 0, ahead.z);
    this.scene.add(g);
    this.roadblocks.push({ mesh: g, x: roadX, z: ahead.z });
  }
  update(dt, wanted, playerPos, playerDir, playerSpeed, inCar) {
    this.ensureUnits(wanted, playerPos);
    this.pitCooldown -= dt; this.spikeCooldown -= dt; this.blockCooldown -= dt;
    if (wanted <= 0) {
      for (const c of this.cops) c.speed = Math.max(0, c.speed - dt * 20);
      this.clearField();
      return { siren: false, spikeHit: false, busted: false };
    }
    const dist = (c) => Math.hypot(c.mesh.position.x - playerPos.x, c.mesh.position.z - playerPos.z);
    let spikeHit = false, busted = false;
    // Line of sight: cops "see" the player within 90m (160m with heli)
    const seeRange = this.heli ? 170 : 90;
    const seen = this.cops.some(c => dist(c) < seeRange) || (this.heli && true);
    if (seen) { this.lastKnown.copy(playerPos); this.searchTimer = 0; }
    else this.searchTimer += dt;

    for (const c of this.cops) {
      const d = dist(c);
      // Mode: chase the last known position; SEARCH sweep when lost for 6s+
      if (this.searchTimer > 6 && c.mode !== 'search') { c.mode = 'search'; c.stateT = 0; }
      if (seen && c.mode !== 'chase') { c.mode = 'chase'; c.stateT = 0; }
      c.stateT += dt;
      let target;
      if (c.mode === 'search') {
        // sweep a widening circle around the last known spot
        const a = c.stateT * 0.7 + this.cops.indexOf(c) * 1.3;
        target = new THREE.Vector3(this.lastKnown.x + Math.cos(a) * (14 + c.stateT * 2), 0, this.lastKnown.z + Math.sin(a) * (14 + c.stateT * 2));
      } else if (wanted >= 5 && this.cops.indexOf(c) >= 4) {
        // FLANKING: cut across a side street to intercept ahead of the player
        target = playerPos.clone().addScaledVector(playerDir, 30 + this.cops.indexOf(c) * 6);
      } else {
        // Pursuit with prediction: aim where the player WILL be
        const lead = Math.min(1.2, d / 40);
        target = playerPos.clone().addScaledVector(playerDir, playerSpeed * lead * 0.6);
      }
      // Steer toward target
      const toT = new THREE.Vector3(target.x - c.mesh.position.x, 0, target.z - c.mesh.position.z);
      const wantAngle = Math.atan2(toT.x, toT.z);
      let da = wantAngle - c.mesh.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      c.mesh.rotation.y += THREE.MathUtils.clamp(da, -2.4 * dt, 2.4 * dt);
      const top = c.mode === 'search' ? 16 : 30 + wanted * 3.2;
      c.speed += ((d > 8 ? top : top * 0.5) - c.speed) * Math.min(1, dt * 1.2);
      const fwd = new THREE.Vector3(Math.sin(c.mesh.rotation.y), 0, Math.cos(c.mesh.rotation.y));
      c.mesh.position.addScaledVector(fwd, c.speed * dt);
      // PIT manoeuvre: at 3+ stars, when alongside and close, swerve into the player
      if (wanted >= 3 && inCar && d < 7 && d > 2.5 && this.pitCooldown <= 0 && Math.abs(da) < 0.6) {
        c.pitT = 0.6; this.pitCooldown = 5;
      }
      if (c.pitT > 0) {
        c.pitT -= dt;
        const side = new THREE.Vector3(Math.cos(c.mesh.rotation.y), 0, -Math.sin(c.mesh.rotation.y));
        c.mesh.position.addScaledVector(side, dt * 6);
      }
      // Ramming contact slows the player (handled by main via distance)
      // Lightbar flash
      const flash = Math.sin(performance.now() * 0.02 + this.cops.indexOf(c)) > 0;
      if (c.mesh.userData.lightbar) c.mesh.userData.lightbar.material.color.setHex(flash ? 0xff2020 : 0x551010);
      if (c.mesh.userData.lightbar2) c.mesh.userData.lightbar2.material.color.setHex(flash ? 0x1020ff : 0x101055);
      for (const w of c.mesh.userData.wheels) w.rotation.x += c.speed * dt * 2;
      // Busted: cop very close while player is slow on foot
      if (!inCar && d < 2.2 && playerSpeed < 2) busted = true;
    }

    // Roadblocks at 3+ stars, spike strips at 4+ stars — placed AHEAD of the player
    if (wanted >= 3 && this.blockCooldown <= 0 && playerSpeed > 6) {
      this.buildRoadblock(playerPos, playerDir);
      this.blockCooldown = 14;
      if (this.roadblocks.length > 2) { const old = this.roadblocks.shift(); this.scene.remove(old.mesh); }
    }
    if (wanted >= 4 && this.spikeCooldown <= 0 && playerSpeed > 8) {
      this.laySpikes(playerPos, playerDir);
      this.spikeCooldown = 18;
      if (this.spikes.length > 2) { const old = this.spikes.shift(); this.scene.remove(old.mesh); }
    }
    // Spike hit check
    for (const s of this.spikes) {
      if (!s.active) continue;
      if (Math.hypot(playerPos.x - s.x, playerPos.z - s.z) < 5) { s.active = false; spikeHit = true; }
    }
    // Helicopter: orbits the player, searchlight tracks them
    if (this.heli) {
      const h = this.heli;
      h.angle += dt * 0.5;
      h.mesh.position.set(playerPos.x + Math.cos(h.angle) * 26, 42, playerPos.z + Math.sin(h.angle) * 26);
      h.mesh.lookAt(playerPos.x, 0, playerPos.z);
      h.mesh.userData.rotor.rotation.y += dt * 22;
      h.mesh.userData.spot.target.position.set(playerPos.x - h.mesh.position.x, -42, playerPos.z - h.mesh.position.z);
      h.mesh.userData.spot.target.updateMatrixWorld();
    }
    // Give up: lost for 25s -> wanted decays (main applies the decay)
    return { siren: true, spikeHit, busted, lostFor: this.searchTimer };
  }
}
