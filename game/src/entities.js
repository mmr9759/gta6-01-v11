// VELMARA entities: traffic cars, pedestrians, police, helicopter and ambient life.
// Every entity is a circle for collision; cars steer along the road graph.
(function () {
  'use strict';
  var V = window.VELMARA = window.VELMARA || {};

  V.makeCar = function (modelId, x, y, angle, color) {
    var m = null;
    for (var i = 0; i < V.CARS.length; i++) if (V.CARS[i].id === modelId) m = V.CARS[i];
    if (!m) m = V.CARS[0];
    return {
      kind: 'car', model: m, x: x, y: y, angle: angle || 0, speed: 0,
      color: color || V.pick(m.colors), r: Math.max(m.len, m.wid) * 0.48,
      hp: 100, driver: null, isPlayer: false, isPolice: modelId === 'interceptor',
      brakeLight: false, headlight: false, horn: 0, stuck: 0, targetNode: -1,
      cruise: 0.55 + Math.random() * 0.3, lane: Math.random() < 0.5 ? -1 : 1
    };
  };

  V.makePed = function (x, y) {
    return {
      kind: 'ped', x: x, y: y, angle: V.rand(0, Math.PI * 2), speed: 30 + Math.random() * 40,
      r: 11, name: V.pick(V.PED_NAMES), color: V.pick(['#e8a13c', '#3c6fd1', '#c94f2e', '#3fae6a', '#7a5fd0', '#e07a2e']),
      walkPhase: Math.random() * 6, fleeing: 0, isCop: false, hp: 50, taxi: false,
      dest: null, wait: 0
    };
  };

  V.makeCop = function (x, y) {
    var p = V.makePed(x, y);
    p.isCop = true; p.color = '#1c2733'; p.hp = 80; p.speed = 55;
    return p;
  };

  V.makeEnemy = function (x, y, boss) {
    var p = V.makePed(x, y);
    p.isEnemy = true; p.color = boss ? '#8e1f2f' : '#5d1f8e'; p.hp = boss ? 300 : 70;
    p.speed = 60 + Math.random() * 20; p.boss = !!boss;
    p.weapon = boss ? 'rifle' : 'pistol'; p.shootCd = 1 + Math.random();
    return p;
  };

  /** Spawn the ambient population: traffic, pedestrians, a few parked cars. */
  V.spawnPopulation = function (G) {
    var i, p, c, model;
    G.traffic = [];
    for (i = 0; i < 26; i++) {
      p = V.randomRoadPoint(null, 0);
      model = V.pick(['primo', 'blista', 'taxi', 'stallion', 'mule', 'comet']);
      c = V.makeCar(model, p.x, p.y, V.rand(0, Math.PI * 2));
      c.speed = V.rand(60, 130);
      c.targetNode = V.nearestNode(G.graph, c.x, c.y);
      G.traffic.push(c);
    }
    G.peds = [];
    for (i = 0; i < 42; i++) {
      p = V.randomRoadPoint(null, 0);
      // Pedestrians walk on sidewalks: offset off the road centre.
      var ped = V.makePed(p.x + V.rand(-60, 60), p.y + V.rand(-60, 60));
      ped.dest = V.randomRoadPoint(ped, 300);
      G.peds.push(ped);
    }
    G.parked = [];
    var spots = [[724, 620, 'primo'], [1500, 874, 'blista'], [2300, 1174, 'comet'], [1100, 1474, 'taxi'],
      [2700, 1774, 'stallion'], [700, 2074, 'mule'], [1900, 624, 'primo'], [3100, 1524, 'hauler'],
      [1500, 2074, 'blista'], [2300, 624, 'taxi'], [300, 924, 'primo'], [2700, 1224, 'stallion']];
    for (i = 0; i < spots.length; i++) {
      c = V.makeCar(spots[i][2], spots[i][0], spots[i][1], (i % 2 === 0 ? 0 : Math.PI / 2));
      c.parked = true;
      G.parked.push(c);
    }
    G.police = [];
    G.cops = [];
    G.enemies = [];
    G.heli = null;
  };

  /** A traffic car picks the next intersection along its route. */
  V.trafficThink = function (car, G, dt) {
    var node = G.graph.nodes[car.targetNode];
    if (!node) { car.targetNode = V.nearestNode(G.graph, car.x, car.y); return; }
    var d = V.dist(car.x, car.y, node.x, node.y);
    if (d < 26) {
      var links = node.links;
      var next = links[(Math.random() * links.length) | 0];
      car.targetNode = next;
      return;
    }
    var want = V.angleTo(car.x, car.y, node.x, node.y);
    var diff = V.angleDiff(car.angle, want);
    car.angle += V.clamp(diff, -1.6 * dt, 1.6 * dt);
    var target = car.model.top * car.cruise;
    if (Math.abs(diff) > 0.9) target *= 0.35;
    // Yield to the car ahead: if another car is close in front, slow down instead of ramming it.
    var ahead = G.player && G.player.car ? [G.player.car] : [];
    var others = G.traffic.concat(ahead);
    for (var oi = 0; oi < others.length; oi++) {
      var oc = others[oi];
      if (oc === car || oc.exploded) continue;
      var od = V.dist(car.x, car.y, oc.x, oc.y);
      if (od < 85) {
        var oa = V.angleTo(car.x, car.y, oc.x, oc.y);
        if (Math.abs(V.angleDiff(car.angle, oa)) < 0.8) target = Math.min(target, 30);
      }
    }
    car.speed += V.clamp(target - car.speed, -260 * dt, 130 * dt);
  };

  /** Move a traffic car forward; simple two-circle avoidance with other cars. */
  V.trafficMove = function (car, G, dt) {
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Stay roughly on roads: if far off-road, steer back to the nearest road point.
    if (!V.onRoad(car.x, car.y)) {
      var p = V.nearestRoadPoint(car.x, car.y);
      var want = V.angleTo(car.x, car.y, p.x, p.y);
      car.angle += V.clamp(V.angleDiff(car.angle, want), -2.2 * dt, 2.2 * dt);
      if (V.dist(car.x, car.y, p.x, p.y) > 130) car.speed = Math.min(car.speed, 90);
    }
    V.collideWorld(car, G.city);
    // Keep the car inside the world after the push-out.
    car.x = Math.max(car.r, Math.min(V.WORLD_W - car.r, car.x));
    car.y = Math.max(car.r, Math.min(V.WORLD_H - car.r, car.y));
  };

  /** Pedestrian wandering: walk to a destination, pick a new one, flee from danger. */
  V.pedUpdate = function (ped, G, dt) {
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      ped.x += Math.cos(ped.angle) * 130 * dt;
      ped.y += Math.sin(ped.angle) * 130 * dt;
      V.collideWorld(ped, G.city);
      return;
    }
    if (!ped.dest || V.dist(ped.x, ped.y, ped.dest.x, ped.dest.y) < 30) {
      if (ped.wait > 0) { ped.wait -= dt; return; }
      ped.dest = V.randomRoadPoint(ped, 250);
      ped.wait = V.rand(0, 3);
      return;
    }
    var want = V.angleTo(ped.x, ped.y, ped.dest.x, ped.dest.y);
    ped.angle += V.clamp(V.angleDiff(ped.angle, want), -3 * dt, 3 * dt);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.walkPhase += dt * 8;
    V.collideWorld(ped, G.city);
  };

  /** An enemy shoots at the player when in range and line of sight is open. */
  V.enemyUpdate = function (e, G, dt) {
    var P = G.player;
    var d = V.dist(e.x, e.y, P.x, P.y);
    e.shootCd -= dt;
    if (d > 520) {
      // Close in.
      var want = V.angleTo(e.x, e.y, P.x, P.y);
      e.angle = want;
      e.x += Math.cos(want) * e.speed * dt;
      e.y += Math.sin(want) * e.speed * dt;
      V.collideWorld(e, G.city);
    } else {
      e.angle = V.angleTo(e.x, e.y, P.x, P.y);
      if (e.shootCd <= 0) {
        e.shootCd = e.boss ? 0.9 : 1.4;
        V.enemyShoot(G, e);
      }
    }
  };

  V.enemyShoot = function (G, e) {
    var P = G.player;
    var dmg = e.weapon === 'rifle' ? 12 : 7;
    var spread = V.rand(-0.12, 0.12);
    var a = V.angleTo(e.x, e.y, P.x, P.y) + spread;
    G.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 0.8, dmg: dmg, from: 'enemy' });
    V.Audio.shoot(e.weapon === 'rifle' ? 'rifle' : 'pistol');
    G.muzzle.push({ x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20, t: 0.06 });
  };

  // ---- Police ----
  /** Desired police presence for a wanted level. */
  V.policeTarget = function (wanted) {
    if (wanted <= 0) return { cars: 0, cops: 0, heli: false };
    if (wanted === 1) return { cars: 1, cops: 0, heli: false };
    if (wanted === 2) return { cars: 2, cops: 2, heli: false };
    if (wanted === 3) return { cars: 3, cops: 3, heli: false };
    if (wanted === 4) return { cars: 3, cops: 4, heli: true };
    return { cars: 4, cops: 5, heli: true };
  };

  /** Spawn police cars/cops/helicopter up to the target for the current wanted level. */
  V.policeMaintain = function (G, dt) {
    var t = V.policeTarget(G.wanted);
    var P = G.player;
    var i, p, c;
    while (G.police.length < t.cars) {
      p = V.randomRoadPoint(P, 500);
      c = V.makeCar('interceptor', p.x, p.y, 0);
      c.isPolice = true;
      G.police.push(c);
    }
    while (G.cops.length < t.cops) {
      p = V.randomRoadPoint(P, 300);
      G.cops.push(V.makeCop(p.x, p.y));
    }
    if (t.heli && !G.heli) {
      G.heli = { x: P.x + 300, y: P.y - 300, angle: 0, r: 26, rotor: 0 };
      V.showToast(G, 'VPD helicopter overhead!');
    }
    if (!t.heli && G.heli) G.heli = null;
    // Roadblocks at 3+ stars: two police cars parked across the road ahead of the player.
    if (G.wanted >= 3 && !G.roadblock && G.roadblockCd <= 0) {
      var ahead = V.nearestRoadPoint(P.x + Math.cos(P.angle) * 500, P.y + Math.sin(P.angle) * 500);
      G.roadblock = { x: ahead.x, y: ahead.y, angle: P.angle, t: 25 };
      for (i = 0; i < 2; i++) {
        c = V.makeCar('interceptor', ahead.x + (i - 0.5) * 60, ahead.y + (i - 0.5) * 20, P.angle + Math.PI / 2);
        c.isPolice = true; c.parked = true; c.roadblockCar = true;
        G.police.push(c);
      }
      V.showToast(G, 'Roadblock ahead!');
      G.roadblockCd = 30;
    }
    if (G.roadblock) {
      G.roadblock.t -= dt;
      if (G.roadblock.t <= 0) {
        G.police = G.police.filter(function (pc) { return !pc.roadblockCar; });
        G.roadblock = null;
      }
    }
    if (G.roadblockCd > 0) G.roadblockCd -= dt;
  };

  /** A police car chases and rams the player; foot cops chase on foot. */
  V.policeUpdate = function (G, dt) {
    var P = G.player;
    for (var i = 0; i < G.police.length; i++) {
      var c = G.police[i];
      if (c.parked) continue;
      var want = V.angleTo(c.x, c.y, P.x, P.y);
      var diff = V.angleDiff(c.angle, want);
      c.angle += V.clamp(diff, -2.4 * dt, 2.4 * dt);
      var target = c.model.top * (Math.abs(diff) > 1 ? 0.5 : 0.98);
      c.speed += V.clamp(target - c.speed, -300 * dt, 200 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      // Ram: two-circle collision with the player's car or body. Damage is throttled
      // per police car (0.6s) so a long overlap does not shred the car in one second.
      var pr = P.inCar ? P.car.r : P.r;
      if (V.dist(c.x, c.y, P.x, P.y) < c.r + pr) {
        if (P.inCar) {
          P.car.speed *= 0.7;
          c.speed *= 0.6;
          if (!c.lastRam || G.time - c.lastRam > 0.6) {
            c.lastRam = G.time;
            V.Audio.crash(true);
            G.particles.push({ x: P.x, y: P.y, vx: V.rand(-40, 40), vy: V.rand(-40, 40), t: 0.4, color: '#ffb02e' });
            P.car.hp -= 4;
          }
        } else {
          V.damagePlayer(G, 2);
          c.speed *= 0.4;
        }
      }
      V.collideWorld(c, G.city);
    }
    for (var j = 0; j < G.cops.length; j++) {
      var cop = G.cops[j];
      var d = V.dist(cop.x, cop.y, P.x, P.y);
      if (d < 600) {
        var wa = V.angleTo(cop.x, cop.y, P.x, P.y);
        cop.angle = wa;
        cop.x += Math.cos(wa) * cop.speed * dt;
        cop.y += Math.sin(wa) * cop.speed * dt;
        V.collideWorld(cop, G.city);
        if (d < 26 && !P.inCar) V.damagePlayer(G, 2);
      }
    }
    if (G.heli) {
      var h = G.heli;
      h.rotor += dt * 30;
      var ha = V.angleTo(h.x, h.y, P.x + 120, P.y - 120);
      h.angle = ha;
      h.x += Math.cos(ha) * 190 * dt;
      h.y += Math.sin(ha) * 190 * dt;
    }
  };

  /** Wanted decays when the player is out of sight; crimes raise it. */
  V.wantedUpdate = function (G, dt) {
    if (G.wanted <= 0) return;
    G.wantedTimer += dt;
    var seen = false;
    for (var i = 0; i < G.police.length; i++) if (V.dist(G.police[i].x, G.police[i].y, G.player.x, G.player.y) < 700) seen = true;
    for (var j = 0; j < G.cops.length; j++) if (V.dist(G.cops[j].x, G.cops[j].y, G.player.x, G.player.y) < 400) seen = true;
    if (G.heli) seen = true;
    if (!seen && G.wantedTimer > 6) {
      G.wantedTimer = 0;
      G.wanted--;
      if (G.wanted === 0) { V.showToast(G, 'You lost the cops.'); G.police = []; G.cops = []; G.heli = null; }
    }
  };
})();
