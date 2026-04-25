# Lancaster Night Raid Simulator

Single-page app and simulation engine for commanding an Avro Lancaster bomber on a World War II style night raid.

## What it simulates

- Outbound flight to target, target-zone hold, bombing run, and homebound leg.
- Fuel burn by throttle setting.
- Enemy contact and damage risk based on altitude and weather.
- Crew morale changes from combat stress and damage.
- Mission success/failure based on bombing objective and safe return.

## Run it

Open `index.html` in a browser.

## Controls

- **Throttle:** economy, cruise, maximum.
- **Altitude band:** low/medium/high with different threat tradeoffs.
- **Advance 10 minutes:** normal mission progression.
- **Evasive manoeuvres:** reduces hit chance, burns extra fuel.
- **Bomb target:** available only in the target zone.
- **Restart mission:** reset to a new run.

## Test

```bash
npm test
npm run test:soak
```
