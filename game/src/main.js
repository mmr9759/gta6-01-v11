// VELMARA main: game state, loop, input, camera, day/night clock, shops, scene presets
// (?scene= / ?mission= URL params) and the VELMARA.debug hooks used for play-testing.
(function () {
  'use strict';
  var V = window.VELMARA = window.VELMARA || {};

  /** Fresh game state. */
  V.newGame = function () {
    var G = {
      state: 'title', time: 0, clock: 10, isNight: false,
      city: V.buildCity(), graph: V.buildRoadGraph(),
      player: V.newPlayer(), coins: JSON.parse(JSON.stringify(V.COINS)),
      traffic: [], peds: [], parked: [], police: [], cops: [], enemies: [],
      heli: null, roadblock: null, roadblockCd: 0,
      bullets: [], muzzle: [], particles: [],
      wanted: 0, wantedTimer: 0,
      missionIndex: 0, stepIndex: 0, branch: null, lastAct: 0,
      missionCoins: [], race: null, taxiFare: null, taxiTimer: 8,
      autopilot: false, autopilotPath: [],
      camX: 0, camY: 0, toasts: [], missionCard: null, actCard: null,
      shopOpen: null, stats: { earned: 0, missions: 0, deaths: 0 },
      input: { up: false, down: false, left: false, right: false, sprint: false, mouseX: 640, mouseY: 360, mouseDown: false },
      endingT: 0, stepTimer: 0, lastTs: 0, fps: 60
    };
    V.spawnPopulation(G);
    // The player's own Primo waits by the safehouse, parked on the avenue.
    var primo = V.makeCar('primo', 724, 620, Math.PI / 2);
    primo.owned = true;
    G.parked.push(primo);
    return G;
  };

  V.showToast = function (G, text) {
    G.toasts.unshift({ text: text, t: 4 });
    if (G.toasts.length > 4) G.toasts.pop();
  };

  /** Context-sensitive hint line shown above the footer. */
  V.contextHint = function (G) {
    var P = G.player;
    var s = V.currentStep(G);
    if (G.state !== 'play') return '';
    if (s && s.kind === 'interact' && V.dist(P.x, P.y, s.x, s.y) < s.r + 30) return '[E] ' + s.text;
    if (s && s.kind === 'choice') return 'Press [1] Marisol  or  [2] Broker';
    if (!P.inCar) {
      var car = V.nearestCar(G, 75);
      if (car) return '[E] Get in the ' + car.model.name;
      if (V.dist(P.x, P.y, V.PLACES.gunShop.x, V.PLACES.gunShop.y) < 90) return '[E] Ammo & Iron — buy guns';
      if (V.dist(P.x, P.y, V.PLACES.garage.x, V.PLACES.garage.y) < 90) return '[E] Turbo Lucho’s Garage';
      if (V.dist(P.x, P.y, V.PLACES.safehouse.x, V.PLACES.safehouse.y) < 90) return '[E] Safehouse — save & heal';
      if (V.dist(P.x, P.y, V.PLACES.hospital.x, V.PLACES.hospital.y) < 90) return '[E] Hospital — heal $50';
    } else {
      for (var i = 0; i < V.RACES.length; i++) {
        if (V.dist(P.x, P.y, V.RACES[i].start[0], V.RACES[i].start[1]) < 90) return '[E] Start the ' + V.RACES[i].name + ' — $' + V.RACES[i].prize;
      }
      for (var j = 0; j < V.PAYNSPRAY.length; j++) {
        if (V.dist(P.x, P.y, V.PAYNSPRAY[j].x, V.PAYNSPRAY[j].y) < 90) return '[E] Pay N’ Spray — lose the cops ($100)';
      }
    }
    if (G.taxiFare && V.dist(P.x, P.y, G.taxiFare.x, G.taxiFare.y) < 110 && P.inCar) return '[E] Pick up the taxi fare';
    return '';
  };

  // ---- Shops ----
  V.buyGun = function (G, n) {
    var P = G.player;
    var ids = ['pistol', 'smg', 'shotgun', 'rifle'];
    var id = ids[n - 1];
    if (!id) return;
    var w = null;
    for (var i = 0; i < V.WEAPONS.length; i++) if (V.WEAPONS[i].id === id) w = V.WEAPONS[i];
    if (!w) return;
    if (P.weapons[id]) {
      // Top up ammo.
      if (w.ammoPrice > 0 && P.money >= w.ammoPrice) {
        P.money -= w.ammoPrice;
        P.weapons[id].ammo += 60;
        V.showToast(G, 'Ammo +60 for the ' + w.name + '.');
        V.Audio.pickup();
      } else if (w.ammoPrice === 0) V.showToast(G, 'The ' + w.name + ' never runs dry.');
      else V.showToast(G, 'Not enough cash for ammo.');
      return;
    }
    if (P.money < w.price) { V.showToast(G, 'Not enough cash for the ' + w.name + '.'); return; }
    P.money -= w.price;
    V.giveWeapon(G, id, 60);
    V.showToast(G, 'Bought the ' + w.name + '!');
    V.Audio.pickup();
  };

  V.buyGarage = function (G, n) {
    var P = G.player;
    if (!P.car) { V.showToast(G, 'Drive a car into the garage first.'); return; }
    if (n === 1) {
      if (P.money < 600) { V.showToast(G, 'Tune costs $600.'); return; }
      P.money -= 600;
      P.car.model = Object.assign({}, P.car.model, { top: P.car.model.top * 1.15 });
      P.car.tuned = true;
      V.showToast(G, 'Engine tuned! +15% top speed.');
    } else if (n === 2) {
      if (P.money < 200) { V.showToast(G, 'Repair costs $200.'); return; }
      P.money -= 200;
      P.car.hp = 100;
      V.showToast(G, 'Car repaired to full.');
    } else if (n === 3) {
      if (P.money < 150) { V.showToast(G, 'Repaint costs $150.'); return; }
      P.money -= 150;
      P.car.color = V.pick(P.car.model.colors);
      V.showToast(G, 'Fresh paint!');
    }
    V.Audio.pickup();
  };

  // ---- Camera ----
  V.updateCamera = function (G) {
    var P = G.player;
    var tx = V.clamp(P.x - 640, 0, V.WORLD_W - 1280);
    var ty = V.clamp(P.y - 360, 0, V.WORLD_H - 720);
    G.camX += (tx - G.camX) * 0.12;
    G.camY += (ty - G.camY) * 0.12;
  };

  // ---- Frame update ----
  V.update = function (G, dt) {
    dt = Math.min(dt, 0.05);
    G.time += dt;
    // Clock: one game hour per 75 real seconds.
    G.clock = (G.clock + dt / 75) % 24;
    G.isNight = G.clock < 6 || G.clock >= 19;
    if (G.missionCard) G.missionCard.t -= dt;
    if (G.actCard) G.actCard.t -= dt;
    for (var ti = G.toasts.length - 1; ti >= 0; ti--) {
      G.toasts[ti].t -= dt;
      if (G.toasts[ti].t <= 0) G.toasts.splice(ti, 1);
    }
    if (G.state !== 'play') {
      if (G.state === 'ending') G.endingT += dt;
      return;
    }
    var P = G.player;
    if (P.shootCd > 0) P.shootCd -= dt;
    if (P.interactCd > 0) P.interactCd -= dt;
    if (P.inCar) {
      V.updateDriving(G, dt, G.input);
      V.updateAutopilot(G, dt);
    } else {
      V.updateOnFoot(G, dt, G.input);
    }
    if (G.input.mouseDown) V.playerShoot(G);
    V.updateBullets(G, dt);
    V.updateMission(G, dt);
    V.updateRace(G, dt);
    V.updateCoins(G);
    V.updateTaxi(G);
    V.maybeSpawnTaxiFare(G, dt);
    V.policeMaintain(G, dt);
    V.policeUpdate(G, dt);
    V.wantedUpdate(G, dt);
    var i;
    for (i = 0; i < G.traffic.length; i++) {
      var car = G.traffic[i];
      if (car.raceRival) continue;
      V.trafficThink(car, G, dt);
      V.trafficMove(car, G, dt);
    }
    for (i = 0; i < G.peds.length; i++) V.pedUpdate(G.peds[i], G, dt);
    for (i = 0; i < G.cops.length; i++) { /* cops move in policeUpdate */ }
    for (i = 0; i < G.enemies.length; i++) V.enemyUpdate(G.enemies[i], G, dt);
    for (i = G.particles.length - 1; i >= 0; i--) {
      var pt = G.particles[i];
      pt.t -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      if (pt.t <= 0) G.particles.splice(i, 1);
    }
    for (i = G.muzzle.length - 1; i >= 0; i--) {
      G.muzzle[i].t -= dt;
      if (G.muzzle[i].t <= 0) G.muzzle.splice(i, 1);
    }
    // Player car HP regen is off; wrecked traffic despawns far away.
    for (i = G.traffic.length - 1; i >= 0; i--) {
      if (G.traffic[i].exploded && V.dist(G.traffic[i].x, G.traffic[i].y, P.x, P.y) > 900) G.traffic.splice(i, 1);
    }
    V.updateCamera(G);
    V.Audio.updateEngine(P.inCar && P.car ? Math.abs(P.car.speed) / P.car.model.top : 0, G.wanted);
  };

  // ---- Scene presets for screenshots (?scene=) and tests ----
  V.applyScene = function (G, name) {
    var P = G.player;
    if (name === 'drive') {
      V.startGame(G);
      var car = V.makeCar('comet', 1900, 1150, 0);
      car.owned = true;
      G.parked.push(car);
      P.x = 1900; P.y = 1150;
      V.enterCar(G, car);
      car.speed = 200;
      G.clock = 15;
      V.toggleAutopilot(G);
    } else if (name === 'chase') {
      V.startGame(G);
      var c2 = V.makeCar('stallion', 1900, 1150, 0);
      c2.owned = true;
      G.parked.push(c2);
      P.x = 1900; P.y = 1150;
      V.enterCar(G, c2);
      c2.speed = 220;
      V.setWanted(G, 3);
      G.clock = 16;
      V.toggleAutopilot(G);
    } else if (name === 'mission') {
      V.startGame(G);
      V.startMission(G, 0);
      P.x = 1000; P.y = 550;
      G.clock = 11;
    } else if (name === 'night') {
      V.startGame(G);
      var c3 = V.makeCar('comet', 1500, 850, Math.PI / 2);
      c3.owned = true;
      G.parked.push(c3);
      P.x = 1500; P.y = 850;
      V.enterCar(G, c3);
      c3.speed = 160;
      G.clock = 21.5;
      // Drive far across the city so the car is still moving at screenshot time.
      G.autopilotPath = V.findPath(G.graph, P.x, P.y, 3100, 250);
      G.autopilot = true;
    } else if (name === 'foot') {
      V.startGame(G);
      P.x = 1500; P.y = 850;
      G.clock = 13;
    }
    V.updateCamera(G);
    G.camX = V.clamp(P.x - 640, 0, V.WORLD_W - 1280);
    G.camY = V.clamp(P.y - 360, 0, V.WORLD_H - 720);
    // Screenshot scenes fade the mission card fast so the city shows.
    if (G.missionCard) G.missionCard.t = 1.5;
  };

  V.startGame = function (G) {
    G.state = 'play';
    V.Audio.init();
    V.Audio.resume();
    V.Audio.startRadio();
    if (G.missionIndex === 0 && G.stepIndex === 0 && !G.started) {
      G.started = true;
      V.startMission(G, 0);
      V.showToast(G, 'Welcome back to Velmara, Riko.');
    }
  };

  // ---- Input ----
  V.bindInput = function (G) {
    var input = G.input;
    var keyMap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Enter') {
        if (G.state === 'title') { V.startGame(G); return; }
        if (G.state === 'dead') {
          G.player.hp = 100; G.player.dead = false; G.player.money = Math.max(0, G.player.money - 100);
          G.player.x = V.PLACES.hospital.x; G.player.y = V.PLACES.hospital.y;
          V.setWanted(G, 0, true);
          G.state = 'play';
          return;
        }
        if (G.state === 'ending') { G.state = 'play'; return; }
      }
      if (e.code === 'KeyC' && G.state === 'title' && V.hasSave()) {
        V.startGame(G);
        V.loadGame(G);
        V.startMission(G, G.missionIndex);
        return;
      }
      if (G.shopOpen) {
        if (e.code === 'Escape') { G.shopOpen = null; return; }
        if (G.shopOpen === 'guns' && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code) >= 0) V.buyGun(G, parseInt(e.code.slice(-1), 10));
        if (G.shopOpen === 'garage' && ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code) >= 0) V.buyGarage(G, parseInt(e.code.slice(-1), 10));
        return;
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (G.state === 'play') { G.state = 'paused'; V.Audio.setMuted(true); return; }
        if (G.state === 'paused') { G.state = 'play'; V.Audio.setMuted(false); return; }
      }
      if (G.state === 'paused') {
        if (e.code === 'KeyS') { V.saveGame(G); V.showToast(G, 'Game saved.'); }
        if (e.code === 'KeyR') { V.startMission(G, G.missionIndex); G.state = 'play'; }
        if (e.code === 'KeyQ') { G.state = 'title'; }
        return;
      }
      if (G.state !== 'play') return;
      if (keyMap[e.code] !== undefined) { input[keyMap[e.code]] = true; e.preventDefault(); }
      if (e.code === 'KeyE') V.interact(G);
      if (e.code === 'KeyG') V.toggleAutopilot(G);
      if (e.code === 'KeyR') {
        var st = V.Audio.nextStation();
        V.showToast(G, 'Radio: ' + st.name + ' — ' + st.tag);
      }
      if (e.code === 'KeyM') { V.Audio.setMuted(!V.Audio.muted); V.showToast(G, V.Audio.muted ? 'Muted.' : 'Sound on.'); }
      if (e.code === 'KeyH') { V.Audio.blip(370, 0.25, 'square', 0.25); V.Audio.blip(370, 0.25, 'square', 0.25); }
      if (e.code === 'KeyL') { if (G.player.car) G.player.car.headlight = !G.player.car.headlight; }
      if (e.code === 'KeyQ') {
        var order = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];
        var cur = order.indexOf(G.player.weapon);
        for (var i = 1; i <= order.length; i++) {
          var next = order[(cur + i) % order.length];
          if (G.player.weapons[next]) { G.player.weapon = next; break; }
        }
      }
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5') {
        var wids = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];
        var wid = wids[parseInt(e.code.slice(-1), 10) - 1];
        if (G.player.weapons[wid]) G.player.weapon = wid;
      }
      if (e.code === 'Space') { input.down = true; e.preventDefault(); }
      // Branch choice.
      if (e.code === 'Digit1' || e.code === 'Digit2') V.chooseBranch(G, e.code.slice(-1));
    });
    window.addEventListener('keyup', function (e) {
      if (keyMap[e.code] !== undefined) input[keyMap[e.code]] = false;
      if (e.code === 'Space') input.down = false;
    });
    var canvas = V.Render.canvas;
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      input.mouseX = (e.clientX - r.left) * (1280 / r.width);
      input.mouseY = (e.clientY - r.top) * (720 / r.height);
    });
    canvas.addEventListener('mousedown', function (e) {
      V.Audio.init(); V.Audio.resume();
      if (e.button === 0) input.mouseDown = true;
    });
    window.addEventListener('mouseup', function () { input.mouseDown = false; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  // ---- Boot ----
  V.boot = function () {
    var canvas = document.getElementById('game');
    if (!canvas || !canvas.getContext) {
      var fb = document.getElementById('fallback');
      if (fb) fb.style.display = 'flex';
      return;
    }
    V.Render.init(canvas);
    var G = V.newGame();
    V.G = G;
    V.bindInput(G);
    function fit() {
      var scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
      canvas.style.width = Math.floor(1280 * scale) + 'px';
      canvas.style.height = Math.floor(720 * scale) + 'px';
    }
    window.addEventListener('resize', fit);
    fit();
    // URL presets: ?scene=drive|chase|mission|night|foot, ?mission=N, ?autostart=1
    var params = new URLSearchParams(window.location.search);
    var scene = params.get('scene');
    var mission = params.get('mission');
    if (scene) V.applyScene(G, scene);
    else if (params.get('autostart') === '1') V.startGame(G);
    if (mission !== null) {
      if (G.state !== 'play') V.startGame(G);
      var mi = parseInt(mission, 10);
      if (!isNaN(mi) && mi >= 1 && mi <= 12) V.startMission(G, mi - 1);
    }
    // Debug hooks for play-testing (and the finalist review's own checks).
    V.debug = {
      state: function () {
        var P = G.player;
        var s = V.currentStep(G);
        var m = V.currentMission(G);
        return {
          state: G.state, x: Math.round(P.x), y: Math.round(P.y), money: P.money,
          hp: Math.round(P.hp), wanted: G.wanted, inCar: P.inCar,
          carSpeed: P.car ? Math.round(P.car.speed) : 0,
          mission: m ? m.id : null, missionTitle: m ? m.title : null,
          step: s ? s.kind + ': ' + s.text : null,
          stepIndex: G.stepIndex, missionsDone: P.missionsDone, coins: P.coins,
          enemies: G.enemies.length, traffic: G.traffic.length, peds: G.peds.length,
          clock: G.clock, isNight: G.isNight, taxiFare: !!G.taxiFare,
          taxiPassenger: !!P.taxiPassenger, autopilot: !!G.autopilot
        };
      },
      start: function () { V.startGame(G); return V.debug.state(); },
      teleport: function (x, y) { G.player.x = x; G.player.y = y; if (G.player.car) { G.player.car.x = x; G.player.car.y = y; } V.updateCamera(G); return V.debug.state(); },
      enterNearestCar: function () { var c = V.nearestCar(G, 200); if (c) V.enterCar(G, c); return V.debug.state(); },
      setWanted: function (n) { V.setWanted(G, n); return V.debug.state(); },
      setClock: function (h) { G.clock = h; G.isNight = h < 6 || h >= 19; return V.debug.state(); },
      setMoney: function (n) { G.player.money = n; return V.debug.state(); },
      startMission: function (n) { V.startMission(G, n - 1); return V.debug.state(); },
      chooseBranch: function (k) { V.chooseBranch(G, String(k)); return V.debug.state(); },
      key: function (code, down) {
        var ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { code: code, bubbles: true });
        window.dispatchEvent(ev);
        return V.debug.state();
      },
      pressKey: function (code) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: code, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: code, bubbles: true }));
        return V.debug.state();
      },
      holdKeys: function (codes, ms) {
        codes.forEach(function (c) { window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })); });
        return new Promise(function (resolve) {
          setTimeout(function () {
            codes.forEach(function (c) { window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true })); });
            resolve(V.debug.state());
          }, ms);
        });
      },
      shootAt: function (x, y) {
        var r = V.Render.canvas.getBoundingClientRect();
        var sx = (x - G.camX) * (r.width / 1280) + r.left;
        var sy = (y - G.camY) * (r.height / 720) + r.top;
        G.input.mouseX = x - G.camX; G.input.mouseY = y - G.camY;
        V.playerShoot(G);
        return V.debug.state();
      }
    };
    function frame(ts) {
      var dt = G.lastTs ? (ts - G.lastTs) / 1000 : 0.016;
      G.lastTs = ts;
      V.update(G, dt);
      V.Render.draw(G);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', V.boot);
  else V.boot();
})();
