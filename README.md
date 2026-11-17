[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/AhmadTurki182/gta6-01-entry2/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/AhmadTurki182/gta6-01-entry2/reward.svg)](https://make.fun/bounty/gta6-01)

# SOLMAR: Three Days

An open-world crime game in the spirit of GTA 6, built with three.js — no Rockstar
names, characters, maps, or assets. Everything is original: the city of **Solmar Bay**,
the driver **Lena "Vex" Marlowe**, and a three-day story.

## The story

Day 1 — **The Call**: a debt, a stolen sedan, a first score.
Day 2 — **The Broker**: a midnight shipment at the Docks and a police trap on the Strip.
Day 3 — **The Vault**: the Solmar Bank job, a five-star getaway, and one last sunrise.

Nine multi-stage story missions with stealth-or-frontal approach choices, plus side
work: taxi fares, vigilante takedowns, street time trials, and 30 hidden Sun Coins.

## What makes the police smart

- **Roadblocks** form ahead of you at 3+ stars; **spike strips** at 4+.
- Cops **PIT-manoeuvre** alongside your car, **flank** across side streets at 5 stars,
  and a **helicopter with a searchlight** joins at 4–5 stars.
- Lose them and they switch to **SEARCH mode**, sweeping your last known area —
  stay unseen and your wanted level decays.
- Traffic **brakes for you** and **pulls over for sirens**; pedestrians **flee gunfire**
  and **report crimes** they witness; enemies take **cover and flank**.

## Systems

- On foot and in 6 vehicle classes with distinct handling (sedan, taxi, sports, muscle, van, truck)
- Wanted 0–5 stars, money, reputation, heat, day/night cycle, economy (missions pay, cars cost)
- HUD with circular minimap, mission objectives, health/armor, speed
- 3 procedural radio stations + engine, siren, gunshot and crash sounds (WebAudio, synthesized live)
- Save/load via localStorage, start screen, pause menu

## How to play

Serve `game/` with any static server (e.g. `node serve.ts`) and open
http://localhost:8080 in desktop Chrome.

- **WASD** move / drive · **SHIFT** sprint · **SPACE** handbrake
- **E** enter or steal a car · **Mouse** aim, **Click** shoot · **1/2** fists / pistol
- **R** radio station · **C** camera · **M** toggle mission marker · **ESC** pause

## License

MIT — see [LICENSE](LICENSE).
