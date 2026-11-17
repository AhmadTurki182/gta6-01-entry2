// city.js — builds Solmar Bay: a 13x13-block sun-soaked coastal city.
// Five districts, a grid road graph (used by traffic + police AI), neon signs,
// street lights, palm trees, a marina, wet reflective roads at dusk.
import THREE from './three-shim.js';

export const CITY = {
  block: 44, road: 14, half: 286, // city spans -286..286
  gridN: 13,
};
export const ROAD_Y = 0.05;

function seededRand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Road centre coordinates: roads at x = -264, -220, ..., 264
export function roadCoords() {
  const out = [];
  for (let i = 0; i < CITY.gridN; i++) out.push(-CITY.half + 22 + i * CITY.block);
  return out;
}
export function nearestRoad(v) {
  const rs = roadCoords();
  let best = rs[0], bd = 1e9;
  for (const r of rs) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
}
export function districtAt(x, z) {
  if (z < -150) return 'MARINA';
  if (x < -110 && z > 60) return 'DOCKS';
  if (x > 110 && z > 40) return 'NEON STRIP';
  if (x > 60 && z < -40) return 'OLD TOWN';
  if (Math.abs(x) < 90 && Math.abs(z) < 90) return 'DOWNTOWN';
  return 'HILLS';
}

const PALETTE = {
  MARINA: [0x7fb4d8, 0x9fd4e8, 0x6fa8c8],
  DOWNTOWN: [0x3a4a6b, 0x4a5a7d, 0x2e3d5c, 0x5a6a8d],
  'NEON STRIP': [0x5c2a6b, 0x7a2a4a, 0x3a2a5c, 0x8a2a5c],
  'OLD TOWN': [0xb08a5a, 0x9a7a4a, 0xc09a6a],
  DOCKS: [0x5a5a52, 0x6a5a4a, 0x4a4a42],
  HILLS: [0x7a8a6a, 0x8a7a5a, 0x6a7a5a],
};

export function buildCity(scene) {
  const rand = seededRand(20261117);
  const group = new THREE.Group();
  group.name = 'SolmarBay';
  const roads = roadCoords();
  const colliders = []; // {x,z,hx,hz} building footprints for collision

  // Ground: sand/grass base + ocean strip on the north edge
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.1; ground.receiveShadow = true;
  group.add(ground);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 260),
    new THREE.MeshStandardMaterial({ color: 0x1a5a8a, roughness: 0.15, metalness: 0.4 })
  );
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.0, -CITY.half - 130);
  group.add(ocean);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 26),
    new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 1 })
  );
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.02, -CITY.half - 8);
  group.add(beach);

  // Road slabs (dark, low roughness = wet look at dusk) + centre dashes
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x33363f, roughness: 0.45, metalness: 0.2 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c85a });
  const span = CITY.half * 2 + CITY.road;
  for (const r of roads) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, span), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(r, ROAD_Y, 0); v.receiveShadow = true; group.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(span, CITY.road), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, ROAD_Y, r); h.receiveShadow = true; group.add(h);
    for (let d = -CITY.half; d < CITY.half; d += 12) {
      const dv = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3), dashMat);
      dv.rotation.x = -Math.PI / 2; dv.position.set(r, ROAD_Y + 0.01, d); group.add(dv);
      const dh = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.6), dashMat);
      dh.rotation.x = -Math.PI / 2; dh.position.set(d, ROAD_Y + 0.01, r); group.add(dh);
    }
  }

  // Buildings: one or two per block, window texture via canvas
  const winTex = makeWindowTexture();
  const neonColors = [0xff2e88, 0x00e5ff, 0xffd23f, 0x7dff5e, 0xff6a00];
  const signs = [];
  for (let ix = 0; ix < CITY.gridN - 1; ix++) {
    for (let iz = 0; iz < CITY.gridN - 1; iz++) {
      const cx = (roads[ix] + roads[ix + 1]) / 2;
      const cz = (roads[iz] + roads[iz + 1]) / 2;
      const d = districtAt(cx, cz);
      const pal = PALETTE[d] || PALETTE.DOWNTOWN;
      const n = rand() < 0.72 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const w = 12 + rand() * 14, dep = 12 + rand() * 14;
        const h = d === 'DOWNTOWN' ? 22 + rand() * 55 : d === 'NEON STRIP' ? 14 + rand() * 30 : 8 + rand() * 16;
        const ox = n === 2 ? (k === 0 ? -8 : 8) : 0;
        const oz = n === 2 ? (k === 0 ? -8 : 8) : 0;
        const col = pal[Math.floor(rand() * pal.length)];
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, emissiveMap: winTex, emissive: 0xffc86e, emissiveIntensity: 0.55, map: winTex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat);
        b.position.set(cx + ox, h / 2, cz + oz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        colliders.push({ x: cx + ox, z: cz + oz, hx: w / 2 + 0.5, hz: dep / 2 + 0.5 });
        // Rooftop beacon on tall towers
        if (h > 45) {
          const bc = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3040 }));
          bc.position.set(cx + ox, h + 1, cz + oz); group.add(bc);
        }
        // Neon sign on strip / downtown corners
        if ((d === 'NEON STRIP' || d === 'DOWNTOWN') && rand() < 0.5) {
          const nc = neonColors[Math.floor(rand() * neonColors.length)];
          const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 0.4), new THREE.MeshBasicMaterial({ color: nc }));
          sign.position.set(cx + ox, Math.min(h - 2, 12 + rand() * 8), cz + oz + dep / 2 + 0.3);
          group.add(sign); signs.push(sign);
        }
      }
    }
  }

  // Palm trees along the marina + street lamps at intersections
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a8a3a, roughness: 1 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6 });
  const lampLight = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < 40; i++) {
    const x = -CITY.half + rand() * CITY.half * 2;
    const z = -CITY.half + 6 + rand() * 14;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    t.position.set(x, 3.5, z); group.add(t);
    const l = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3, 7), leafMat);
    l.position.set(x, 8, z); group.add(l);
  }
  for (const rx of roads) for (const rz of roads) {
    if (rand() < 0.5) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), lampMat);
    pole.position.set(rx + 8, 3.5, rz + 8); group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), lampLight);
    bulb.position.set(rx + 8, 7.1, rz + 8); group.add(bulb);
  }

  // Landmarks: Solmar Tower (downtown), Ferris wheel (marina), lighthouse
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(26, 92, 26),
    new THREE.MeshStandardMaterial({ color: 0x2a3a5c, roughness: 0.4, metalness: 0.5, emissiveMap: winTex, emissive: 0x88bbff, emissiveIntensity: 0.7, map: winTex })
  );
  tower.position.set(0, 46, 0); tower.castShadow = true; group.add(tower);
  colliders.push({ x: 0, z: 0, hx: 14, hz: 14 });
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(16, 0.8, 8, 32), new THREE.MeshStandardMaterial({ color: 0xff2e88, emissive: 0xff2e88, emissiveIntensity: 0.9 }));
  wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 32, 6), lampMat);
    sp.rotation.z = (i * Math.PI) / 8; wheel.add(sp);
  }
  wheel.position.set(-180, 20, -250); group.add(wheel);
  const light = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 26, 10), new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8 }));
  light.position.set(240, 13, -262); group.add(light);
  const lightTop = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
  lightTop.position.set(240, 27, -262); group.add(lightTop);

  scene.add(group);
  return { group, colliders, signs, wheel };
}

function makeWindowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#888888'; g.fillRect(0, 0, 128, 128);
  for (let y = 6; y < 122; y += 12) for (let x = 6; x < 122; x += 12) {
    const lit = Math.random() < 0.45;
    g.fillStyle = lit ? (Math.random() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#20242e';
    g.fillRect(x, y, 7, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

// Sky + sun + fog driven by time of day. Returns {sun, hemi, skyMesh}
export function buildSky(scene) {
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a2a1a, 1.1);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x8899bb, 0.55);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(0xffc06a, 1.6);
  sun.position.set(200, 160, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 900;
  scene.add(sun);
  scene.add(sun.target);
  const moon = new THREE.DirectionalLight(0x8aa8ff, 0.25);
  moon.position.set(-150, 200, -100); scene.add(moon);
  scene.fog = new THREE.Fog(0x1a2438, 220, 900);
  return { sun, hemi, moon };
}

export function updateSky(sky, minutes, scene) {
  const h = (minutes / 60) % 24;
  // sun elevation: peaks noon, below horizon at night
  const ang = ((h - 6) / 12) * Math.PI; // 0 at 6:00, PI at 18:00
  const elev = Math.sin(ang);
  const warm = Math.max(0, 1 - Math.abs(h - 18) / 3); // golden hour near 18:00
  const day = Math.max(0, Math.min(1, elev * 2.2 + 0.35));
  const dusk = Math.max(0, 1 - Math.abs(elev) * 3) * (h > 12 ? 1 : 0.4);
  sky.sun.intensity = 0.6 + day * 1.7;
  sky.sun.color.setHSL(0.08 + warm * 0.02, 0.75, 0.55 + day * 0.1);
  sky.sun.position.set(Math.cos(ang) * 300, Math.max(60, elev * 260), 120);
  sky.hemi.intensity = 0.6 + day * 0.6;
  sky.moon.intensity = day < 0.25 ? 0.5 : 0.1;
  const top = new THREE.Color().setHSL(0.6, 0.55, 0.28 + day * 0.35 + dusk * 0.08);
  const bot = new THREE.Color().setHSL(0.08, 0.8, 0.22 + dusk * 0.3 + day * 0.12);
  scene.background = top.clone().lerp(bot, 0.35);
  scene.fog.color.copy(top).lerp(bot, 0.4);
  return { day, dusk };
}
