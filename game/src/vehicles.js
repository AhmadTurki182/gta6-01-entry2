// vehicles.js — vehicle factory (6 distinct handling classes) + smart traffic AI.
// Traffic follows the road grid, brakes for the player and obstacles, varies speed,
// and pulls over when it hears a siren. Player cars are separate objects (see player.js).
import THREE from './three-shim.js';
import { roadCoords, CITY } from './city.js';

export const VEHICLE_TYPES = {
  sedan:   { name: 'Marlin Sedan',   color: 0x3a6ad8, accel: 14, top: 34, grip: 2.6, price: 0 },
  taxi:    { name: 'Bay Cab',        color: 0xffc21a, accel: 12, top: 30, grip: 2.4, price: 0 },
  sports:  { name: 'Vortex GT',     color: 0xd81a3a, accel: 22, top: 52, grip: 3.4, price: 9000 },
  muscle:  { name: 'Thunder V8',    color: 0x1a7a3a, accel: 18, top: 44, grip: 2.8, price: 6500 },
  van:     { name: 'Cargo Van',      color: 0xd8d8d8, accel: 9,  top: 26, grip: 2.0, price: 2500 },
  truck:   { name: 'Hauler Truck',   color: 0x8a5a1a, accel: 8,  top: 24, grip: 1.8, price: 4000 },
  police:  { name: 'SBP Interceptor',color: 0x101418, accel: 20, top: 48, grip: 3.2, price: 0 },
  heli:    { name: 'SBP Falcon',     color: 0x223344, accel: 0,  top: 0,  grip: 0,  price: 0 },
};

export function makeVehicleMesh(type, opts = {}) {
  const spec = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: opts.color ?? spec.color, roughness: 0.3, metalness: 0.6 });
  const len = type === 'truck' || type === 'van' ? 5.6 : type === 'sports' ? 4.4 : 4.8;
  const wid = type === 'truck' ? 2.4 : 2.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.75, len), bodyMat);
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(wid * 0.82, 0.65, len * 0.45),
    new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.15, metalness: 0.7 })
  );
  cabin.position.set(0, 1.3, type === 'truck' ? 1.2 : -0.2); cabin.castShadow = true; g.add(cabin);
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.9, 0.08, 0.5), bodyMat);
    spoiler.position.set(0, 1.25, -len / 2 + 0.2); g.add(spoiler);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe95e }));
    sign.position.set(0, 1.85, -0.2); g.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    bar.position.set(0, 1.78, -0.2); g.add(bar); g.userData.lightbar = bar;
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    bar2.position.set(0, 1.78, 0.3); g.add(bar2); g.userData.lightbar2 = bar2;
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-wid / 2, len / 2 - 0.9], [wid / 2, len / 2 - 0.9], [-wid / 2, -len / 2 + 0.9], [wid / 2, -len / 2 + 0.9]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w); wheels.push(w);
  }
  // headlights + taillights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), hl);
    h.position.set(sx, 0.7, len / 2 + 0.02); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    t.position.set(sx, 0.7, -len / 2 - 0.02); g.add(t);
  }
  g.userData.wheels = wheels;
  g.userData.spec = spec;
  g.userData.type = type;
  return g;
}

// --- Traffic ---
export class Traffic {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.cars = [];
    this.roads = roadCoords();
    const types = ['sedan', 'sedan', 'taxi', 'van', 'sports', 'muscle', 'truck'];
    for (let i = 0; i < 26; i++) this.spawnCar(types[i % types.length]);
  }
  spawnCar(type) {
    const mesh = makeVehicleMesh(type);
    const vertical = Math.random() < 0.5;
    const road = this.roads[Math.floor(Math.random() * this.roads.length)];
    const along = (Math.random() * 2 - 1) * (CITY.half - 20);
    const lane = (Math.random() < 0.5 ? -1 : 1) * 3.5;
    const dir = Math.random() < 0.5 ? 1 : -1;
    mesh.position.set(vertical ? road + lane : along, 0, vertical ? along : road + lane);
    mesh.rotation.y = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.scene.add(mesh);
    const car = {
      mesh, type, vertical, dir,
      speed: 0,
      cruise: 8 + Math.random() * 9, // varied cruise speed
      stopped: 0, pullOver: false,
    };
    this.cars.push(car);
    return car;
  }
  // playerPos: Vector3, sirenNear: boolean, obstacles: [{x,z,r}]
  update(dt, playerPos, sirenNear, obstacles) {
    for (const car of this.cars) {
      const m = car.mesh;
      // Decide: brake for player/obstacle ahead, pull over for sirens
      const fwd = new THREE.Vector3(0, 0, 1).applyEuler(m.rotation);
      let want = car.cruise;
      let blocked = false;
      const ahead = (dx, dz, dist) => {
        const d = Math.hypot(dx, dz);
        if (d > dist) return false;
        const dot = (dx * fwd.x + dz * fwd.z) / (d || 1);
        return dot > 0.7;
      };
      if (playerPos && ahead(playerPos.x - m.position.x, playerPos.z - m.position.z, 16)) blocked = true;
      for (const o of obstacles || []) {
        if (ahead(o.x - m.position.x, o.z - m.position.z, 14)) { blocked = true; break; }
      }
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.mesh.position.x - m.position.x, dz = other.mesh.position.z - m.position.z;
        if (Math.hypot(dx, dz) < 9 && ahead(dx, dz, 9)) { blocked = true; break; }
      }
      // Pull over: drift to the right lane edge and stop while a siren is near
      if (sirenNear && !car.pullOver) car.pullOver = true;
      if (!sirenNear && car.pullOver && Math.random() < dt * 0.5) car.pullOver = false;
      if (car.pullOver) want = 0;
      if (blocked) want = 0;
      car.speed += (want - car.speed) * Math.min(1, dt * (want > car.speed ? 0.8 : 3));
      if (car.speed < 0.05) car.speed = 0;
      m.position.addScaledVector(fwd, car.speed * dt);
      // Pull-over lateral drift
      if (car.pullOver) {
        const right = new THREE.Vector3(1, 0, 0).applyEuler(m.rotation);
        m.position.addScaledVector(right, dt * 1.2);
      }
      // Wrap around the city edge / turn at intersections
      const p = m.position;
      if (Math.abs(p.x) > CITY.half + 10 || Math.abs(p.z) > CITY.half + 10) {
        p.x = THREE.MathUtils.clamp(p.x, -CITY.half, CITY.half);
        p.z = THREE.MathUtils.clamp(p.z, -CITY.half, CITY.half);
      }
      // Occasionally turn at an intersection (keeps traffic spread across the grid)
      const onRoadX = this.roads.some(r => Math.abs(p.x - r) < 1.2);
      const onRoadZ = this.roads.some(r => Math.abs(p.z - r) < 1.2);
      if (onRoadX && onRoadZ && Math.random() < dt * 0.25) {
        const turn = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        m.rotation.y += turn;
        car.vertical = !car.vertical;
        // snap to nearest road centre + lane
        if (car.vertical) { p.x = this.roads.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a) + (Math.random() < 0.5 ? -3.5 : 3.5); }
        else { p.z = this.roads.reduce((a, b) => Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a) + (Math.random() < 0.5 ? -3.5 : 3.5); }
      }
      // spin wheels
      for (const w of m.userData.wheels) w.rotation.x += car.speed * dt * 2;
    }
  }
}
