// state.js — central game state: money, reputation, heat, wanted, save/load.
// SOLMAR: Three Days. All progress lives here so every system reads one truth.
export const SAVE_KEY = 'solmar-three-days-save-v1';

export const GameState = {
  money: 1250,
  rep: 12,            // 0..100 street reputation
  heat: 0,            // 0..100 long-term police attention
  wanted: 0,          // 0..5 stars, live
  health: 100,
  armor: 0,
  day: 1,
  missionIndex: 0,    // 0..8 story missions, 9 = story complete
  missionsDone: [],
  sideDone: { taxi: 0, vigilante: 0, race: 0, collect: 0 },
  collectibles: 0,
  carsOwned: ['sedan'],
  timeMinutes: 16 * 60 + 30, // 16:30 day 1, golden afternoon
  kills: 0,
  carsStolen: 0,
  chasesEscaped: 0,
  weapon: 1,          // 1 fists, 2 pistol
  ammo: 24,
  freeRoam: false,
  storyComplete: false,
};

export function addMoney(n) { GameState.money = Math.max(0, GameState.money + n); }
export function addRep(n) { GameState.rep = Math.max(0, Math.min(100, GameState.rep + n)); }
export function addHeat(n) { GameState.heat = Math.max(0, Math.min(100, GameState.heat + n)); }

export function setWanted(n, reason) {
  const before = GameState.wanted;
  GameState.wanted = Math.max(0, Math.min(5, n));
  if (GameState.wanted > before) addHeat(GameState.wanted * 2);
  return GameState.wanted;
}
export function raiseWanted(n, reason) { return setWanted(GameState.wanted + n, reason); }

export function clockString() {
  const h = Math.floor(GameState.timeMinutes / 60) % 24;
  const m = Math.floor(GameState.timeMinutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function dayPart() {
  const h = Math.floor(GameState.timeMinutes / 60) % 24;
  if (h >= 6 && h < 12) return 'MORNING';
  if (h >= 12 && h < 17) return 'AFTERNOON';
  if (h >= 17 && h < 20) return 'GOLDEN HOUR';
  if (h >= 20 || h < 5) return 'NIGHT';
  return 'DAWN';
}

export function saveGame() {
  try {
    const s = { ...GameState, missionsDone: [...GameState.missionsDone], sideDone: { ...GameState.sideDone }, carsOwned: [...GameState.carsOwned] };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch (e) { return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    Object.assign(GameState, s);
    GameState.wanted = 0;
    return true;
  } catch (e) { return false; }
}
export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
export function resetSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}
