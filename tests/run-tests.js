const assert = require('assert');
const {
  mulberry32,
  makeFACDeck,
  drawFAC,
  createInitialState,
  resolvePlay,
  validateState,
} = require('../app.js');

function testDownDistance() {
  const state = createInitialState({ seed: 7 });
  const card = { primary: 20, secondary: 20, bigPlay: false, turnoverCheck: false, penaltyCheck: false };
  const next = resolvePlay(state, { type: 'run' }, 'base', card);
  assert.equal(next.down, 2);
  assert(next.distance <= 10);
}

function testScoring() {
  const s = createInitialState({ seed: 8 });
  s.yardLine = 95;
  s.distance = 5;
  const card = { primary: 20, secondary: 20, bigPlay: true, turnoverCheck: false, penaltyCheck: false };
  const next = resolvePlay(s, { type: 'pass' }, 'base', card);
  assert(next.score[0] >= 6);
}

function testTurnover() {
  const s = createInitialState({ seed: 9 });
  const card = { primary: 10, secondary: 1, bigPlay: false, turnoverCheck: true, penaltyCheck: false };
  const next = resolvePlay(s, { type: 'pass' }, 'blitz', card);
  assert.equal(next.possession, 1);
}

function testClockRunoff() {
  const s = createInitialState({ seed: 10 });
  const card = { primary: 10, secondary: 10, bigPlay: false, turnoverCheck: false, penaltyCheck: false };
  const next = resolvePlay(s, { type: 'run' }, 'base', card);
  assert(next.clock < s.clock);
}

function testDeckReshuffle() {
  const rng = mulberry32(1);
  const deck = makeFACDeck(3);
  for (let i = 0; i < 61; i += 1) drawFAC(deck, rng);
  assert(deck.discardPile.length > 0);
}

function testInvariant() {
  const s = createInitialState({ seed: 11 });
  const card = { primary: 20, secondary: 20, bigPlay: false, turnoverCheck: false, penaltyCheck: false };
  const next = resolvePlay(s, { type: 'run' }, 'base', card);
  const valid = validateState(next);
  assert.equal(valid.valid, true, valid.errors.join(', '));
}

function soak() {
  let state = createInitialState({ seed: 123 });
  const rng = mulberry32(123);
  const calls = ['run', 'pass', 'punt', 'field_goal'];
  for (let i = 0; i < 2000; i += 1) {
    if (state.gameOver) state = createInitialState({ seed: 123 + i });
    const type = calls[Math.floor(rng() * calls.length)];
    const def = ['auto', 'base', 'run_focus', 'pass_focus', 'blitz'][Math.floor(rng() * 5)];
    const card = drawFAC(state.facDeck, rng);
    state = resolvePlay(state, { type }, def, card);
    const validation = validateState(state);
    assert.equal(validation.valid, true, `Invalid at play ${i}: ${validation.errors.join(', ')}`);
  }
}

function integrationLike() {
  let state = createInitialState({ seed: 222 });
  const rng = mulberry32(222);
  for (let i = 0; i < 20; i += 1) {
    const card = drawFAC(state.facDeck, rng);
    state = resolvePlay(state, { type: 'run' }, 'auto', card);
  }
  assert(state.log.length > 0);
}

function run() {
  const tests = [
    testDownDistance,
    testScoring,
    testTurnover,
    testClockRunoff,
    testDeckReshuffle,
    testInvariant,
    integrationLike,
    soak,
  ];
  tests.forEach((t) => {
    t();
    console.log(`PASS ${t.name}`);
  });
  console.log('All tests passed.');
}

run();
