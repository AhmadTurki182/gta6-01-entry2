// main.js — SOLMAR: Three Days. Boots the renderer, wires every system,
// runs the game loop, the wanted system, mission context, combat, saving,
// and the ?shot= screenshot staging modes.
import THREE from './three-shim.js';
import { buildCity, buildSky, updateSky, nearestRoad, CITY } from './city.js';
import { Traffic, makeVehicleMesh, VEHICLE_TYPES } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { MissionManager, MISSIONS, SIDE_ACTIVITIES } from './missions.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { GameState, saveGame, loadGame, hasSave, setWanted, raiseWanted, addMoney, addRep, clockString } from './state.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || null;

// ---------- renderer / scene ----------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2438);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(-160, 40, -200);

const sky = buildSky(scene);
const city = buildCity(scene);
const colliders = city.colliders;
const effects = new Effects(scene);
const traffic = new Traffic(scene, colliders);
const peds = new Pedestrians(scene);
const police = new Police(scene);
const player = new Player(scene);
const missions = new MissionManager();
const audio = new AudioEngine();
const hud = new HUD();

// ---------- drivable parked cars ----------
const parkedCars = [];
function parkCar(type, x, z, rotY) {
  const mesh = makeVehicleMesh(type);
  mesh.position.set(x, 0, z); mesh.rotation.y = rotY;
  scene.add(mesh);
  const car = { mesh, type, spec: VEHICLE_TYPES[type], parked: true };
  parkedCars.push(car);
  return car;
}
// Player's starter sedan at the Marina + a spread of stealable cars
parkCar('sedan', -176, -240, 0.3);
parkCar('sports', 44, 36, Math.PI / 2);      // showroom GT (mission 2)
parkCar('taxi', 150, 76, -Math.PI / 2);
parkCar('muscle', 120, -116, 0);
parkCar('van', -216, 196, Math.PI);
parkCar('sports', 180, 136, Math.PI / 2);
parkCar('sedan', -40, 236, 0);
parkCar('truck', -160, 226, Math.PI / 2);
parkCar('taxi', 60, -160, 0);
parkCar('muscle', -120, -60, Math.PI);

// ---------- mission props: van, escort, crates, coins ----------
const van = parkCar('van', 132, 88, -Math.PI / 2);
van.parked = false; van.hp = 100; van.stopped = false;
const escort = parkCar('sedan', 220, -240, Math.PI / 2);
escort.parked = false; escort.hp = 100;
const crates = [];
for (const [x, z] of [[-216, 196], [-224, 204], [-208, 208]]) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 0.5 }));
  c.position.set(x, 0.8, z); scene.add(c); crates.push({ mesh: c, taken: false });
}
const coins = [];
{
  const spots = [[-220, -240], [-100, -180], [0, -200], [100, -160], [200, -200], [240, -100],
    [-240, -60], [-160, 20], [-60, -80], [20, -140], [80, 40], [160, -40], [220, 20],
    [-200, 100], [-120, 160], [-40, 120], [40, 180], [120, 220], [200, 120], [240, 200],
    [-240, 240], [-180, 140], [-80, 240], [0, 60], [60, -220], [140, -180], [-60, -240], [180, -120], [-20, 200], [100, 100]];
  for (const [x, z] of spots) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb400, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.2 }));
    c.rotation.x = Math.PI / 2; c.position.set(x, 1.2, z); scene.add(c);
    coins.push({ mesh: c, taken: false });
  }
}
let cratesCollected = 0;

// ---------- input ----------
const input = { forward: false, back: false, left: false, right: false, shift: false, handbrake: false, camYaw: Math.PI, camDist: 13 };
const keys = {};
let mouseDown = false, dragging = false, lastX = 0, lastY = 0, camPitch = 0.22;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') tryEnterExit();
  if (e.code === 'KeyR') hud.setRadio(audio.nextStation());
  if (e.code === 'KeyC') input.camDist = input.camDist === 13 ? 8 : input.camDist === 8 ? 20 : 13;
  if (e.code === 'Digit1') { GameState.weapon = 1; hud.setWeapon('FISTS'); player.mesh.userData.gun.visible = false; }
  if (e.code === 'Digit2') { GameState.weapon = 2; hud.setWeapon('PISTOL', GameState.ammo); player.mesh.userData.gun.visible = !player.inCar; }
  if (e.code === 'KeyM') { effects.beacon ? effects.clearBeacon() : effects.setBeacon(missions.marker); }
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyF') punchOrShoot();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousedown', (e) => {
  if (e.target.closest('button') || e.target.closest('#menu') || e.target.closest('#pause') || e.target.closest('#missioncard')) return;
  mouseDown = true; dragging = true; lastX = e.clientX; lastY = e.clientY;
  if (started && !player.inCar) punchOrShoot();
});
addEventListener('mouseup', () => { mouseDown = false; dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  input.camYaw -= (e.clientX - lastX) * 0.005;
  camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - lastY) * 0.003, 0.08, 1.1);
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('wheel', (e) => { input.camDist = THREE.MathUtils.clamp(input.camDist + e.deltaY * 0.01, 7, 24); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- enter / steal ----------
function allStealable() {
  const list = [...parkedCars];
  for (const t of traffic.cars) list.push({ mesh: t.mesh, type: t.type, spec: t.mesh.userData.spec, trafficCar: t });
  return list;
}
function tryEnterExit() {
  if (!started || paused) return;
  audio.resume();
  if (player.inCar) { player.exitCar(); player.mesh.userData.gun.visible = GameState.weapon === 2; hud.showToast('You left the car'); return; }
  const car = player.stealCar(allStealable(), 6);
  if (!car) { hud.showToast('No car nearby — get closer'); return; }
  // Stealing a car the player does not own is a crime: peds may report it
  const owned = car.type === 'sedan' && Math.hypot(car.mesh.position.x + 176, car.mesh.position.z + 240) < 8;
  if (car.trafficCar) {
    traffic.cars = traffic.cars.filter(c => c !== car.trafficCar);
    raiseWanted(1, 'car theft');
    hud.showToast('STOLEN! The SBP has been called');
    audio.blip(440);
  } else if (!owned && car.parked) {
    raiseWanted(1, 'car theft');
    hud.showToast('STOLEN! The SBP has been called');
  }
  if (car.trafficCar) car.trafficCar = null;
  parkedCars.splice(parkedCars.indexOf(car), 1);
  player.enterCar(car);
  GameState.carsStolen++;
  hud.setWeapon(GameState.weapon === 2 ? 'PISTOL' : 'FISTS', GameState.weapon === 2 ? GameState.ammo : null);
}

// ---------- combat ----------
function punchOrShoot() {
  if (!started || paused || player.inCar) return;
  const origin = player.pos.clone(); origin.y = 1.4;
  const dir = player.forward;
  if (GameState.weapon === 1) {
    // punch: short range
    for (const p of peds.peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.mesh.position.x - origin.x, p.mesh.position.z - origin.z);
      if (d < 2.2) {
        p.state = 'down'; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.35;
        raiseWanted(1, 'assault'); GameState.kills++;
        hud.showToast('Pedestrian down — witnesses are calling the SBP');
      }
    }
    return;
  }
  if (!player.shoot(origin, dir)) { if (GameState.ammo <= 0) hud.showToast('OUT OF AMMO — find the gun shop (buy with $)'); return; }
  audio.gunshot();
  effects.muzzle(origin, dir);
  const ray = new THREE.Raycaster(origin, dir, 0.1, 60);
  const targets = [];
  for (const p of peds.peds) if (p.state !== 'down') targets.push(p.mesh);
  for (const c of police.cops) targets.push(c.mesh);
  const hits = ray.intersectObjects(targets, true);
  if (hits.length) {
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== scene) obj = obj.parent;
    const ped = peds.peds.find(p => p.mesh === obj);
    if (ped) {
      ped.state = 'down'; ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.35;
      raiseWanted(1, 'shooting'); GameState.kills++;
      effects.burst(hits[0].point, 0xd81a1a, 8, 4, 0.25, 0.5);
    }
    const cop = police.cops.find(c => c.mesh === obj);
    if (cop) { raiseWanted(1, 'shooting a cop'); effects.burst(hits[0].point, 0x3a7dff, 10, 5, 0.3, 0.6); }
  }
  raiseWanted(0, '');
  // gunfire scares peds and may be reported
  peds.update(0, { x: origin.x, z: origin.z, r: 30 }, null, player.pos);
}

// ---------- pause / menu ----------
let started = false, paused = false;
function togglePause() {
  if (!started) return;
  paused = !paused;
  document.getElementById('pause').style.display = paused ? 'flex' : 'none';
  if (paused) document.getElementById('pauseStats').textContent =
    `Day ${GameState.day} · $${GameState.money.toLocaleString()} · ${GameState.missionsDone.length}/9 missions · Rep ${GameState.rep}`;
}
document.getElementById('btnResume').onclick = togglePause;
document.getElementById('btnSave').onclick = () => { saveGame(); hud.showToast('GAME SAVED'); };
document.getElementById('btnMenu').onclick = () => { saveGame(); location.reload(); };
document.getElementById('btnPlay').onclick = () => startGame(false);
document.getElementById('btnContinue').onclick = () => startGame(true);
document.getElementById('btnFree').onclick = () => { GameState.freeRoam = true; startGame(false); };

function startGame(fromSave) {
  if (fromSave && loadGame()) hud.showToast('Save loaded — welcome back, Vex');
  audio.init(); audio.resume();
  document.getElementById('menu').style.display = 'none';
  started = true;
  missions.onEvent = onMissionEvent;
  if (!GameState.freeRoam && !missions.current()) missions.startMission(GameState.missionIndex);
  else if (!GameState.freeRoam) missions.updateMarker();
  refreshObjective();
  hud.setRadio(audio.stations[audio.station].name);
  hud.setWeapon('FISTS');
  if (GameState.freeRoam) hud.setObjective(1, 'FREE ROAM', 'Solmar Bay is yours — steal, race, explore', 'Side work: taxi, vigilante, time trial, coins');
}

function refreshObjective() {
  const m = missions.current();
  const s = missions.currentStage();
  if (!m || !s) { hud.setObjective(GameState.day, 'FREE ROAM', 'Explore Solmar Bay', ''); return; }
  hud.setObjective(m.day, m.title, s.text, m.brief);
  effects.setBeacon(missions.marker);
}

function onMissionEvent(type, data) {
  if (type === 'missionStart') {
    hud.showMissionCard(`DAY ${data.mission.day} — ${data.mission.title}`, data.mission.brief, refreshObjective);
    audio.coin();
  } else if (type === 'stage') { refreshObjective(); audio.blip(990); }
  else if (type === 'missionComplete') {
    hud.showMissionCard('MISSION COMPLETE', `${data.mission.title} — +$${data.mission.reward.toLocaleString()} · +8 REP`, refreshObjective);
    audio.coin();
  } else if (type === 'missionFailed') {
    hud.showToast(data.reason + ' — retrying mission'); audio.blip(220);
  } else if (type === 'storyComplete') {
    hud.showMissionCard('STORY COMPLETE — SUNRISE', 'Lena Marlowe made it. Solmar Bay is behind her. Free roam unlocked — keep the city yours.', () => { GameState.freeRoam = true; refreshObjective(); });
  } else if (type === 'approach') {
    hud.showToast(data.choice === 'STEALTH' ? 'Stealth approach — stay quiet' : 'Frontal approach — the SBP is coming!');
  }
}

// ---------- wanted decay / busted / wasted ----------
let wantedDecayT = 0;
function updateWanted(dt, lostFor) {
  if (GameState.wanted > 0 && lostFor > 25) {
    wantedDecayT += dt;
    if (wantedDecayT > 5) { wantedDecayT = 0; setWanted(GameState.wanted - 1, 'escaped'); hud.showToast('You lost them — wanted level dropping'); }
  } else wantedDecayT = 0;
  if (GameState.wanted === 0) GameState.heat = Math.max(0, GameState.heat - dt * 0.5);
}
function busted() {
  setWanted(0, 'busted'); police.clearField();
  addMoney(-200);
  player.pos.set(200, 0, 170); player.heading = 0;
  if (player.inCar) { player.exitCar(); }
  player.mesh.position.copy(player.pos);
  hud.showMissionCard('BUSTED', 'The SBP caught you. -$200 bail. Your car was impounded.', () => {});
  GameState.health = 100;
}
function wasted() {
  setWanted(0, 'wasted'); police.clearField();
  addMoney(-Math.min(500, Math.floor(GameState.money * 0.1)));
  player.pos.set(200, 0, 170);
  if (player.inCar) player.exitCar();
  player.mesh.position.copy(player.pos);
  GameState.health = 100;
  hud.showMissionCard('WASTED', 'You blacked out in the gutter. A stranger dragged you to the safehouse.', () => {});
}

// ---------- camera ----------
function updateCamera(dt) {
  const target = player.inCar ? player.car.mesh.position : player.pos;
  const yaw = player.inCar ? player.heading : input.camYaw; // camera sits behind the player/car
  const dist = input.camDist;
  const cx = target.x + Math.sin(yaw) * -dist * 0.9 + Math.sin(yaw + Math.PI / 2) * 0;
  const cz = target.z + Math.cos(yaw) * -dist * 0.9;
  const cy = target.y + dist * camPitch + 3;
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 5));
  camera.lookAt(target.x, target.y + 2, target.z);
}

// ---------- screenshot staging ----------
function applyShotMode() {
  if (!SHOT) return;
  document.getElementById('menu').style.display = 'none';
  started = true;
  audio.init();
  missions.onEvent = onMissionEvent;
  if (SHOT === 'menu') { document.getElementById('menu').style.display = 'flex'; started = false; }
  if (SHOT === 'chase') {
    // Police chase on the Neon Strip, 3 stars, mission objective on HUD.
    // Player car on road x=132 heading north (-z); cops behind + roadblock ahead.
    const car = parkCar('sports', 132, 120, Math.PI);
    parkedCars.splice(parkedCars.indexOf(car), 1);
    player.enterCar(car);
    player.carSpeed = 20;
    GameState.wanted = 3; GameState.day = 2; GameState.missionIndex = 5;
    GameState.timeMinutes = 16 * 60 + 30;
    missions.stage = 0; missions.updateMarker();
    police.ensureUnits(3, player.pos);
    police.cops[0].mesh.position.set(128, 0, 150);
    police.cops[0].mesh.rotation.y = Math.PI;
    if (police.cops[1]) { police.cops[1].mesh.position.set(136, 0, 146); police.cops[1].mesh.rotation.y = Math.PI; }
    if (police.cops[2]) { police.cops[2].mesh.position.set(132, 0, 40); police.cops[2].mesh.rotation.y = 0; }
    police.buildRoadblock(player.pos, new THREE.Vector3(0, 0, -1));
    hud.setObjective(2, 'THE LONG WAY HOME', 'Escape the Strip — head for the Hills', '3 stars · roadblocks ahead · helicopter overhead');
    effects.setBeacon(missions.marker);
    hud.setWeapon('PISTOL', 24);
    hud.showToast('3 STARS — LOSE THE SBP!');
  }
  if (SHOT === 'drive') {
    // Eastbound along road z=44 through Downtown
    const car = parkCar('muscle', -20, 44, Math.PI / 2);
    parkedCars.splice(parkedCars.indexOf(car), 1);
    player.enterCar(car); player.carSpeed = 18;
    GameState.day = 1; GameState.missionIndex = 0;
    GameState.timeMinutes = 16 * 60 + 30;
    missions.stage = 2; missions.updateMarker();
    hud.setObjective(1, 'THE CALL', 'Drive to the Neon Strip safehouse', 'Follow the yellow marker');
    effects.setBeacon(missions.marker);
  }
  if (SHOT === 'walk') {
    // On foot on road x=44, facing the showroom GT at (44, 36)
    player.pos.set(44, 0, 66); player.heading = Math.PI;
    GameState.day = 1; GameState.missionIndex = 1;
    GameState.timeMinutes = 16 * 60 + 30;
    missions.stage = 1; missions.updateMarker();
    hud.setObjective(1, 'BORROWED WHEELS', 'Steal the Vortex GT from the showroom', 'STEALTH or FRONTAL — your call');
    effects.setBeacon({ x: 44, z: 36 });
    input.camYaw = Math.PI;
  }
  if (SHOT === 'mission') {
    // On foot on road x=-220 at the Docks, facing the warehouse crates (south, +z)
    player.pos.set(-220, 0, 168); player.heading = 0;
    GameState.day = 2; GameState.missionIndex = 4;
    GameState.timeMinutes = 16 * 60 + 30;
    missions.stage = 2; missions.updateMarker();
    hud.setObjective(2, 'HARBOR LIGHTS', 'Collect 3 crates from the warehouse', 'The dock crew is armed — choose your approach');
    effects.setBeacon({ x: -216, z: 200 });
    input.camYaw = 0;
  }
  setTimeout(() => { window.__shotReady = true; }, 2500);
}
applyShotMode();

// ---------- main loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
let crashCooldown = 0;
const tmpV = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  crashCooldown -= dt;

  // time of day advances
  GameState.timeMinutes = (GameState.timeMinutes + dt * 0.6) % (24 * 60);
  updateSky(sky, GameState.timeMinutes, scene);
  city.wheel.rotation.z += dt * 0.15;

  if (started && !paused) {
    input.forward = keys.KeyW || keys.ArrowUp;
    input.back = keys.KeyS || keys.ArrowDown;
    input.left = keys.KeyA || keys.ArrowLeft;
    input.right = keys.KeyD || keys.ArrowRight;
    input.shift = keys.ShiftLeft || keys.ShiftRight;
    input.handbrake = keys.Space;

    const sirenNear = GameState.wanted > 0;
    player.update(dt, input, colliders, (impact) => {
      if (crashCooldown > 0) return;
      crashCooldown = 0.8;
      audio.crash();
      effects.burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffd23f, 8, 5, 0.3, 0.5);
      GameState.health -= Math.min(20, impact * 0.4);
      if (impact > 12) raiseWanted(1, 'crash');
    });

    // traffic + peds
    const obstacles = [{ x: player.pos.x, z: player.pos.z, r: 3 }];
    for (const c of police.cops) obstacles.push({ x: c.mesh.position.x, z: c.mesh.position.z, r: 3 });
    traffic.update(dt, player.pos, sirenNear, obstacles);
    peds.update(dt, null, null, player.pos);
    peds.reviveAll();

    // police
    const pdir = player.forward;
    const pSpeed = player.inCar ? Math.abs(player.carSpeed) : player.speed;
    const res = police.update(dt, GameState.wanted, player.pos, pdir, pSpeed, player.inCar);
    audio.setSiren(res.siren, GameState.wanted);
    audio.setEngine(player.inCar ? Math.abs(player.carSpeed) / 40 : 0, player.inCar);
    if (res.spikeHit && player.inCar) {
      player.tireBlown = 6; player.carSpeed *= 0.4;
      hud.showToast('SPIKE STRIP! Tires blown — handling wrecked');
      audio.crash();
    }
    if (res.busted) busted();
    updateWanted(dt, res.lostFor || 0);

    // police ramming the player car slows it
    if (player.inCar) {
      for (const c of police.cops) {
        const d = Math.hypot(c.mesh.position.x - player.pos.x, c.mesh.position.z - player.pos.z);
        if (d < 3.2) { player.carSpeed *= (1 - dt * 1.5); GameState.health -= dt * 2; }
      }
      // ped knockdown while driving
      const hit = peds.knockDown(player.pos, 2.6);
      if (hit) { raiseWanted(1, 'hit pedestrian'); hud.showToast('You hit a pedestrian!'); audio.crash(); }
    }

    // mission van: ramming stops it
    if (missions.currentStage() && missions.currentStage().type === 'ram' && player.inCar) {
      const d = Math.hypot(van.mesh.position.x - player.pos.x, van.mesh.position.z - player.pos.z);
      if (d < 4 && Math.abs(player.carSpeed) > 8) {
        van.hp -= 34; effects.burst(van.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff7a00, 10, 6, 0.35, 0.6);
        audio.crash(); player.carSpeed *= 0.4;
        if (van.hp <= 0 && !van.stopped) { van.stopped = true; hud.showToast('Van stopped! Grab the case'); raiseWanted(1, 'van heist'); }
      }
    }
    // escort car follows the player toward the target
    if (missions.current() && missions.current().title === 'THE BROKER' && missions.stage === 1) {
      const t = new THREE.Vector3(-180, 0, -200);
      const toT = t.clone().sub(escort.mesh.position); toT.y = 0;
      if (toT.length() > 6) {
        escort.mesh.rotation.y = Math.atan2(toT.x, toT.z);
        escort.mesh.position.addScaledVector(toT.normalize(), 9 * dt);
      }
    }
    // crates
    if (missions.currentStage() && missions.currentStage().type === 'collect') {
      for (const c of crates) {
        if (c.taken) continue;
        if (Math.hypot(c.mesh.position.x - player.pos.x, c.mesh.position.z - player.pos.z) < 3) {
          c.taken = true; c.mesh.visible = false; cratesCollected++;
          audio.coin(); hud.showToast(`Crate ${cratesCollected}/3 secured`);
        }
      }
    }
    // coins
    for (const c of coins) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 2;
      if (Math.hypot(c.mesh.position.x - player.pos.x, c.mesh.position.z - player.pos.z) < 2.5) {
        c.taken = true; c.mesh.visible = false; GameState.collectibles++;
        addMoney(SIDE_ACTIVITIES.collect.pay); audio.coin();
        hud.showToast(`Sun Coin ${GameState.collectibles}/30 — +$150`);
      }
    }
    // mission context
    missions.update(dt, {
      playerPos: player.pos, inCar: player.inCar,
      carType: player.car ? player.car.type : null,
      vanStopped: van.stopped,
      escortDead: escort.hp <= 0,
      escortNear: Math.hypot(escort.mesh.position.x - player.pos.x, escort.mesh.position.z - player.pos.z) < 25,
      cratesCollected,
    });

    // health
    if (GameState.health <= 0) wasted();

    // HUD
    hud.update(dt, {
      playerPos: player.pos,
      heading: player.heading,
      inCar: player.inCar,
      speedKmh: (player.inCar ? player.carSpeed : player.speed) * 3.6,
      carName: player.car ? player.car.spec.name : '',
      marker: missions.marker,
      cops: police.cops.map(c => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
      peds: peds.peds.filter(p => p.state !== 'down').slice(0, 40).map(p => ({ x: p.mesh.position.x, z: p.mesh.position.z })),
    });
    updateCamera(dt);
  } else {
    // menu idle camera: slow orbit over the city
    const a = elapsed * 0.05;
    camera.position.set(Math.cos(a) * 260, 120, Math.sin(a) * 260);
    camera.lookAt(0, 10, 0);
  }
  effects.update(dt);
  renderer.render(scene, camera);
}
animate();
window.__solmar = { GameState, missions, player, police };
