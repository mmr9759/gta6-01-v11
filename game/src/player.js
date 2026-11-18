// VELMARA player: on-foot movement, driving, stealing cars, combat, wanted level,
// taxi fares, gold coins, shops, garage upgrades and Pay N' Spray.
(function () {
  'use strict';
  var V = window.VELMARA = window.VELMARA || {};

  V.newPlayer = function () {
    return {
      x: 700, y: 620, angle: -Math.PI / 2, r: 13, speed: 0,
      hp: 100, armor: 0, money: 250, wanted: 0,
      inCar: false, car: null, weapon: 'pistol', weapons: { fists: { ammo: Infinity }, pistol: { ammo: Infinity } },
      ammo: {}, onFoot: true, sprinting: false, dead: false,
      taxiPassenger: null, taxiDest: null, taxiFare: 0, carrying: null,
      coins: 0, racesWon: 0, missionsDone: 0, kills: 0, carsStolen: 0,
      shootCd: 0, interactCd: 0, lastDamage: 0
    };
  };

  /** Give the player a weapon (and ammo for it). */
  V.giveWeapon = function (G, id, ammo) {
    var P = G.player;
    var w = null;
    for (var i = 0; i < V.WEAPONS.length; i++) if (V.WEAPONS[i].id === id) w = V.WEAPONS[i];
    if (!w) return;
    P.weapons[id] = { ammo: w.ammoPrice === 0 ? Infinity : (ammo || 60) };
    P.weapon = id;
  };

  V.currentWeapon = function (G) {
    var id = G.player.weapon;
    for (var i = 0; i < V.WEAPONS.length; i++) if (V.WEAPONS[i].id === id) return V.WEAPONS[i];
    return V.WEAPONS[0];
  };

  V.addMoney = function (G, n) {
    G.player.money += n;
    G.stats.earned += Math.max(0, n);
  };

  V.setWanted = function (G, n, silent) {
    var old = G.wanted;
    G.wanted = V.clamp(n, 0, 5);
    G.player.wanted = G.wanted;
    G.wantedTimer = 0;
    if (G.wanted > old && !silent) {
      V.Audio.wantedUp();
      V.showToast(G, 'Wanted level ' + G.wanted + ' — the VPD is coming!');
    }
  };

  V.damagePlayer = function (G, dmg) {
    var P = G.player;
    if (P.dead || G.state !== 'play') return;
    var now = G.time;
    if (now - P.lastDamage < 0.12) return;
    P.lastDamage = now;
    if (P.armor > 0) { var absorbed = Math.min(P.armor, dmg); P.armor -= absorbed; dmg -= absorbed; }
    P.hp -= dmg;
    if (P.hp <= 0) {
      P.hp = 0; P.dead = true;
      V.Audio.missionFail();
      G.state = 'dead';
      G.stats.deaths++;
    }
  };

  V.healPlayer = function (G, n) {
    G.player.hp = Math.min(100, G.player.hp + n);
  };

  // ---- On foot ----
  V.updateOnFoot = function (G, dt, input) {
    var P = G.player;
    var mx = 0, my = 0;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    P.sprinting = !!input.sprint;
    var spd = P.sprinting ? 330 : 225;
    if (mx !== 0 || my !== 0) {
      var len = Math.sqrt(mx * mx + my * my);
      mx /= len; my /= len;
      P.x += mx * spd * dt;
      P.y += my * spd * dt;
      P.angle = V.angleTo(P.x, P.y, G.camX + input.mouseX, G.camY + input.mouseY);
      P.walkPhase = (P.walkPhase || 0) + dt * 10;
    }
    V.collideWorld(P, G.city);
    // Bump into pedestrians: they scatter.
    for (var i = 0; i < G.peds.length; i++) {
      var ped = G.peds[i];
      if (V.circlesHit(P, ped)) {
        ped.fleeing = 1.5;
        ped.angle = V.angleTo(P.x, P.y, ped.x, ped.y);
      }
    }
  };

  // ---- Driving ----
  V.updateDriving = function (G, dt, input) {
    var P = G.player;
    var car = P.car;
    if (!car) { P.inCar = false; return; }
    var m = car.model;
    if (input.up) car.speed += m.accel * dt * (car.speed < 0 ? 2.2 : 1);
    if (input.down) {
      if (car.speed > 8) car.speed -= m.brake * dt;
      else car.speed -= m.accel * 0.55 * dt;
    }
    if (!input.up && !input.down) {
      car.speed -= Math.sign(car.speed) * 60 * dt;
      if (Math.abs(car.speed) < 6) car.speed = 0;
    }
    car.speed = V.clamp(car.speed, -m.top * 0.35, m.top);
    var steer = 0;
    if (input.left) steer -= 1;
    if (input.right) steer += 1;
    var spdF = V.clamp(Math.abs(car.speed) / m.top, 0.15, 1);
    car.angle += steer * m.grip * spdF * dt * Math.sign(car.speed || 1);
    var nx = car.x + Math.cos(car.angle) * car.speed * dt;
    var ny = car.y + Math.sin(car.angle) * car.speed * dt;
    var probe = { x: nx, y: ny, r: car.r };
    var hitBuilding = V.collideWorld(probe, G.city);
    if (hitBuilding) {
      if (Math.abs(car.speed) > 180) {
        V.Audio.crash(true);
        car.hp -= Math.abs(car.speed) * 0.03;
        G.particles.push({ x: nx, y: ny, vx: V.rand(-60, 60), vy: V.rand(-60, 60), t: 0.5, color: '#ffb02e' });
        V.damagePlayer(G, Math.abs(car.speed) * 0.02);
        car.speed *= 0.45;
      } else if (Math.abs(car.speed) > 40) {
        V.Audio.crash(false);
        car.speed *= 0.85;
      }
      car.x = probe.x; car.y = probe.y;
    } else {
      car.x = nx; car.y = ny;
    }
    P.x = car.x; P.y = car.y; P.angle = car.angle;
    car.brakeLight = !!input.down;
    car.headlight = G.isNight;
    if (car.hp <= 0 && !car.exploded) {
      car.exploded = true;
      V.Audio.explosion();
      G.particles.push({ x: car.x, y: car.y, vx: 0, vy: 0, t: 0.9, color: '#ff5a2e', big: true });
      V.showToast(G, 'Your car blew up!');
      V.exitCar(G);
      G.parked = G.parked.filter(function (c) { return c !== car; });
      G.traffic = G.traffic.filter(function (c) { return c !== car; });
    }
    // Car-vs-car: two-circle collision. The other car is pushed aside by position only —
    // its speed is never cut here: cutting it every frame while in contact wedges both
    // cars into a permanent crawl (the lead car can never pull away).
    var all = G.traffic.concat(G.police, G.parked);
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (o === car || o.exploded) continue;
      if (V.circlesHit(car, o)) {
        var push = (car.r + o.r) - V.dist(car.x, car.y, o.x, o.y);
        var a = V.angleTo(o.x, o.y, car.x, car.y);
        car.x += Math.cos(a) * push * 0.4; car.y += Math.sin(a) * push * 0.4;
        if (!o.parked && !o.isPolice) { o.x -= Math.cos(a) * push * 0.6; o.y -= Math.sin(a) * push * 0.6; }
        if (Math.abs(car.speed) > 120) V.Audio.crash(false);
        car.speed *= 0.82;
      }
    }
    V.Audio.updateEngine(Math.abs(car.speed) / m.top, G.wanted);
  };

  // ---- GPS autopilot: steers the player's car along the road graph. ----
  V.updateAutopilot = function (G, dt) {
    var P = G.player;
    if (!P.inCar || !G.autopilot) return;
    if (!G.autopilotPath || G.autopilotPath.length === 0) { G.autopilot = false; return; }
    var car = P.car;
    var wp = G.autopilotPath[0];
    var d = V.dist(car.x, car.y, wp.x, wp.y);
    if (d < 55) { G.autopilotPath.shift(); G.autopilotStuck = 0; return; }
    // Unstuck: if the car barely moves for a second, nudge it back to the road centre.
    if (Math.abs(car.speed) < 8) {
      G.autopilotStuck = (G.autopilotStuck || 0) + dt;
      if (G.autopilotStuck > 1.0) {
        var rp = V.nearestRoadPoint(car.x, car.y);
        car.x = rp.x; car.y = rp.y; car.speed = 40;
        G.autopilotStuck = 0;
      }
    } else G.autopilotStuck = 0;
    var want = V.angleTo(car.x, car.y, wp.x, wp.y);
    var diff = V.angleDiff(car.angle, want);
    car.angle += V.clamp(diff, -2.2 * dt, 2.2 * dt);
    // Slow down near the waypoint so the car can turn onto it instead of orbiting it.
    var target = car.model.top * (Math.abs(diff) > 1.1 ? 0.35 : 0.85) * V.clamp(d / 260, 0.3, 1);
    car.speed += V.clamp(target - car.speed, -260 * dt, 150 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    var probe = { x: car.x, y: car.y, r: car.r };
    if (V.collideWorld(probe, G.city)) { car.x = probe.x; car.y = probe.y; car.speed *= 0.9; }
    P.x = car.x; P.y = car.y; P.angle = car.angle;
  };

  V.toggleAutopilot = function (G) {
    var P = G.player;
    if (!P.inCar) { V.showToast(G, 'Get in a car first — then press G for GPS autopilot.'); return; }
    if (G.autopilot) { G.autopilot = false; G.autopilotPath = []; V.showToast(G, 'Autopilot off.'); return; }
    var target = V.currentObjectiveTarget(G);
    if (!target) { V.showToast(G, 'No mission target to drive to.'); return; }
    G.autopilotPath = V.findPath(G.graph, P.x, P.y, target.x, target.y);
    G.autopilot = true;
    V.showToast(G, 'GPS autopilot on — driving to the marker.');
  };

  // ---- Entering / exiting cars ----
  V.nearestCar = function (G, maxD) {
    var P = G.player, best = null, bestD = maxD || 70;
    var all = G.parked.concat(G.traffic, G.police);
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (c.exploded) continue;
      var d = V.dist(P.x, P.y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };

  V.enterCar = function (G, car) {
    var P = G.player;
    P.inCar = true; P.car = car; car.isPlayer = true; car.parked = false;
    G.traffic = G.traffic.filter(function (c) { return c !== car; });
    G.parked = G.parked.filter(function (c) { return c !== car; });
    G.autopilot = false; G.autopilotPath = [];
    if (car.isPolice) { V.setWanted(G, Math.max(G.wanted, 2)); V.showToast(G, 'You stole a police car!'); }
    else if (!car.owned) {
      // Stealing a stranger's car in front of a cop is a crime.
      var seen = false;
      for (var i = 0; i < G.cops.length; i++) if (V.dist(G.cops[i].x, G.cops[i].y, P.x, P.y) < 420) seen = true;
      for (var j = 0; j < G.police.length; j++) if (V.dist(G.police[j].x, G.police[j].y, P.x, P.y) < 500) seen = true;
      if (seen) V.setWanted(G, Math.max(G.wanted, 1));
      P.carsStolen++;
      V.showToast(G, 'You took the ' + car.model.name + '.');
    }
    V.Audio.uiClick();
  };

  V.exitCar = function (G) {
    var P = G.player;
    if (!P.car) { P.inCar = false; return; }
    var car = P.car;
    P.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    P.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    P.inCar = false; P.car = null; car.isPlayer = false;
    G.parked.push(car);
    G.autopilot = false; G.autopilotPath = [];
  };

  // ---- Combat ----
  V.playerShoot = function (G) {
    var P = G.player;
    if (P.shootCd > 0 || G.state !== 'play') return;
    var w = V.currentWeapon(G);
    var slot = P.weapons[w.id];
    if (!slot) return;
    if (slot.ammo !== Infinity && slot.ammo <= 0) {
      V.showToast(G, 'Out of ammo — visit Ammo & Iron.');
      P.shootCd = 0.3;
      return;
    }
    if (slot.ammo !== Infinity) slot.ammo--;
    P.shootCd = w.rate;
    var ax = P.x, ay = P.y;
    var aim = V.angleTo(ax, ay, G.camX + G.input.mouseX, G.camY + G.input.mouseY);
    if (P.inCar) aim = P.car.angle;
    var pellets = w.pellets || 1;
    for (var i = 0; i < pellets; i++) {
      var a = aim + V.rand(-w.spread, w.spread);
      G.bullets.push({ x: ax + Math.cos(a) * 22, y: ay + Math.sin(a) * 22, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.9, dmg: w.dmg, from: 'player' });
    }
    G.muzzle.push({ x: ax + Math.cos(aim) * 26, y: ay + Math.sin(aim) * 26, t: 0.06 });
    V.Audio.shoot(w.id);
    // Shooting near cops raises the heat.
    var nearCop = false;
    for (var j = 0; j < G.cops.length; j++) if (V.dist(G.cops[j].x, G.cops[j].y, P.x, P.y) < 450) nearCop = true;
    for (var k = 0; k < G.police.length; k++) if (V.dist(G.police[k].x, G.police[k].y, P.x, P.y) < 500) nearCop = true;
    if (nearCop) V.setWanted(G, Math.max(G.wanted, 1), true);
    // Pedestrians scatter at gunfire.
    for (var m = 0; m < G.peds.length; m++) {
      if (V.dist(G.peds[m].x, G.peds[m].y, P.x, P.y) < 320) {
        G.peds[m].fleeing = 2;
        G.peds[m].angle = V.angleTo(P.x, P.y, G.peds[m].x, G.peds[m].y);
      }
    }
  };

  /** Move bullets; two-circle hits against enemies, cops, peds and cars. */
  V.updateBullets = function (G, dt) {
    var P = G.player;
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      var dead = b.life <= 0;
      if (!dead) {
        var targets = [];
        if (b.from === 'player') {
          targets = G.enemies.concat(G.cops);
          for (var e = 0; e < targets.length; e++) {
            var t = targets[e];
            if (V.dist(b.x, b.y, t.x, t.y) < t.r + 4) {
              t.hp -= b.dmg;
              G.particles.push({ x: b.x, y: b.y, vx: V.rand(-50, 50), vy: V.rand(-50, 50), t: 0.3, color: '#ff5a5a' });
              if (t.hp <= 0) V.killTarget(G, t);
              dead = true; break;
            }
          }
          if (!dead) {
            for (var c = 0; c < G.police.length; c++) {
              var pc = G.police[c];
              if (V.dist(b.x, b.y, pc.x, pc.y) < pc.r) {
                pc.hp -= b.dmg;
                if (pc.hp <= 0 && !pc.exploded) { pc.exploded = true; V.Audio.explosion(); V.setWanted(G, Math.max(G.wanted, 3)); }
                dead = true; break;
              }
            }
          }
        } else {
          if (V.dist(b.x, b.y, P.x, P.y) < P.r + 4) {
            V.damagePlayer(G, b.dmg);
            dead = true;
          }
        }
      }
      if (!dead) {
        // Stop at buildings.
        for (var k = 0; k < G.city.buildings.length; k++) {
          var r = G.city.buildings[k];
          if (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h) { dead = true; break; }
        }
      }
      if (dead) G.bullets.splice(i, 1);
    }
  };

  V.killTarget = function (G, t) {
    G.enemies = G.enemies.filter(function (e) { return e !== t; });
    G.cops = G.cops.filter(function (e) { return e !== t; });
    G.player.kills++;
    G.particles.push({ x: t.x, y: t.y, vx: 0, vy: 0, t: 0.5, color: '#ff5a5a', big: true });
    V.Audio.blip(140, 0.25, 'square', 0.25, 50);
    if (t.boss) V.showToast(G, 'El Toro is down!');
    if (t.isCop) V.setWanted(G, Math.max(G.wanted, 2), true);
    else V.setWanted(G, Math.max(G.wanted, 1), true);
  };

  // ---- Interaction (E key): context action at the player's position. ----
  V.interact = function (G) {
    var P = G.player;
    if (P.interactCd > 0) return;
    P.interactCd = 0.35;
    // Mission interaction has priority.
    if (V.tryMissionInteract(G)) return;
    // Enter / exit a car.
    if (!P.inCar) {
      var car = V.nearestCar(G, 75);
      if (car) { V.enterCar(G, car); return; }
    } else { V.exitCar(G); return; }
    // Taxi passenger pickup (on foot near a waiting fare).
    if (G.taxiFare) { V.pickupTaxiFare(G); return; }
    // Shops and services by proximity.
    V.tryShopInteract(G);
  };

  V.tryShopInteract = function (G) {
    var P = G.player;
    var d = function (pl) { return V.dist(P.x, P.y, pl.x, pl.y); };
    if (d(V.PLACES.gunShop) < 90) { G.shopOpen = 'guns'; V.Audio.uiClick(); return; }
    if (d(V.PLACES.garage) < 90) { G.shopOpen = 'garage'; V.Audio.uiClick(); return; }
    if (d(V.PLACES.safehouse) < 90) { V.saveGame(G); V.healPlayer(G, 100); V.showToast(G, 'Game saved. Health restored.'); return; }
    if (d(V.PLACES.hospital) < 90) {
      if (P.money >= 50) { P.money -= 50; V.healPlayer(G, 100); V.showToast(G, 'Patched up for $50.'); }
      else V.showToast(G, 'Healing costs $50.');
      return;
    }
    for (var i = 0; i < V.PAYNSPRAY.length; i++) {
      if (d(V.PAYNSPRAY[i]) < 90) {
        if (P.inCar) V.usePayNSpray(G, V.PAYNSPRAY[i]);
        else V.showToast(G, 'Drive into Pay N’ Spray to lose the cops.');
        return;
      }
    }
    for (var r = 0; r < V.RACES.length; r++) {
      var race = V.RACES[r];
      if (V.dist(P.x, P.y, race.start[0], race.start[1]) < 90 && P.inCar) { V.startRace(G, race); return; }
    }
  };

  V.usePayNSpray = function (G, shop) {
    var P = G.player;
    if (P.money < 100) { V.showToast(G, 'Pay N’ Spray costs $100.'); return; }
    if (G.wanted === 0) { V.showToast(G, 'No heat to lose — fresh paint anyway?'); return; }
    P.money -= 100;
    V.setWanted(G, 0, true);
    G.police = []; G.cops = []; G.heli = null;
    if (P.car) P.car.color = V.pick(P.car.model.colors);
    V.Audio.pickup();
    V.showToast(G, 'Clean! Wanted level cleared, fresh paint.');
  };

  // ---- Taxi fares ----
  V.maybeSpawnTaxiFare = function (G, dt) {
    if (G.taxiFare || G.player.taxiPassenger) return;
    G.taxiTimer -= dt;
    if (G.taxiTimer > 0) return;
    G.taxiTimer = V.rand(14, 26);
    if (Math.random() < 0.6) {
      var p = V.randomRoadPoint(G.player, 350);
      var ped = V.makePed(p.x, p.y);
      ped.taxi = true;
      ped.wait = 999;
      G.taxiFare = ped;
      G.peds.push(ped);
    }
  };

  V.pickupTaxiFare = function (G) {
    var P = G.player;
    var fare = G.taxiFare;
    if (!fare || !P.inCar) return;
    if (V.dist(P.x, P.y, fare.x, fare.y) > 110) return;
    var dest = V.randomRoadPoint(P, 600);
    P.taxiPassenger = fare;
    P.taxiDest = dest;
    P.taxiFare = Math.round(V.dist(fare.x, fare.y, dest.x, dest.y) / 12) + 15;
    if (G.isNight) P.taxiFare *= 2;
    G.peds = G.peds.filter(function (p) { return p !== fare; });
    G.taxiFare = null;
    V.showToast(G, 'Passenger: “' + V.pick(V.TAXI_LINES) + '” — fare $' + P.taxiFare + (G.isNight ? ' (night rate x2)' : ''));
    V.Audio.phone();
  };

  V.updateTaxi = function (G) {
    var P = G.player;
    if (!P.taxiPassenger || !P.taxiDest) return;
    if (V.dist(P.x, P.y, P.taxiDest.x, P.taxiDest.y) < 80) {
      V.addMoney(G, P.taxiFare);
      V.showToast(G, 'Fare complete! +$' + P.taxiFare);
      V.Audio.coin();
      P.taxiPassenger = null; P.taxiDest = null; P.taxiFare = 0;
    }
  };

  // ---- Gold coins ----
  V.updateCoins = function (G) {
    var P = G.player;
    for (var i = 0; i < G.coins.length; i++) {
      var c = G.coins[i];
      if (c.taken) continue;
      if (V.dist(P.x, P.y, c.x, c.y) < 34) {
        c.taken = true;
        P.coins++;
        V.addMoney(G, 150);
        V.Audio.coin();
        V.showToast(G, 'Gold coin! +$150 (' + P.coins + '/24)');
        if (V.onCoinCollected) V.onCoinCollected(G, c);
      }
    }
  };

  // ---- Save / load ----
  V.saveGame = function (G) {
    try {
      var P = G.player;
      var data = {
        money: P.money, mission: G.missionIndex, branch: G.branch, coins: G.coins.filter(function (c) { return c.taken; }).map(function (c) { return c.id; }),
        x: P.x, y: P.y, hp: P.hp, weapons: Object.keys(P.weapons), weapon: P.weapon,
        racesWon: P.racesWon, missionsDone: P.missionsDone, kills: P.kills, time: G.clock
      };
      localStorage.setItem('velmara-save-v11', JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  };

  V.loadGame = function (G) {
    try {
      var raw = localStorage.getItem('velmara-save-v11');
      if (!raw) return false;
      var d = JSON.parse(raw);
      var P = G.player;
      P.money = d.money; P.x = d.x; P.y = d.y; P.hp = d.hp || 100;
      P.racesWon = d.racesWon || 0; P.missionsDone = d.missionsDone || 0; P.kills = d.kills || 0;
      G.missionIndex = d.mission || 0;
      G.branch = d.branch || null;
      G.clock = d.time || 10;
      (d.coins || []).forEach(function (id) { if (G.coins[id]) G.coins[id].taken = true; });
      (d.weapons || []).forEach(function (id) { if (!P.weapons[id]) V.giveWeapon(G, id, 60); });
      if (d.weapon) P.weapon = d.weapon;
      return true;
    } catch (e) { return false; }
  };

  V.hasSave = function () {
    try { return !!localStorage.getItem('velmara-save-v11'); } catch (e) { return false; }
  };
})();
