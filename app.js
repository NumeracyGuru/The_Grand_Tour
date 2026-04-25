const THROTTLE_MODELS = {
  economy: { speed: 10, fuelBurn: 2 },
  cruise: { speed: 14, fuelBurn: 3.5 },
  maximum: { speed: 18, fuelBurn: 5.25 },
};

const ALTITUDE_MODELS = {
  low: { feet: 8000, flakRisk: 0.2, fighterRisk: 0.11 },
  medium: { feet: 12000, flakRisk: 0.14, fighterRisk: 0.14 },
  high: { feet: 17000, flakRisk: 0.1, fighterRisk: 0.18 },
};

const WEATHER_MODELS = {
  clear: { navPenalty: 0, interceptBonus: 0.05 },
  broken_cloud: { navPenalty: 1, interceptBonus: 0 },
  storm: { navPenalty: 3, interceptBonus: -0.06 },
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

function pickWeather(rng) {
  const roll = rng();
  if (roll < 0.5) return 'broken_cloud';
  if (roll < 0.8) return 'clear';
  return 'storm';
}

function createMissionState(options = {}) {
  const seed = options.seed ?? 617;
  const rng = mulberry32(seed);
  return {
    seed,
    missionClockMins: 0,
    phase: 'outbound',
    throttle: 'cruise',
    altitudeBand: 'medium',
    distanceToTarget: options.distanceToTarget ?? 180,
    distanceToHome: null,
    fuel: 100,
    integrity: 100,
    morale: 100,
    bombLoad: 100,
    bombedTarget: false,
    weather: pickWeather(rng),
    log: ['Takeoff complete. Course set for target.'],
    gameOver: false,
    win: null,
  };
}

function formatMissionClock(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const mins = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addLog(state, line) {
  state.log.push(line);
  if (state.log.length > 120) state.log = state.log.slice(-120);
}

function checkForEnd(state) {
  if (state.integrity <= 0) {
    state.integrity = 0;
    state.gameOver = true;
    state.win = false;
    addLog(state, 'Aircraft lost. The crew did not return.');
    return;
  }
  if (state.fuel <= 0) {
    state.fuel = 0;
    state.gameOver = true;
    state.win = false;
    addLog(state, 'Fuel exhausted before landing. Mission failed.');
    return;
  }
  if (state.morale <= 0) {
    state.morale = 0;
    state.gameOver = true;
    state.win = false;
    addLog(state, 'Crew morale collapsed; mission aborted in disorder.');
    return;
  }

  if (state.phase === 'outbound' && state.distanceToTarget <= 0) {
    state.distanceToTarget = 0;
    state.phase = 'target_zone';
    addLog(state, 'Target area reached. Prepare bombing run.');
  }

  if (state.phase === 'homebound' && state.distanceToHome <= 0) {
    state.distanceToHome = 0;
    state.phase = 'landed';
    state.gameOver = true;
    state.win = state.bombedTarget;
    addLog(state, state.win ? 'Landing successful. Objective completed.' : 'Landing successful, but target was not bombed.');
  }
}

function combatEvent(state, rng, evasiveMode) {
  const altitude = ALTITUDE_MODELS[state.altitudeBand];
  const weather = WEATHER_MODELS[state.weather];
  const exposure = altitude.flakRisk + altitude.fighterRisk + weather.interceptBonus;
  const threatRoll = rng();

  if (threatRoll > exposure) {
    addLog(state, 'Quiet leg of flight; no enemy contact.');
    return;
  }

  const attackRoll = rng();
  const protection = evasiveMode ? 0.22 : 0.08;

  if (attackRoll < 0.45 + protection) {
    const damage = clamp(Math.floor((rng() * 9) + (evasiveMode ? 1 : 4)), 1, 12);
    state.integrity = clamp(state.integrity - damage, 0, 100);
    state.morale = clamp(state.morale - Math.ceil(damage / 2), 0, 100);
    addLog(state, `Enemy attack endured. Integrity -${damage}%, morale reduced.`);
    return;
  }

  const severe = clamp(Math.floor(10 + (rng() * 16)), 10, 25);
  state.integrity = clamp(state.integrity - severe, 0, 100);
  state.morale = clamp(state.morale - Math.ceil(severe / 2), 0, 100);
  addLog(state, `Heavy hit from flak/fighters! Integrity -${severe}%.`);
}

function applyFlightStep(previous, input = {}, options = {}) {
  const state = structuredClone(previous);
  if (state.gameOver) return state;

  const rng = mulberry32((state.seed += 1));
  const throttle = THROTTLE_MODELS[input.throttle || state.throttle] ? (input.throttle || state.throttle) : state.throttle;
  const altitudeBand = ALTITUDE_MODELS[input.altitudeBand || state.altitudeBand] ? (input.altitudeBand || state.altitudeBand) : state.altitudeBand;
  const evasive = Boolean(input.evasive);

  state.throttle = throttle;
  state.altitudeBand = altitudeBand;
  state.weather = pickWeather(rng);
  state.missionClockMins += 10;

  const throttleModel = THROTTLE_MODELS[throttle];
  const weather = WEATHER_MODELS[state.weather];
  const speed = Math.max(5, throttleModel.speed - weather.navPenalty);
  const fuelBurn = throttleModel.fuelBurn + (evasive ? 1.5 : 0) + (altitudeBand === 'high' ? 0.7 : 0);

  state.fuel = clamp(state.fuel - fuelBurn, 0, 100);

  if (state.phase === 'outbound') {
    state.distanceToTarget -= speed;
    addLog(state, `Outbound leg: advanced ${speed} miles in ${state.weather.replace('_', ' ')}.`);
  } else if (state.phase === 'homebound') {
    state.distanceToHome -= speed;
    addLog(state, `Return leg: closed ${speed} miles toward base in ${state.weather.replace('_', ' ')}.`);
  } else if (state.phase === 'target_zone') {
    addLog(state, 'Holding over target area awaiting bombing order.');
    state.morale = clamp(state.morale - 2, 0, 100);
  }

  if (state.phase !== 'landed') {
    combatEvent(state, rng, evasive);
  }

  checkForEnd(state);

  if (options.forceBomb && state.phase === 'target_zone' && !state.bombedTarget && !state.gameOver) {
    const hitChance = clamp(0.45 + (state.morale / 250) + (state.weather === 'clear' ? 0.15 : 0), 0.15, 0.9);
    if (rng() <= hitChance) {
      addLog(state, 'Bomb run successful: target heavily damaged.');
      state.bombedTarget = true;
    } else {
      addLog(state, 'Bomb run scattered; limited effect on objective.');
      state.bombedTarget = false;
    }
    state.bombLoad = 0;
    state.phase = 'homebound';
    state.distanceToHome = 185;
    state.morale = clamp(state.morale - 6, 0, 100);
  }

  checkForEnd(state);
  return state;
}

function validateState(state) {
  const errors = [];
  if (!['outbound', 'target_zone', 'homebound', 'landed'].includes(state.phase)) errors.push('invalid phase');
  if (state.fuel < 0 || state.fuel > 100) errors.push('fuel out of bounds');
  if (state.integrity < 0 || state.integrity > 100) errors.push('integrity out of bounds');
  if (state.morale < 0 || state.morale > 100) errors.push('morale out of bounds');
  if (state.bombLoad < 0 || state.bombLoad > 100) errors.push('bomb load out of bounds');
  if (state.missionClockMins < 0) errors.push('negative mission clock');
  return { valid: errors.length === 0, errors };
}

if (typeof window !== 'undefined') {
  const el = {
    phase: document.getElementById('phase'),
    time: document.getElementById('time'),
    distance: document.getElementById('distance'),
    altitude: document.getElementById('altitude'),
    fuel: document.getElementById('fuel'),
    integrity: document.getElementById('integrity'),
    morale: document.getElementById('morale'),
    bombLoad: document.getElementById('bombLoad'),
    outcome: document.getElementById('outcome'),
    throttle: document.getElementById('throttle'),
    altitudeBand: document.getElementById('altitudeBand'),
    advanceBtn: document.getElementById('advanceBtn'),
    evasiveBtn: document.getElementById('evasiveBtn'),
    bombBtn: document.getElementById('bombBtn'),
    restartBtn: document.getElementById('restartBtn'),
    log: document.getElementById('log'),
    windowView: document.getElementById('windowView'),
    horizon: document.getElementById('horizon'),
    targetGlow: document.getElementById('targetGlow'),
    tracers: document.getElementById('tracers'),
    phaseBadge: document.getElementById('phaseBadge'),
    throttleLever: document.getElementById('throttleLever'),
    altitudeLever: document.getElementById('altitudeLever'),
    integrityNeedle: document.getElementById('integrityNeedle'),
  };

  let state = createMissionState();

  function render() {
    el.phase.textContent = state.phase.replace('_', ' ');
    el.time.textContent = formatMissionClock(state.missionClockMins);
    const distance = state.phase === 'homebound' ? state.distanceToHome : state.distanceToTarget;
    el.distance.textContent = `${Math.max(0, Math.ceil(distance || 0))} mi`;
    el.altitude.textContent = `${ALTITUDE_MODELS[state.altitudeBand].feet} ft`;
    el.fuel.textContent = `${Math.round(state.fuel)}%`;
    el.integrity.textContent = `${Math.round(state.integrity)}%`;
    el.morale.textContent = `${Math.round(state.morale)}%`;
    el.bombLoad.textContent = `${Math.round(state.bombLoad)}%`;
    el.log.innerHTML = state.log.slice(-40).map((line) => `<li>${line}</li>`).join('');
    const throttlePositions = { economy: 15, cruise: 52, maximum: 84 };
    const altitudePositions = { low: 18, medium: 52, high: 84 };
    const phaseLabel = state.phase.replace('_', ' ');
    const horizonPitch = {
      low: 8,
      medium: 0,
      high: -9,
    }[state.altitudeBand] || 0;
    const horizonBank = {
      outbound: -1,
      target_zone: 0,
      homebound: 1,
      landed: 0,
    }[state.phase] || 0;
    const integrityRotation = ((100 - state.integrity) / 100) * 180 - 90;
    const inHeavyContact = state.log.slice(-2).some((line) => line.includes('Heavy hit') || line.includes('Enemy attack'));

    el.windowView.dataset.weather = state.weather;
    el.phaseBadge.textContent = phaseLabel;
    el.horizon.style.transform = `translateY(${horizonPitch}px) rotate(${horizonBank}deg)`;
    el.targetGlow.style.opacity = state.phase === 'target_zone' ? '1' : '0';
    el.tracers.style.opacity = inHeavyContact ? '.5' : '0';
    el.throttleLever.style.left = `${throttlePositions[state.throttle] || 52}%`;
    el.altitudeLever.style.left = `${altitudePositions[state.altitudeBand] || 52}%`;
    el.integrityNeedle.style.transform = `translateX(-50%) rotate(${integrityRotation}deg)`;

    if (!state.gameOver) {
      el.outcome.className = 'outcome';
      el.outcome.textContent = state.phase === 'target_zone' ? 'Over target: order bombing run when ready.' : 'Mission in progress.';
    } else {
      el.outcome.className = `outcome ${state.win ? '' : 'warn'}`;
      el.outcome.textContent = state.win ? 'Mission success.' : 'Mission failed.';
    }

    el.bombBtn.disabled = !(state.phase === 'target_zone' && state.bombLoad > 0 && !state.gameOver);
    el.advanceBtn.disabled = state.gameOver;
    el.evasiveBtn.disabled = state.gameOver;
  }

  function applyStep(config = {}, stepOptions = {}) {
    state = applyFlightStep(state, {
      throttle: config.throttle || el.throttle.value,
      altitudeBand: config.altitudeBand || el.altitudeBand.value,
      evasive: Boolean(config.evasive),
    }, stepOptions);

    const validity = validateState(state);
    if (!validity.valid) {
      console.error(validity.errors, state);
      alert(`Invalid state: ${validity.errors.join(', ')}`);
    }
    render();
  }

  el.advanceBtn.addEventListener('click', () => applyStep());
  el.evasiveBtn.addEventListener('click', () => applyStep({ evasive: true }));
  el.bombBtn.addEventListener('click', () => applyStep({}, { forceBomb: true }));
  el.restartBtn.addEventListener('click', () => {
    state = createMissionState();
    render();
  });

  render();
}

if (typeof module !== 'undefined') {
  module.exports = {
    THROTTLE_MODELS,
    ALTITUDE_MODELS,
    WEATHER_MODELS,
    mulberry32,
    createMissionState,
    applyFlightStep,
    validateState,
    formatMissionClock,
  };
}
