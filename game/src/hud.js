// hud.js — HUD, minimap, menus, toasts, mission cards.
// The minimap draws roads, districts, the player, police, peds and the objective.
import { GameState, clockString, dayPart } from './state.js';
import { roadCoords, CITY, districtAt } from './city.js';

export class HUD {
  constructor() {
    this.el = {
      wanted: document.getElementById('wanted'),
      clock: document.getElementById('clock'),
      money: document.getElementById('money'),
      objective: document.getElementById('objective'),
      radio: document.getElementById('radio'),
      weapon: document.getElementById('weapon'),
      hpfill: document.getElementById('hpfill'),
      hplbl: document.getElementById('hplbl'),
      speed: document.getElementById('speed'),
      toast: document.getElementById('toast'),
      hint: document.getElementById('hint'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),
      missioncard: document.getElementById('missioncard'),
      minimap: document.getElementById('minimap'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.toastT = 0;
    this.roads = roadCoords();
  }
  showToast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.toastT = seconds;
  }
  setObjective(day, title, text, sub) {
    this.el.objective.innerHTML =
      `<div class="day">DAY ${day} — ${title}</div><div class="text">${text}</div><div class="sub">${sub || ''}</div>`;
  }
  setRadio(name) { this.el.radio.textContent = '♪ ' + name; }
  setWeapon(name, ammo) {
    this.el.weapon.textContent = ammo != null ? `${name} · ${ammo} AMMO` : name;
  }
  showMissionCard(title, text, cb) {
    document.getElementById('mcTitle').textContent = title;
    document.getElementById('mcText').textContent = text;
    this.el.missioncard.style.display = 'flex';
    const btn = document.getElementById('btnMcOk');
    btn.onclick = () => { this.el.missioncard.style.display = 'none'; if (cb) cb(); };
  }
  update(dt, ctx) {
    // wanted stars
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="${i < GameState.wanted ? 'lit' : 'dim'}">★</span>`;
    this.el.wanted.innerHTML = stars;
    this.el.clock.innerHTML = `${clockString()}<small>SOLMAR BAY &middot; DAY ${GameState.day} &middot; ${dayPart()}</small>`;
    const heat = GameState.heat < 25 ? 'LOW' : GameState.heat < 60 ? 'WARM' : 'HOT';
    this.el.money.innerHTML = `$${GameState.money.toLocaleString()}<small>REP ${GameState.rep} &middot; HEAT ${heat} &middot; ${districtAt(ctx.playerPos.x, ctx.playerPos.z)}</small>`;
    this.el.hpfill.style.width = Math.max(0, GameState.health) + '%';
    this.el.hplbl.textContent = `HEALTH ${Math.max(0, Math.round(GameState.health))} · ARMOR ${GameState.armor} · ${ctx.inCar ? ctx.carName : 'ON FOOT'}`;
    this.el.speed.innerHTML = ctx.inCar ? `${Math.round(Math.abs(ctx.speedKmh))}<small>KM/H · ${ctx.carName.toUpperCase()}</small>` : `—<small>ON FOOT</small>`;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.textContent = ''; }
    this.drawMinimap(ctx);
  }
  drawMinimap(ctx) {
    const g = this.mm, S = 168, C = S / 2;
    const scale = S / (CITY.half * 2 + 60);
    const px = (x) => C + (x - ctx.playerPos.x) * scale * 2.2;
    const pz = (z) => C + (z - ctx.playerPos.z) * scale * 2.2;
    g.clearRect(0, 0, S, S);
    // sea + land
    g.fillStyle = '#0a2438'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#1a2f22';
    g.beginPath(); g.arc(C, C, S / 2, 0, Math.PI * 2); g.fill();
    // roads
    g.strokeStyle = '#5a6270'; g.lineWidth = 3;
    for (const r of this.roads) {
      g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), S); g.stroke();
      g.beginPath(); g.moveTo(0, pz(r)); g.lineTo(S, pz(r)); g.stroke();
    }
    // objective marker (pulsing yellow)
    if (ctx.marker) {
      const mx = px(ctx.marker.x), mz = pz(ctx.marker.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(mx, mz, pulse + 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1030'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('!', mx, mz);
    }
    // police (blue/red dots)
    g.fillStyle = '#3a7dff';
    for (const c of ctx.cops || []) { g.beginPath(); g.arc(px(c.x), pz(c.z), 3.5, 0, Math.PI * 2); g.fill(); }
    // peds (tiny white dots)
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (const p of ctx.peds || []) { g.fillRect(px(p.x) - 1, pz(p.z) - 1, 2, 2); }
    // player arrow (rotating with heading)
    g.save();
    g.translate(C, C); g.rotate(ctx.heading);
    g.fillStyle = '#37e08b';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill();
    g.restore();
    // north tick
    g.fillStyle = '#fff'; g.font = 'bold 10px Arial'; g.textAlign = 'center';
    g.fillText('N', C, 12);
  }
}
