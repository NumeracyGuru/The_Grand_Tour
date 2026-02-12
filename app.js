/* Statis-style football simulator engine + UI (original implementation) */

const DEFAULT_RULESETS = {
  custom: {
    name: 'Custom',
    quarterLength: 900,
    playClockRunoff: { run: [20, 45], pass: [10, 30], special: [5, 20] },
    penaltyChance: 0.08,
    turnoverBoostOnBlitz: 0.03,
    allowBlitz: true,
  },
  third: {
    name: '3rd-style',
    quarterLength: 900,
    playClockRunoff: { run: [20, 40], pass: [10, 28], special: [5, 18] },
    penaltyChance: 0.07,
    turnoverBoostOnBlitz: 0.02,
    allowBlitz: true,
  },
  fifth: {
    name: '5th-style',
    quarterLength: 900,
    playClockRunoff: { run: [22, 44], pass: [10, 32], special: [5, 20] },
    penaltyChance: 0.09,
    turnoverBoostOnBlitz: 0.03,
    allowBlitz: true,
  },
};

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function makeFACDeck(seed = Date.now()) {
  const rng = mulberry32(seed);
  const fresh = () => Array.from({ length: 60 }, (_, i) => ({
    id: i,
    runPassKey: rng() < 0.48 ? 'run' : 'pass',
    direction: ['left', 'middle', 'right'][randInt(rng, 0, 2)],
    primary: randInt(rng, 1, 20),
    secondary: randInt(rng, 1, 20),
    bigPlay: rng() < 0.08,
    turnoverCheck: rng() < 0.1,
    penaltyCheck: rng() < 0.12,
  }));
  return { drawPile: fresh(), discardPile: [], seed };
}

function drawFAC(deck, rng) {
  if (deck.drawPile.length === 0) {
    deck.drawPile = deck.discardPile.splice(0);
    for (let i = deck.drawPile.length - 1; i > 0; i -= 1) {
      const j = randInt(rng, 0, i);
      [deck.drawPile[i], deck.drawPile[j]] = [deck.drawPile[j], deck.drawPile[i]];
    }
  }
  const card = deck.drawPile.pop();
  deck.discardPile.push(card);
  return card;
}

function defaultTeam(name) {
  return {
    name,
    ratings: {
      offence: { run: 60, pass: 60, qb: 60, rb: 60, wr: 60, ol: 60 },
      defence: { run: 60, pass: 60, front: 60, secondary: 60 },
      special: { kicker: 60, punter: 60, return: 60 },
      tendencies: { pass: 50, aggression: 50, blitz: 30, clock: 50 },
    },
  };
}

function createInitialState(options = {}) {
  const rulesetKey = options.ruleset || 'custom';
  const rules = DEFAULT_RULESETS[rulesetKey] || DEFAULT_RULESETS.custom;
  return {
    ruleset: rulesetKey,
    rules,
    rngSeed: options.seed ?? 12345,
    facDeck: makeFACDeck(options.seed ?? 12345),
    teams: options.teams || [defaultTeam('Home'), defaultTeam('Away')],
    possession: 0,
    defence: 1,
    score: [0, 0],
    quarter: 1,
    clock: rules.quarterLength,
    down: 1,
    distance: 10,
    yardLine: 25,
    driveStartYardLine: 25,
    gameOver: false,
    lastResult: null,
    log: [],
    driveLog: [],
    timeouts: [3, 3],
    history: [],
    awaitingKickoff: false,
  };
}

function cloneState(state) {
  return structuredClone(state);
}

function snapshotForUndo(state) {
  const snap = cloneState(state);
  snap.history = [];
  return snap;
}

function finaliseState(state) {
  if (state.log.length > 500) state.log = state.log.slice(-500);
  if (state.driveLog.length > 200) state.driveLog = state.driveLog.slice(-200);
  return state;
}

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function switchPossession(state, newYardLine = 100 - state.yardLine) {
  state.possession = 1 - state.possession;
  state.defence = 1 - state.defence;
  state.down = 1;
  state.distance = 10;
  state.yardLine = Math.min(99, Math.max(1, newYardLine));
  state.driveStartYardLine = state.yardLine;
  state.driveLog.push(`Drive ended. Possession to ${state.teams[state.possession].name}.`);
}

function scorePoints(state, team, points, reason) {
  state.score[team] += points;
  state.log.push(`${state.teams[team].name} score ${points} (${reason}).`);
  state.awaitingKickoff = true;
}

function randomRunoff(state, kind) {
  const rng = mulberry32((state.rngSeed += 1));
  const [min, max] = state.rules.playClockRunoff[kind];
  return randInt(rng, min, max);
}

function applyClock(state, kind) {
  state.clock -= randomRunoff(state, kind);
  while (state.clock <= 0 && !state.gameOver) {
    if (state.quarter >= 4) {
      state.clock = 0;
      state.gameOver = true;
      state.log.push('Full time.');
      break;
    }
    state.quarter += 1;
    state.clock += state.rules.quarterLength;
    state.log.push(`End Q${state.quarter - 1}. Start Q${state.quarter}.`);
  }
}

function firstDownOrScore(state) {
  if (state.yardLine >= 100) {
    scorePoints(state, state.possession, 6, 'touchdown');
    switchPossession(state, 35);
    return;
  }
  if (state.yardLine <= 0) {
    scorePoints(state, state.defence, 2, 'safety');
    switchPossession(state, 35);
    return;
  }
  if (state.distance <= 0) {
    state.down = 1;
    state.distance = Math.min(10, 100 - state.yardLine);
    state.driveLog.push('First down achieved.');
    return;
  }
  state.down += 1;
  if (state.down > 4) {
    state.log.push('Turnover on downs.');
    switchPossession(state);
  }
}

function resolvePenalty(state, yards, automaticFirstDown = false) {
  state.yardLine = Math.max(1, Math.min(99, state.yardLine + yards));
  state.log.push(`Penalty enforced: ${yards > 0 ? '+' : ''}${yards} yards.`);
  if (automaticFirstDown) {
    state.down = 1;
    state.distance = Math.min(10, 100 - state.yardLine);
  } else {
    state.distance = Math.max(1, state.distance - yards);
  }
}

function solitaireDefenceCall(state) {
  const longYardage = state.distance >= 8;
  const shortYardage = state.distance <= 2;
  const late = state.quarter >= 4 && state.clock < 180;
  if (late && state.score[state.possession] < state.score[state.defence]) return 'pass_focus';
  if (shortYardage) return 'run_focus';
  if (longYardage) return 'pass_focus';
  const rng = mulberry32((state.rngSeed += 1));
  const blitzBias = state.teams[state.defence]?.ratings?.tendencies?.blitz ?? 30;
  return rng() < (blitzBias / 200) ? 'blitz' : 'base';
}


function applyCoachSettings(state, settings = {}) {
  const team = state.teams[state.possession];
  const t = team.ratings.tendencies;
  if (typeof settings.aggression === 'number') t.aggression = settings.aggression;
  if (typeof settings.pass === 'number') t.pass = settings.pass;
  if (typeof settings.blitz === 'number') t.blitz = settings.blitz;
  if (typeof settings.clock === 'number') t.clock = settings.clock;
}

function resolvePlay(prevState, offenseCall, defenseCall = 'auto', facCard) {
  const state = cloneState(prevState);
  if (state.gameOver) return finaliseState(state);

  state.history.push(snapshotForUndo(prevState));
  if (state.history.length > 200) state.history.shift();

  if (state.awaitingKickoff && offenseCall.type !== 'kickoff') {
    offenseCall = { type: 'kickoff' };
  }

  const off = state.teams[state.possession].ratings;
  const def = state.teams[state.defence].ratings;
  const logPrefix = `Q${state.quarter} ${formatClock(state.clock)} ${state.teams[state.possession].name}`;

  if (offenseCall.type === 'kickoff') {
    const returnYards = Math.max(10, 25 + Math.floor((facCard.secondary - 10) * 1.2));
    state.awaitingKickoff = false;
    switchPossession(state, returnYards);
    applyClock(state, 'special');
    state.log.push(`${logPrefix} kickoff, returned to ${returnYards}.`);
    return finaliseState(state);
  }

  if (offenseCall.type === 'punt') {
    const gross = 35 + Math.floor((off.special.punter + facCard.primary - 60) / 2);
    const net = Math.max(20, gross - 5);
    const newLine = Math.max(1, 100 - (state.yardLine + net));
    applyClock(state, 'special');
    state.log.push(`${logPrefix} punt net ${net} yards.`);
    switchPossession(state, newLine);
    return finaliseState(state);
  }

  if (offenseCall.type === 'field_goal') {
    const distance = 117 - state.yardLine;
    const chance = Math.max(0.1, Math.min(0.95, (off.special.kicker + (55 - distance)) / 100));
    const made = facCard.primary / 20 <= chance;
    applyClock(state, 'special');
    if (made) {
      scorePoints(state, state.possession, 3, `field goal from ${distance}`);
      switchPossession(state, 35);
      state.log.push(`${logPrefix} field goal good (${distance} yards).`);
    } else {
      state.log.push(`${logPrefix} field goal missed (${distance} yards).`);
      switchPossession(state, Math.min(80, state.yardLine + 7));
    }
    return finaliseState(state);
  }

  if (defenseCall === 'auto') defenseCall = solitaireDefenceCall(state);
  if (defenseCall === 'blitz' && !state.rules.allowBlitz) defenseCall = 'pass_focus';

  const isRun = offenseCall.type === 'run';
  const attack = isRun ? off.offence.run + off.offence.rb : off.offence.pass + off.offence.qb + off.offence.wr;
  const resist = isRun ? def.defence.run + def.defence.front : def.defence.pass + def.defence.secondary;
  const matchup = (attack - resist) / 25;
  let yards = Math.floor(matchup + (facCard.primary - 10) / (isRun ? 1.7 : 1.4));

  if (!isRun && defenseCall === 'blitz') yards -= 2;
  if (isRun && defenseCall === 'run_focus') yards -= 2;
  if (!isRun && defenseCall === 'pass_focus') yards -= 2;
  if (facCard.bigPlay) yards += isRun ? 8 : 15;

  const turnoverChanceBase = isRun ? 0.02 : 0.04;
  const turnoverChance = turnoverChanceBase + (defenseCall === 'blitz' ? state.rules.turnoverBoostOnBlitz : 0);
  const turnoverRoll = facCard.turnoverCheck && facCard.secondary / 20 < turnoverChance;

  if (turnoverRoll) {
    applyClock(state, isRun ? 'run' : 'pass');
    if (!isRun && facCard.secondary <= 8) {
      state.log.push(`${logPrefix} intercepted.`);
      switchPossession(state, Math.max(1, 100 - state.yardLine + randInt(mulberry32(state.rngSeed += 1), -5, 15)));
    } else {
      state.log.push(`${logPrefix} fumble lost.`);
      switchPossession(state, Math.max(1, 100 - state.yardLine + randInt(mulberry32(state.rngSeed += 1), -3, 8)));
    }
    return finaliseState(state);
  }

  if (facCard.penaltyCheck && facCard.primary / 20 < state.rules.penaltyChance) {
    const offencePenalty = facCard.secondary <= 10;
    applyClock(state, isRun ? 'run' : 'pass');
    if (offencePenalty) {
      resolvePenalty(state, -10, false);
      state.log.push(`${logPrefix} offence penalty.`);
    } else {
      resolvePenalty(state, +5, facCard.secondary >= 18);
      state.log.push(`${logPrefix} defence penalty.`);
    }
    return finaliseState(state);
  }

  applyClock(state, isRun ? 'run' : 'pass');
  state.yardLine += yards;
  state.distance -= yards;
  state.log.push(`${logPrefix} ${isRun ? 'run' : 'pass'} for ${yards} yards (${defenseCall}).`);
  firstDownOrScore(state);
  return finaliseState(state);
}

function validateState(state) {
  const errors = [];
  if (state.down < 1 || state.down > 4) errors.push('Down out of range');
  if (state.distance < 1 || state.distance > 99) errors.push('Distance out of range');
  if (state.yardLine < 0 || state.yardLine > 100) errors.push('Yard line out of range');
  if (state.clock < 0) errors.push('Clock below zero');
  if (state.quarter < 1 || state.quarter > 4) errors.push('Quarter out of range');
  if (state.score.some((x) => x < 0)) errors.push('Negative score');
  return { valid: errors.length === 0, errors };
}

function defaultDataModel() {
  return {
    schemaVersion: 1,
    teams: [defaultTeam('Home'), defaultTeam('Away')],
  };
}

// UI wiring
if (typeof window !== 'undefined') {
  const el = {
    homeName: document.getElementById('homeName'),
    awayName: document.getElementById('awayName'),
    homeScore: document.getElementById('homeScore'),
    awayScore: document.getElementById('awayScore'),
    quarter: document.getElementById('quarter'),
    clock: document.getElementById('clock'),
    gameState: document.getElementById('gameState'),
    offenseCall: document.getElementById('offenseCall'),
    offenseDetail: document.getElementById('offenseDetail'),
    resolveBtn: document.getElementById('resolveBtn'),
    undoBtn: document.getElementById('undoBtn'),
    resetBtn: document.getElementById('resetBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    saveBtn: document.getElementById('saveBtn'),
    loadBtn: document.getElementById('loadBtn'),
    dataText: document.getElementById('dataText'),
    log: document.getElementById('log'),
    drive: document.getElementById('drive'),
    ruleset: document.getElementById('ruleset'),
    coachAggression: document.getElementById('coachAggression'),
    coachPass: document.getElementById('coachPass'),
    coachBlitz: document.getElementById('coachBlitz'),
    coachClock: document.getElementById('coachClock'),
    facView: document.getElementById('facView'),
    deckCount: document.getElementById('deckCount'),
    ballMarker: document.getElementById('ballMarker'),
  };

  let state = createInitialState();
  let rng = mulberry32(state.rngSeed);

  function render() {
    el.homeName.textContent = state.teams[0].name;
    el.awayName.textContent = state.teams[1].name;
    el.homeScore.textContent = state.score[0];
    el.awayScore.textContent = state.score[1];
    el.quarter.textContent = `Q${state.quarter}`;
    el.clock.textContent = formatClock(state.clock);
    el.gameState.textContent = `Solitaire mode | Possession: ${state.teams[state.possession].name} | ${state.down}&${state.distance} on ${state.yardLine}`;
    el.deckCount.textContent = state.facDeck.drawPile.length;
    el.ballMarker.style.left = `${state.yardLine}%`;
    el.log.innerHTML = state.log.slice(-50).map((line) => `<li>${line}</li>`).join('');
    el.drive.innerHTML = state.driveLog.slice(-10).map((line) => `<li>${line}</li>`).join('');
  }

  function currentOffenseCall() {
    const type = el.offenseCall.value;
    return { type, detail: el.offenseDetail.value };
  }

  function stepPlay() {
    applyCoachSettings(state, {
      aggression: Number(el.coachAggression.value),
      pass: Number(el.coachPass.value),
      blitz: Number(el.coachBlitz.value),
      clock: Number(el.coachClock.value),
    });
    const card = drawFAC(state.facDeck, rng);
    el.facView.innerHTML = `Run/Pass: <strong>${card.runPassKey}</strong><br/>Direction: <strong>${card.direction}</strong><br/>Primary: <strong>${card.primary}</strong> | Secondary: <strong>${card.secondary}</strong><br/>Big play: ${card.bigPlay ? 'Yes' : 'No'} | Turnover check: ${card.turnoverCheck ? 'Yes' : 'No'} | Penalty check: ${card.penaltyCheck ? 'Yes' : 'No'}`;
    state = resolvePlay(state, currentOffenseCall(), 'auto', card);
    const validity = validateState(state);
    if (!validity.valid) {
      console.error('Invalid state', validity.errors, state);
      alert(`Invalid state: ${validity.errors.join(', ')}`);
    }
    render();
  }

  el.resolveBtn.addEventListener('click', stepPlay);
  el.undoBtn.addEventListener('click', () => {
    if (state.history.length > 0) {
      state = state.history.pop();
      render();
    }
  });
  el.resetBtn.addEventListener('click', () => {
    state = createInitialState({ ruleset: el.ruleset.value });
    rng = mulberry32(state.rngSeed);
    render();
  });

  el.ruleset.addEventListener('change', () => {
    state.ruleset = el.ruleset.value;
    state.rules = DEFAULT_RULESETS[state.ruleset];
    render();
  });

  el.exportBtn.addEventListener('click', () => {
    el.dataText.value = JSON.stringify({ teams: state.teams }, null, 2);
  });
  el.importBtn.addEventListener('click', () => {
    try {
      const data = JSON.parse(el.dataText.value);
      if (!Array.isArray(data.teams) || data.teams.length !== 2) throw new Error('Need two teams');
      state.teams = data.teams;
      render();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });
  el.saveBtn.addEventListener('click', () => {
    localStorage.setItem('statis-season-slot-1', JSON.stringify(state));
  });
  el.loadBtn.addEventListener('click', () => {
    const raw = localStorage.getItem('statis-season-slot-1');
    if (!raw) return;
    state = JSON.parse(raw);
    rng = mulberry32(state.rngSeed);
    render();
  });

  render();
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_RULESETS,
    mulberry32,
    makeFACDeck,
    drawFAC,
    createInitialState,
    resolvePlay,
    validateState,
    solitaireDefenceCall,
    defaultDataModel,
    applyCoachSettings,
  };
}
