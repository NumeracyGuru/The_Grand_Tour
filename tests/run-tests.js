const assert = require('assert');
const {
  createMissionState,
  applyFlightStep,
  validateState,
  formatMissionClock,
} = require('../app.js');

function testClock() {
  assert.equal(formatMissionClock(0), '00:00');
  assert.equal(formatMissionClock(85), '01:25');
}

function testOutboundMovement() {
  const s = createMissionState({ seed: 11, distanceToTarget: 180 });
  const next = applyFlightStep(s, { throttle: 'maximum', altitudeBand: 'medium' });
  assert(next.distanceToTarget < 180);
  assert(next.fuel < 100);
}

function testBombTransitionsToHomebound() {
  let s = createMissionState({ seed: 4, distanceToTarget: 1 });
  s = applyFlightStep(s, { throttle: 'cruise', altitudeBand: 'medium' });
  assert.equal(s.phase, 'target_zone');
  const bombed = applyFlightStep(s, { throttle: 'cruise', altitudeBand: 'medium' }, { forceBomb: true });
  assert.equal(bombed.phase, 'homebound');
  assert.equal(bombed.bombLoad, 0);
}

function testValidation() {
  const s = createMissionState({ seed: 2 });
  const stepped = applyFlightStep(s, { throttle: 'economy', altitudeBand: 'high' });
  const valid = validateState(stepped);
  assert.equal(valid.valid, true, valid.errors.join(', '));
}

function soak() {
  for (let i = 0; i < 200; i += 1) {
    let state = createMissionState({ seed: 100 + i, distanceToTarget: 120 });
    for (let turn = 0; turn < 90 && !state.gameOver; turn += 1) {
      const throttles = ['economy', 'cruise', 'maximum'];
      const bands = ['low', 'medium', 'high'];
      const throttle = throttles[(turn + i) % throttles.length];
      const altitudeBand = bands[(turn + i * 2) % bands.length];
      const forceBomb = state.phase === 'target_zone' && state.bombLoad > 0;
      state = applyFlightStep(state, { throttle, altitudeBand, evasive: turn % 5 === 0 }, { forceBomb });
      const valid = validateState(state);
      assert.equal(valid.valid, true, `seed ${i} turn ${turn}: ${valid.errors.join(', ')}`);
    }
    assert(state.gameOver, 'mission should conclude within 90 turns');
  }
}

function run() {
  const tests = [testClock, testOutboundMovement, testBombTransitionsToHomebound, testValidation, soak];
  tests.forEach((t) => {
    t();
    console.log(`PASS ${t.name}`);
  });
  console.log('All tests passed.');
}

run();
