// VELMARA missions: a 12-mission story in 3 acts, a branch at mission 7, street races,
// and the objective engine (goto / interact / collect / kill / survive / race / escape).
(function () {
  'use strict';
  var V = window.VELMARA = window.VELMARA || {};

  V.currentMission = function (G) {
    if (G.missionIndex >= V.MISSIONS.length) return null;
    return V.MISSIONS[G.missionIndex];
  };

  V.currentStep = function (G) {
    var m = V.currentMission(G);
    if (!m) return null;
    return m.steps[G.stepIndex] || null;
  };

  /** World position of the current objective, for the marker, GPS and autopilot. */
  V.currentObjectiveTarget = function (G) {
    var s = V.currentStep(G);
    if (!s) {
      if (G.player.taxiDest) return { x: G.player.taxiDest.x, y: G.player.taxiDest.y };
      return null;
    }
    if (s.kind === 'goto' || s.kind === 'interact' || s.kind === 'deliver') return { x: s.x, y: s.y };
    if (s.kind === 'kill' && s.spawn) {
      var alive = G.enemies[0];
      if (alive) return { x: alive.x, y: alive.y };
      return { x: s.spawn[0], y: s.spawn[1] };
    }
    if (s.kind === 'collect' && s.spots) {
      for (var i = 0; i < s.spots.length; i++) {
        var sp = s.spots[i];
        var taken = false;
        for (var j = 0; j < G.missionCoins.length; j++) if (G.missionCoins[j].x === sp[0] && G.missionCoins[j].y === sp[1] && G.missionCoins[j].taken) taken = true;
        if (!taken) return { x: sp[0], y: sp[1] };
      }
      return { x: s.spots[0][0], y: s.spots[0][1] };
    }
    if (s.kind === 'race') {
      var race = V.raceById(s.race);
      if (race && G.race) return { x: race.gates[G.race.gate][0], y: race.gates[G.race.gate][1] };
      return { x: race.start[0], y: race.start[1] };
    }
    if (s.kind === 'survive') return { x: G.player.x, y: G.player.y };
    if (s.kind === 'escape') return { x: V.PLACES.safehouse.x, y: V.PLACES.safehouse.y };
    return null;
  };

  V.raceById = function (id) {
    for (var i = 0; i < V.RACES.length; i++) if (V.RACES[i].id === id) return V.RACES[i];
    return null;
  };

  /** Start a mission: reset step state, spawn what the first step needs. */
  V.startMission = function (G, idx) {
    G.missionIndex = idx;
    G.stepIndex = 0;
    G.missionCoins = [];
    G.enemies = [];
    G.race = null;
    G.stepTimer = 0;
    var m = V.MISSIONS[idx];
    if (!m) { G.missionIndex = V.MISSIONS.length; return; }
    if (m.act !== G.lastAct) {
      G.lastAct = m.act;
      G.actCard = { text: V.STORY.actNames[m.act], t: 3.2 };
      V.Audio.phone();
    }
    G.missionCard = { title: 'MISSION ' + m.id + ' — ' + m.title, brief: m.brief, t: 5 };
    V.Audio.phone();
    V.prepareStep(G);
  };

  /** Fill mission 8 from the branch chosen in mission 7. */
  V.fillBranchMission = function (G) {
    var b = G.branch || 'marisol';
    var def = V.BRANCH_M8[b];
    var m8 = V.MISSIONS[7];
    m8.title = def.title;
    m8.brief = def.brief;
    m8.steps = JSON.parse(JSON.stringify(def.steps));
    var m7 = V.MISSIONS[6];
    m7.steps = JSON.parse(JSON.stringify(V.BRANCH_MISSIONS[b]));
  };

  /** Spawn enemies / coins for the current step. */
  V.prepareStep = function (G) {
    var s = V.currentStep(G);
    if (!s) return;
    var m = V.currentMission(G);
    G.stepTimer = s.timer || 0;
    if (s.kind === 'kill') {
      G.enemies = [];
      for (var i = 0; i < s.count; i++) {
        var boss = !!(s.boss && i === 0);
        var e = V.makeEnemy(s.spawn[0] + V.rand(-90, 90), s.spawn[1] + V.rand(-90, 90), boss);
        G.enemies.push(e);
      }
      V.showToast(G, (s.boss ? 'El Toro and his crew are here!' : 'Enemies incoming!'));
      V.Audio.wantedUp();
    }
    if (s.kind === 'collect') {
      G.missionCoins = s.spots.map(function (p) { return { x: p[0], y: p[1], taken: false }; });
    }
    if (s.kind === 'survive' && s.wanted) V.setWanted(G, s.wanted);
    if (s.kind === 'deliver' && s.wanted) V.setWanted(G, Math.max(G.wanted, s.wanted));
    if (s.kind === 'race') {
      var race = V.raceById(s.race);
      V.startRace(G, race, true);
    }
  };

  /** Advance to the next step, or complete the mission. */
  V.advanceStep = function (G) {
    var m = V.currentMission(G);
    if (!m) return;
    G.stepIndex++;
    if (G.stepIndex >= m.steps.length) V.completeMission(G);
    else {
      V.prepareStep(G);
      V.Audio.pickup();
    }
  };

  V.completeMission = function (G) {
    var m = V.currentMission(G);
    if (!m) return;
    V.addMoney(G, m.reward);
    G.player.missionsDone++;
    G.stats.missions++;
    V.Audio.missionDone();
    if (m.id === 12) {
      G.state = 'ending';
      G.endingT = 0;
    }
    V.startMission(G, G.missionIndex + 1);
    if (G.missionIndex >= V.MISSIONS.length) {
      G.missionCard = { title: 'ALL MISSIONS COMPLETE', brief: V.STORY.outro, t: 8 };
    } else {
      G.missionCard = { title: 'MISSION COMPLETE — ' + m.title, brief: 'Reward: $' + m.reward + '   •   Total: $' + G.player.money, t: 4.5 };
    }
  };

  V.failMission = function (G, why) {
    var m = V.currentMission(G);
    V.Audio.missionFail();
    G.missionCard = { title: 'MISSION FAILED', brief: why + ' — restart from the last checkpoint.', t: 4 };
    // Restart the current mission fresh.
    V.startMission(G, G.missionIndex);
  };

  /** Per-frame mission logic: proximity, timers, kill counts, race gates. */
  V.updateMission = function (G, dt) {
    var s = V.currentStep(G);
    if (!s) return;
    var P = G.player;
    if (s.timer) {
      G.stepTimer -= dt;
      if (G.stepTimer <= 0) { V.failMission(G, 'Out of time'); return; }
    }
    if (s.kind === 'goto' || s.kind === 'deliver') {
      if (s.needCar && !P.inCar) { /* wait until the player gets a car */ }
      else if (V.dist(P.x, P.y, s.x, s.y) < s.r) {
        if (s.kind === 'deliver' && P.taxiPassenger) { /* taxi fare, not mission cargo */ }
        else V.advanceStep(G);
      }
    } else if (s.kind === 'collect') {
      var got = 0;
      for (var i = 0; i < G.missionCoins.length; i++) {
        var mc = G.missionCoins[i];
        if (!mc.taken && V.dist(P.x, P.y, mc.x, mc.y) < 36) {
          mc.taken = true;
          V.addMoney(G, 100);
          V.Audio.coin();
          V.showToast(G, 'Mission coin! +$100');
        }
        if (mc.taken) got++;
      }
      if (got >= s.count) V.advanceStep(G);
    } else if (s.kind === 'kill') {
      if (G.enemies.length === 0) V.advanceStep(G);
    } else if (s.kind === 'survive') {
      G.stepTimer += dt;
      if (G.stepTimer >= s.seconds) {
        V.setWanted(G, 0, true);
        G.police = []; G.cops = []; G.heli = null;
        V.advanceStep(G);
      }
    } else if (s.kind === 'escape') {
      if (G.wanted === 0) V.advanceStep(G);
    } else if (s.kind === 'race') {
      if (G.race && G.race.done) V.advanceStep(G);
      else if (G.race && G.race.failed) V.failMission(G, 'You lost the race');
    } else if (s.kind === 'choice') {
      // Handled by key input (1 or 2).
    }
  };

  /** E key on a mission interact step. Returns true when it consumed the press. */
  V.tryMissionInteract = function (G) {
    var s = V.currentStep(G);
    if (!s) return false;
    var P = G.player;
    if (s.kind === 'interact') {
      if (V.dist(P.x, P.y, s.x, s.y) < s.r + 80) {
        if (s.x === V.PLACES.casino.x && s.y === V.PLACES.casino.y) V.setWanted(G, Math.max(G.wanted, 2));
        V.advanceStep(G);
        return true;
      }
      return false;
    }
    return false;
  };

  /** Branch choice: 1 = Marisol, 2 = Broker. */
  V.chooseBranch = function (G, key) {
    var s = V.currentStep(G);
    if (!s || s.kind !== 'choice') return false;
    if (key !== '1' && key !== '2') return false;
    G.branch = key === '1' ? 'marisol' : 'broker';
    V.fillBranchMission(G);
    V.showToast(G, key === '1' ? 'You chose Marisol. Protect Casa Marisol!' : 'You chose the Broker. The vault job is on.');
    V.Audio.missionDone();
    // The branch replaced mission 7's steps: restart at its first new step.
    G.stepIndex = -1;
    V.advanceStep(G);
    return true;
  };

  // ---- Street races ----
  V.startRace = function (G, race, isMission) {
    if (!race) return;
    if (!G.player.inCar) { V.showToast(G, 'You need a car to race!'); return; }
    G.race = {
      def: race, gate: 0, lap: 0, done: false, failed: false, isMission: !!isMission,
      rivals: [], t: 0, best: 0
    };
    // Three rival drivers start just behind the player.
    for (var i = 0; i < 3; i++) {
      var rc = V.makeCar(V.pick(['comet', 'stallion', 'primo']), G.player.x - 60 - i * 30, G.player.y + (i - 1) * 40, G.player.angle);
      rc.speed = 0; rc.raceRival = true;
      rc.raceGate = 0;
      G.race.rivals.push(rc);
      G.traffic.push(rc);
    }
    var P = G.player;
    P.x = race.start[0]; P.y = race.start[1];
    if (P.car) { P.car.x = race.start[0]; P.car.y = race.start[1]; P.car.angle = 0; P.car.speed = 0; }
    V.showToast(G, race.name + ' — hit every gate in order!');
    V.Audio.phone();
  };

  V.updateRace = function (G, dt) {
    var R = G.race;
    if (!R || R.done || R.failed) return;
    R.t += dt;
    var P = G.player;
    var gates = R.def.gates;
    var g = gates[R.gate];
    if (V.dist(P.x, P.y, g[0], g[1]) < 85) {
      R.gate++;
      V.Audio.pickup();
      if (R.gate >= gates.length) {
        R.done = true;
        // Did a rival finish first? Rivals are slower; if the player finished, they win.
        var won = true;
        for (var i = 0; i < R.rivals.length; i++) if (R.rivals[i].raceGate >= gates.length) won = false;
        if (won) {
          V.addMoney(G, R.def.prize);
          G.player.racesWon++;
          V.showToast(G, 'You won the ' + R.def.name + '! +$' + R.def.prize);
          V.Audio.missionDone();
        } else {
          R.failed = true;
        }
        G.race.rivals.forEach(function (rc) { G.traffic = G.traffic.filter(function (c) { return c !== rc; }); });
        return;
      }
    }
    // Rivals drive gate to gate at 70-85% of their top speed.
    for (var j = 0; j < R.rivals.length; j++) {
      var rc = R.rivals[j];
      if (rc.raceGate >= gates.length) continue;
      var rg = gates[rc.raceGate];
      var want = V.angleTo(rc.x, rc.y, rg[0], rg[1]);
      rc.angle += V.clamp(V.angleDiff(rc.angle, want), -2 * dt, 2 * dt);
      var target = rc.model.top * 0.78;
      rc.speed += V.clamp(target - rc.speed, -260 * dt, 150 * dt);
      rc.x += Math.cos(rc.angle) * rc.speed * dt;
      rc.y += Math.sin(rc.angle) * rc.speed * dt;
      if (V.dist(rc.x, rc.y, rg[0], rg[1]) < 85) rc.raceGate++;
    }
    // 4-minute race limit.
    if (R.t > 240) R.failed = true;
  };

  /** Coin hook: mission coins are separate from world coins; nothing extra needed here. */
  V.onCoinCollected = function (G, c) {};
})();
