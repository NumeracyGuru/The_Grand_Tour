# Gridiron FAC Solitaire

Offline-capable single-page app inspired by classic FAC-driven tabletop American football flow. It uses an original rules implementation with configurable behaviour and synthetic default data.

## Features

- Single-screen solitaire command centre with themed field view, score, quarter, clock, possession, down, distance, and yard line.
- Play resolution for run, pass, punt, field goal, and kickoff.
- Turnovers, scoring, penalties, possession changes, and quarter progression.
- Virtual Fast Action Card deck with draw/discard/reshuffle mechanics.
- Deterministic seeded behaviour in the engine.
- Entirely solitaire play: defence is always automated using situational logic plus coach-slider tendencies.
- JSON team data import/export plus LocalStorage season-slot save/load.
- Reducer-style pure game engine separated from UI rendering, with FAC card reveal panel and field-position ball marker.

## Run offline

Open `index.html` in your browser.

## Data import schema

Paste JSON with two teams:

```json
{
  "teams": [
    {
      "name": "Home",
      "ratings": {
        "offence": { "run": 60, "pass": 60, "qb": 60, "rb": 60, "wr": 60, "ol": 60 },
        "defence": { "run": 60, "pass": 60, "front": 60, "secondary": 60 },
        "special": { "kicker": 60, "punter": 60, "return": 60 },
        "tendencies": { "pass": 50, "aggression": 50, "blitz": 30, "clock": 50 }
      }
    },
    {
      "name": "Away",
      "ratings": {
        "offence": { "run": 60, "pass": 60, "qb": 60, "rb": 60, "wr": 60, "ol": 60 },
        "defence": { "run": 60, "pass": 60, "front": 60, "secondary": 60 },
        "special": { "kicker": 60, "punter": 60, "return": 60 },
        "tendencies": { "pass": 50, "aggression": 50, "blitz": 30, "clock": 50 }
      }
    }
  ]
}
```

## Test setup

```bash
npm test
npm run test:soak
```

`npm test` runs unit/invariant coverage, game-flow integration-like checks, and a short soak pass. `npm run test:soak` runs the dedicated 10,000-play soak test.

## Manual smoke checklist

- Start a new game.
- Resolve standard run/pass plays.
- Punt.
- Attempt field goal.
- Score touchdown and verify kickoff flow.
- Observe clock advance and quarter changes.
- Observe possession changes after turnover and turnover-on-downs.
- Export teams to JSON and re-import successfully.
- Save to LocalStorage season slot and load back.
