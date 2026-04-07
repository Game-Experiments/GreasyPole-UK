# Greasy Pole: UK Edition

A high-fidelity historical simulation of the British Civil Service during the transitionary period of **1890 to 1920**.

## Overview

*Greasy Pole: UK Edition* places the player in the role of an aspiring administrator navigating the labyrinthine corridors of Whitehall, where they must balance the rigid requirements of the state with the fluid, often treacherous expectations of the London social elite.

The title is derived from Benjamin Disraeli's assessment of his own political ascent — the climb to the top of the British state is characterised by slipperiness, competition, and the constant threat of a precipitous fall.

## How to Play

Open `index.html` in a modern web browser. For best results, serve it via a local HTTP server:

```bash
python3 -m http.server 8080
```

Then navigate to `http://localhost:8080`.

## Gameplay

### Character Creation
Select your **entry pathway**, **social background**, and **education** to establish starting statistics and wealth.

| Entry Pathway | Age | Starting Rank | Wealth |
|---|---|---|---|
| First Division (Class I) | 22 | Junior Clerk | Medium–High |
| Second Division | 17–19 | Junior Clerk | Low–Medium |
| Special Appointment | 25–30 | Senior Clerk | Variable |

### Core Statistics
Four primary values govern your career:

- **Performance** — Efficiency in administrative tasks. Required for merit-based promotion.
- **Relations** — Rapport with peers, seniors, and ministers. Protects against administrative errors.
- **Record** — Adherence to official codes. Falls with corruption; protects against scandal.
- **Reputation** — Social standing in London society. Maintained through etiquette and club life.

### Turn System
Each turn is one **Season** (Spring, Summer, Autumn, Winter). Four seasons make one year. Each season you have **energy** to spend on actions.

Energy cost formula: `Energy_Spent = BaseCost × (1 + StressLevel / 100)`

### Actions
Choose from:
- **Administrative** — Draft Minutes, Index Ledgers, Cypher Despatches, Supervise Typewriters, Study Policy Files
- **Social** — Club Attendance, Afternoon Tea (Summer), Host a Dinner, Country House Weekend
- **Corruption** — The Tobacco Box, Treating, Influence Peddling *(risk: Record & Heat penalties)*
- **Personal** — Rest and Recuperation

### Promotion
Every Winter, an annual **Scrutiny Phase** evaluates your career:

```
MeritScore = (0.5 × Performance) + (0.3 × Relations) + (0.2 × Reputation)
```

If your Record falls below 20, scandal strikes regardless of merit. If Heat exceeds your Record, you face arrest.

### Historical Events
Fixed events fire at their historical dates (Queen Victoria's death, Liberal Landslide, Great War, etc.). Random procedural events create ongoing narrative challenges.

### Rank Structure

| Rank | Salary (£/yr) | Promotion Threshold |
|---|---|---|
| Junior Clerk (Class I) | 200 | 55 |
| Senior Clerk | 600 | 65 |
| Principal Clerk | 850 | 74 |
| Assistant Under-Secretary | 1,200 | 83 |
| Permanent Secretary | 2,000 | — |

### Saving
Use the **Save Game** button to save to one of three slots (plus autosave). Data is stored in browser LocalStorage.

## Repository Structure

```
/data                   — JSON data files
  ranks.json            — Rank hierarchy and promotion thresholds
  events.json           — Fixed historical and procedural random events
  education_tiers.json  — School and university definitions
  etiquette_rules.json  — Etiquette rules and social conventions

/src/engine             — Core simulation logic
  stat_manager.js       — Stat modification, energy cost, merit score
  scrutiny_logic.js     — Annual promotion/scandal/arrest evaluation
  turn_manager.js       — Seasonal cycles, events, action definitions

/src/ui                 — User interface modules
  dashboard.js          — DOM rendering; parchment-style dashboard
  interaction_handler.js — Player input and action resolution

/src/persistence        — Save/load system
  save_system.js        — LocalStorage serialisation

index.html              — Main entry point
style.css               — Parchment-style 1900s aesthetic
```

## Technical Notes

- Pure HTML/CSS/JavaScript — no build step, no dependencies
- Global namespace pattern for browser compatibility (no ES modules required)
- All JSON data files loaded via `fetch()` with inline fallbacks for `file://` access
- Save data stored as JSON in browser LocalStorage

## Historical Context

The simulation encapsulates the **Northcote-Trevelyan model** of permanent, neutral, anonymous officials, set against the reality of the late Victorian and Edwardian service where the "gifted amateur" with a classical Oxbridge education held a distinct advantage, and the temptations of "Old Corruption" persisted beneath the surface of meritocratic reform.
