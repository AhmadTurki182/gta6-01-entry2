// pedestrians.js — pedestrians with routines, panic, and crime reporting.
// Peds walk sidewalks, cross at intersections, flee gunfire/crashes, and call
// the police when they witness a crime (stealing a car, shooting, running someone over).
import THREE from './three-shim.js';
import { roadCoords, CITY, nearestRoad } from './city.js';

const SHIRTS = [0xd83a3a, 0x3a7ad8, 0x3ad87a, 0xd8c83a, 0xd83ad8, 0xffffff, 0x3a3a3a, 0xff8a3a];
const SKINS = [0xe8b88a, 0xc88a5a, 0x8a5a3a, 0xf0c8a0];

export function makePedMesh() {
  const g = new THREE.Group();
  const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
  const shirt = SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 }));
  head.position.y = 1.72; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: Math.random() < 0.5 ? 0x1a1a1a : 0x5a3a1a, roughness: 1 }));
  hair.position.y = 1.76; g.add(hair);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 1 });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), legMat); l1.position.set(-0.14, 0.3, 0); g.add(l1);
  const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), legMat); l2.position.set(0.14, 0.3, 0); g.add(l2);
  g.userData.legs = [l1, l2];
  return g;
}

export class Pedestrians {
  constructor(scene) {
    this.scene = scene;
    this.peds = [];
    this.roads = roadCoords();
    for (let i = 0; i < 34; i++) this.spawn();
  }
  spawn() {
    const mesh = makePedMesh();
    const road = this.roads[Math.floor(Math.random() * this.roads.length)];
    const along = (Math.random() * 2 - 1) * (CITY.half - 20);
    const side = Math.random() < 0.5;
    mesh.position.set(side ? road + 9 : along, 0, side ? along : road + 9);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    this.peds.push({
      mesh, speed: 1.2 + Math.random() * 1.4,
      state: 'walk', // walk | flee | report | down
      stateT: 0, target: null, panic: 0, reported: false,
      walkPhase: Math.random() * 10,
    });
  }
  // danger: {x,z,r} gunfire/crash location; crime: {x,z,type} witnessed crime
  update(dt, danger, crime, playerPos) {
    for (const p of this.peds) {
      const m = p.mesh;
      p.stateT += dt;
      const dx = m.position.x - (danger ? danger.x : 0);
      const dz = m.position.z - (danger ? danger.z : 0);
      const dDanger = danger ? Math.hypot(dx, dz) : 1e9;
      if (p.state !== 'down' && dDanger < 26) { p.state = 'flee'; p.panic = 1; p.stateT = 0; }
      // Witness a crime: if close enough and not already reported, run to report it
      if (crime && !p.reported && p.state === 'walk') {
        const dc = Math.hypot(m.position.x - crime.x, m.position.z - crime.z);
        if (dc < 30) { p.state = 'report'; p.reported = true; p.stateT = 0; }
      }
      if (p.state === 'flee') {
        // Run away from danger, prefer along the road
        const away = new THREE.Vector3(dx, 0, dz).normalize();
        m.position.addScaledVector(away, 5.5 * dt);
        m.rotation.y = Math.atan2(away.x, away.z);
        p.walkPhase += dt * 14;
        if (p.stateT > 4) { p.state = 'walk'; p.panic = 0; }
      } else if (p.state === 'report') {
        // Freeze, "phone to ear", then the report lands — handled by main via onReport
        m.rotation.y += dt * 0.5;
        if (p.stateT > 2.5) { p.state = 'walk'; if (p.onReport) p.onReport(); p.onReport = null; }
      } else {
        // Routine: walk along the sidewalk, cross at intersections sometimes
        const fwd = new THREE.Vector3(Math.sin(m.rotation.y), 0, Math.cos(m.rotation.y));
        m.position.addScaledVector(fwd, p.speed * dt);
        p.walkPhase += dt * 6;
        const onRoadX = this.roads.some(r => Math.abs(m.position.x - r) < 1.5);
        const onRoadZ = this.roads.some(r => Math.abs(m.position.z - r) < 1.5);
        if (onRoadX && onRoadZ && Math.random() < dt * 0.4) {
          m.rotation.y += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        }
        if (Math.abs(m.position.x) > CITY.half || Math.abs(m.position.z) > CITY.half) {
          m.rotation.y += Math.PI;
          m.position.x = THREE.MathUtils.clamp(m.position.x, -CITY.half, CITY.half);
          m.position.z = THREE.MathUtils.clamp(m.position.z, -CITY.half, CITY.half);
        }
      }
      // leg swing
      const s = Math.sin(p.walkPhase);
      p.mesh.userData.legs[0].rotation.x = s * 0.6;
      p.mesh.userData.legs[1].rotation.x = -s * 0.6;
      // keep peds out of building footprints is handled by main collision pass
    }
  }
  // A ped hit by a car goes down (and the driver gains wanted)
  knockDown(pos, radius) {
    let hit = null;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.mesh.position.x - pos.x, p.mesh.position.z - pos.z);
      if (d < radius) { p.state = 'down'; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.35; hit = p; }
    }
    return hit;
  }
  reviveAll() {
    for (const p of this.peds) {
      if (p.state === 'down' && Math.random() < 0.02) {
        p.state = 'walk'; p.mesh.rotation.x = 0; p.mesh.position.y = 0; p.reported = false;
      }
    }
  }
}
