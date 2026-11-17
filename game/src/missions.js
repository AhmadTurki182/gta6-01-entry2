// missions.js — the 3-day story: 9 multi-stage missions + 4 side activities.
// Each mission is a list of stages; a stage completes by reaching a marker,
// stealing/delivering a vehicle, eliminating a target, or surviving a timer.
// Branching: several missions offer a STEALTH or FRONTAL approach choice.
// All stage markers sit ON roads (road centres are spaced 44 units apart),
// so the yellow beacon is always reachable by car or on foot.
import { GameState, addMoney, addRep, raiseWanted, setWanted } from './state.js';

export const MISSIONS = [
  { day: 1, title: 'THE CALL', brief: 'Mara calls from the Marina. Your old sedan is waiting — but the lot is watched. Get the car, lose the tail.',
    stages: [
      { type: 'goto', text: 'Reach your sedan at the Marina', pos: [-176, -240], radius: 8 },
      { type: 'enterCar', text: 'Get in your sedan (E)', radius: 6 },
      { type: 'goto', text: 'Drive to the Neon Strip safehouse', pos: [176, 132], radius: 10, wanted: 1 },
      { type: 'goto', text: 'Park inside the safehouse garage', pos: [176, 176], radius: 8 },
    ], reward: 800 },
  { day: 1, title: 'BORROWED WHEELS', brief: 'The broker needs a Vortex GT. Steal one from the Downtown showroom — quietly, or loudly. Your call.',
    stages: [
      { type: 'choice', text: 'Choose your approach: STEALTH (walk in, no alarm) or FRONTAL (smash in, 2 stars)', options: ['STEALTH', 'FRONTAL'] },
      { type: 'steal', vehicle: 'sports', text: 'Steal the Vortex GT from the showroom', pos: [44, 36], radius: 9 },
      { type: 'goto', text: 'Deliver the GT to the Docks chop shop', pos: [-176, 176], radius: 10 },
    ], reward: 1500 },
  { day: 1, title: 'FIRST SCORE', brief: 'A courier van carries the week\'s take. Intercept it on the Strip, grab the case, and vanish before the SBP arrives.',
    stages: [
      { type: 'goto', text: 'Intercept the courier van on the Strip', pos: [132, 88], radius: 12 },
      { type: 'ram', text: 'Ram the van until it stops', radius: 10 },
      { type: 'goto', text: 'Grab the case and reach the Old Town hideout', pos: [132, -132], radius: 10, wanted: 2 },
    ], reward: 2200 },
  { day: 2, title: 'THE BROKER', brief: 'Meet "The Broker" at the lighthouse. He has work — and a warning. The SBP has your plate.',
    stages: [
      { type: 'goto', text: 'Meet the Broker at the lighthouse', pos: [220, -264], radius: 9 },
      { type: 'escort', text: 'Escort the Broker\'s car to the Marina — keep it alive', pos: [-176, -176], radius: 12 },
      { type: 'survive', text: 'Survive the ambush — lose the hitmen', seconds: 45, wanted: 2 },
    ], reward: 2500 },
  { day: 2, title: 'HARBOR LIGHTS', brief: 'A shipment lands at the Docks at midnight. Two crews want it. Take it first, and choose who you cross.',
    stages: [
      { type: 'goto', text: 'Reach the Docks warehouse', pos: [-220, 198], radius: 10 },
      { type: 'choice', text: 'The dock crew is armed. STEALTH: slip in the back. FRONTAL: take them down.', options: ['STEALTH', 'FRONTAL'] },
      { type: 'collect', text: 'Collect 3 crates from the warehouse', pos: [-220, 198], radius: 14, count: 3 },
      { type: 'goto', text: 'Deliver the crates to the safehouse', pos: [176, 176], radius: 10, wanted: 3 },
    ], reward: 3200 },
  { day: 2, title: 'THE LONG WAY HOME', brief: 'The SBP set a trap on the Strip. Three stars, roadblocks ahead, and a helicopter overhead. Just get home.',
    stages: [
      { type: 'goto', text: 'Escape the Strip — head for the Hills', pos: [-44, 220], radius: 12, wanted: 3 },
      { type: 'escape', text: 'Lose the police — stay unseen until the heat dies', seconds: 40 },
      { type: 'goto', text: 'Reach the Hills safehouse', pos: [-176, 220], radius: 10 },
    ], reward: 2800 },
  { day: 3, title: 'THE VAULT', brief: 'The plan: the Solmar Bank vault, dawn, one crew. Get in through the garage, crack it, and get out clean.',
    stages: [
      { type: 'goto', text: 'Reach the bank garage, Downtown', pos: [22, 22], radius: 10 },
      { type: 'timed', text: 'Crack the vault — hold the garage for 30 seconds', seconds: 30, wanted: 3 },
      { type: 'goto', text: 'Grab the loot and reach the getaway car', pos: [44, 66], radius: 9 },
    ], reward: 6000 },
  { day: 3, title: 'THE GETAWAY', brief: 'Five stars. Every cop in Solmar Bay is coming. The marina boat leaves at sunrise — be on it.',
    stages: [
      { type: 'goto', text: 'Reach the Marina pier — 5 stars, no stopping', pos: [-176, -264], radius: 12, wanted: 5 },
      { type: 'survive', text: 'Hold the pier until the boat arrives', seconds: 35, wanted: 5 },
    ], reward: 8000 },
  { day: 3, title: 'SUNRISE', brief: 'One last drive. The boat is gone, the city is waking up, and Lena Marlowe is finally free — if she can reach the Hills overlook by sunrise.',
    stages: [
      { type: 'goto', text: 'Drive to the Hills overlook', pos: [-220, 220], radius: 12 },
      { type: 'goto', text: 'Watch the sunrise over Solmar Bay', pos: [-220, 264], radius: 8 },
    ], reward: 5000 },
];

export const SIDE_ACTIVITIES = {
  taxi: { name: 'Bay Cab', text: 'Pick up the fare (yellow marker) and drop them off fast. Tip for speed.', pay: 350 },
  vigilante: { name: 'Vigilante', text: 'A street racer is fleeing — ram their car to a stop before they escape.', pay: 500 },
  race: { name: 'Street Time Trial', text: 'Hit all 4 checkpoints before the clock runs out.', pay: 600 },
  collect: { name: 'Sun Coins', text: '30 golden coins are hidden around Solmar Bay. Find them all.', pay: 150 },
};

export class MissionManager {
  constructor() {
    this.stage = 0;
    this.stageT = 0;
    this.stageCount = 0;
    this.approach = null; // 'STEALTH' | 'FRONTAL'
    this.activeSide = null; // {kind, stage, t, ...}
    this.marker = null; // {x,z} current objective position
    this.done = false;
    this.onEvent = null; // (type, data) -> main (toast, sounds, wanted)
  }
  current() { return MISSIONS[GameState.missionIndex] || null; }
  currentStage() {
    const m = this.current();
    return m ? m.stages[this.stage] : null;
  }
  startMission(i) {
    GameState.missionIndex = i;
    this.stage = 0; this.stageT = 0; this.stageCount = 0; this.approach = null;
    this.updateMarker();
    const m = this.current();
    if (m) GameState.day = m.day;
    this.emit('missionStart', { mission: m });
  }
  emit(type, data) { if (this.onEvent) this.onEvent(type, data); }
  updateMarker() {
    const s = this.currentStage();
    this.marker = s && s.pos ? { x: s.pos[0], z: s.pos[1] } : null;
  }
  completeStage() {
    const m = this.current();
    this.stage++;
    this.stageT = 0; this.stageCount = 0;
    if (this.stage >= m.stages.length) { this.completeMission(); return; }
    this.updateMarker();
    this.emit('stage', { stage: this.currentStage() });
  }
  completeMission() {
    const m = this.current();
    addMoney(m.reward); addRep(8);
    GameState.missionsDone.push(m.title);
    this.emit('missionComplete', { mission: m });
    if (GameState.missionIndex + 1 >= MISSIONS.length) {
      GameState.storyComplete = true;
      this.done = true;
      this.marker = null;
      this.emit('storyComplete', {});
      return;
    }
    this.startMission(GameState.missionIndex + 1);
  }
  failMission(reason) {
    this.emit('missionFailed', { reason });
    this.startMission(GameState.missionIndex); // retry the same mission
  }
  // Called every frame with live context from main.js
  update(dt, ctx) {
    if (GameState.freeRoam || this.done) return;
    const s = this.currentStage();
    if (!s) return;
    this.stageT += dt;
    const px = ctx.playerPos.x, pz = ctx.playerPos.z;
    const distTo = (pos) => Math.hypot(px - pos[0], pz - pos[1]);
    switch (s.type) {
      case 'goto':
        if (s.wanted && GameState.wanted < s.wanted) raiseWanted(s.wanted - GameState.wanted, 'mission');
        if (distTo(s.pos) < s.radius) this.completeStage();
        break;
      case 'enterCar':
        if (ctx.inCar) this.completeStage();
        break;
      case 'steal':
        if (ctx.inCar && ctx.carType === s.vehicle) this.completeStage();
        break;
      case 'ram':
        if (ctx.vanStopped) this.completeStage();
        break;
      case 'escort':
        if (ctx.escortDead) { this.failMission('The Broker\'s car was destroyed.'); return; }
        if (distTo(s.pos) < s.radius && ctx.escortNear) this.completeStage();
        break;
      case 'collect':
        if (ctx.cratesCollected >= (s.count || 3)) this.completeStage();
        break;
      case 'survive':
        if (s.wanted) raiseWanted(0, '');
        if (this.stageT >= s.seconds && GameState.wanted <= 1) this.completeStage();
        break;
      case 'escape':
        if (this.stageT >= s.seconds && GameState.wanted === 0) this.completeStage();
        break;
      case 'timed':
        if (this.stageT >= s.seconds) this.completeStage();
        break;
      case 'choice':
        // Choice is made via HUD buttons (main calls chooseApproach)
        break;
    }
  }
  chooseApproach(choice) {
    const s = this.currentStage();
    if (!s || s.type !== 'choice') return;
    this.approach = choice;
    if (choice === 'FRONTAL') raiseWanted(2, 'frontal approach');
    this.emit('approach', { choice });
    this.completeStage();
  }
  // --- Side activities ---
  startSide(kind, ctx) {
    this.activeSide = { kind, stage: 0, t: 0, checkpoints: 0, target: null };
    const def = SIDE_ACTIVITIES[kind];
    this.emit('sideStart', { kind, def });
    return this.activeSide;
  }
  completeSide() {
    if (!this.activeSide) return;
    const def = SIDE_ACTIVITIES[this.activeSide.kind];
    addMoney(def.pay); addRep(2);
    GameState.sideDone[this.activeSide.kind] = (GameState.sideDone[this.activeSide.kind] || 0) + 1;
    this.emit('sideComplete', { kind: this.activeSide.kind, def });
    this.activeSide = null;
  }
}
