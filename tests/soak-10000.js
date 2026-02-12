const assert = require('assert');
const { createInitialState, resolvePlay, validateState, drawFAC, mulberry32 } = require('../app.js');

let state = createInitialState({ seed: 123 });
const rng = mulberry32(123);
const calls = ['run', 'pass', 'punt', 'field_goal'];

for (let i = 0; i < 10000; i += 1) {
  if (state.gameOver) state = createInitialState({ seed: 123 + i });
  state.history = [];
  if (state.log.length > 20) state.log = state.log.slice(-20);
  if (state.driveLog.length > 10) state.driveLog = state.driveLog.slice(-10);
  const type = calls[Math.floor(rng() * calls.length)];
  const def = ['auto', 'base', 'run_focus', 'pass_focus', 'blitz'][Math.floor(rng() * 5)];
  const card = drawFAC(state.facDeck, rng);
  state = resolvePlay(state, { type }, def, card);
  const validation = validateState(state);
  assert.equal(validation.valid, true, `Invalid at play ${i}: ${validation.errors.join(', ')}`);
}

console.log('PASS soak-10000');
