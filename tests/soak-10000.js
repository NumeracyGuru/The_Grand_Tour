const assert = require('assert');
const { createMissionState, applyFlightStep, validateState } = require('../app.js');

for (let i = 0; i < 1000; i += 1) {
  let state = createMissionState({ seed: 3000 + i, distanceToTarget: 140 });
  for (let turn = 0; turn < 75 && !state.gameOver; turn += 1) {
    const forceBomb = state.phase === 'target_zone' && state.bombLoad > 0 && (turn % 2 === 0);
    state = applyFlightStep(state, {
      throttle: ['economy', 'cruise', 'maximum'][turn % 3],
      altitudeBand: ['low', 'medium', 'high'][(turn + i) % 3],
      evasive: turn % 4 === 0,
    }, { forceBomb });

    const valid = validateState(state);
    assert.equal(valid.valid, true, `Invalid at mission ${i}, turn ${turn}: ${valid.errors.join(', ')}`);
  }
  assert(state.gameOver, `Mission ${i} did not finish`);
}

console.log('PASS soak-1000-missions');
