// VELMARA render: camera, city, entities, day/night lighting, HUD, minimap, compass
// and every menu screen. All drawing is Canvas 2D, no external assets.
(function () {
  'use strict';
  var V = window.VELMARA = window.VELMARA || {};

  V.Render = {
    canvas: null, ctx: null, W: 1280, H: 720, minimap: null, mmCtx: null,

    init: function (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.minimap = document.createElement('canvas');
      this.minimap.width = 220; this.minimap.height = 160;
      this.mmCtx = this.minimap.getContext('2d');
    },

    /** Sky tint and light level for a 24h clock (0-24). */
    daylight: function (clock) {
      var t = clock % 24;
      if (t >= 6 && t < 8) return { light: 0.75, tint: 'rgba(255,170,90,0.10)' };
      if (t >= 8 && t < 17) return { light: 1, tint: 'rgba(255,240,200,0.03)' };
      if (t >= 17 && t < 19) return { light: 0.7, tint: 'rgba(255,120,60,0.14)' };
      if (t >= 19 && t < 21) return { light: 0.45, tint: 'rgba(40,60,160,0.20)' };
      return { light: 0.32, tint: 'rgba(10,16,60,0.30)' };
    },

    draw: function (G) {
      var ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.W, this.H);
      if (G.state === 'title') { this.drawTitle(G); return; }
      this.drawWorld(G);
      this.drawEntities(G);
      this.drawMarkers(G);
      this.drawParticles(G);
      this.drawLighting(G);
      this.drawMinimap(G);
      this.drawHud(G);
      if (G.state === 'paused') this.drawPause(G);
      if (G.state === 'dead') this.drawDead(G);
      if (G.state === 'ending') this.drawEnding(G);
      if (G.shopOpen) this.drawShop(G);
      if (G.missionCard && G.missionCard.t > 0) this.drawMissionCard(G);
      if (G.actCard && G.actCard.t > 0) this.drawActCard(G);
    },

    // ---- World ----
    drawWorld: function (G) {
      var ctx = this.ctx;
      var camX = G.camX, camY = G.camY;
      var x0 = Math.max(0, camX - 60), y0 = Math.max(0, camY - 60);
      var x1 = Math.min(V.WORLD_W, camX + this.W + 60), y1 = Math.min(V.WORLD_H, camY + this.H + 60);
      // Ground: district colours.
      ctx.fillStyle = '#8a8a7a';
      ctx.fillRect(0, 0, this.W, this.H);
      var d;
      for (var i = 0; i < V.DISTRICTS.length; i++) {
        d = V.DISTRICTS[i];
        if (d.x + d.w < x0 || d.x > x1 || d.y + d.h < y0 || d.y > y1) continue;
        ctx.fillStyle = d.ground;
        ctx.fillRect(d.x - camX, d.y - camY, d.w, d.h);
      }
      // Sea along the south edge.
      ctx.fillStyle = '#2e7f8f';
      ctx.fillRect(0, 2520 - camY, this.W, 200);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (var w = 0; w < 14; w++) {
        var wx = ((w * 260 + (G.time * 12) % 260) % 3600) - camX;
        ctx.fillRect(wx, 2540 - camY + (w % 3) * 14, 90, 3);
      }
      // Roads.
      ctx.fillStyle = '#2b2b31';
      var a, s;
      for (a = 0; a < V.AVENUES.length; a++) ctx.fillRect(V.AVENUES[a] - V.ROAD_HALF - camX, y0 - camY, V.ROAD_HALF * 2, y1 - y0);
      for (s = 0; s < V.STREETS.length; s++) ctx.fillRect(x0 - camX, V.STREETS[s] - V.ROAD_HALF - camY, x1 - x0, V.ROAD_HALF * 2);
      // Sidewalks.
      ctx.fillStyle = '#9a9aa2';
      for (a = 0; a < V.AVENUES.length; a++) {
        ctx.fillRect(V.AVENUES[a] - V.ROAD_HALF - 8 - camX, y0 - camY, 4, y1 - y0);
        ctx.fillRect(V.AVENUES[a] + V.ROAD_HALF + 4 - camX, y0 - camY, 4, y1 - y0);
      }
      // Lane dashes.
      ctx.fillStyle = '#e8d44a';
      for (a = 0; a < V.AVENUES.length; a++) {
        for (var y = Math.floor(y0 / 44) * 44; y < y1; y += 44) ctx.fillRect(V.AVENUES[a] - 2 - camX, y - camY, 4, 22);
      }
      for (s = 0; s < V.STREETS.length; s++) {
        for (var x = Math.floor(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x - camX, V.STREETS[s] - 2 - camY, 22, 4);
      }
      // Crosswalks at intersections.
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (a = 0; a < V.AVENUES.length; a++) {
        for (s = 0; s < V.STREETS.length; s++) {
          var ix = V.AVENUES[a], iy = V.STREETS[s];
          if (ix < x0 - 60 || ix > x1 + 60 || iy < y0 - 60 || iy > y1 + 60) continue;
          for (var k = -2; k <= 2; k++) {
            ctx.fillRect(ix + k * 12 - 4 - camX, iy - V.ROAD_HALF - 8 - camY, 8, 5);
            ctx.fillRect(ix + k * 12 - 4 - camX, iy + V.ROAD_HALF + 3 - camY, 8, 5);
          }
        }
      }
      // Buildings with roof colour, shadow edge and height shading.
      var b;
      for (i = 0; i < G.city.buildings.length; i++) {
        b = G.city.buildings[i];
        if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(b.x - camX + 6, b.y - camY + 8, b.w, b.h);
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - camX, b.y - camY, b.w, b.h);
        ctx.fillStyle = b.roof;
        ctx.fillRect(b.x - camX + 5, b.y - camY + 5, b.w - 10, b.h - 10);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(b.x - camX + 5, b.y - camY + 5, b.w - 10, 6);
        if (b.kind === 'tower') {
          ctx.fillStyle = 'rgba(255,220,120,0.8)';
          for (var wi = 0; wi < 3; wi++) ctx.fillRect(b.x - camX + 10 + wi * 16, b.y - camY + 12, 8, 8);
        }
      }
      // Trees, lamps, cranes.
      var t;
      for (i = 0; i < G.city.trees.length; i++) {
        t = G.city.trees[i];
        if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
        ctx.fillStyle = '#2e6b34';
        ctx.beginPath(); ctx.arc(t.x - camX, t.y - camY, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3fae5a';
        ctx.beginPath(); ctx.arc(t.x - camX - 3, t.y - camY - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      for (i = 0; i < G.city.lamps.length; i++) {
        var l = G.city.lamps[i];
        if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
        ctx.fillStyle = '#3a3a42';
        ctx.fillRect(l.x - camX - 2, l.y - camY - 2, 4, 4);
        if (G.isNight) {
          ctx.fillStyle = 'rgba(255,220,120,0.9)';
          ctx.beginPath(); ctx.arc(l.x - camX, l.y - camY, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      for (i = 0; i < G.city.cranes.length; i++) {
        var cr = G.city.cranes[i];
        ctx.strokeStyle = '#e8c33c'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(cr.x - camX, cr.y - camY); ctx.lineTo(cr.x + 90 - camX, cr.y - 70 - camY); ctx.stroke();
        ctx.strokeStyle = '#5d6b7a'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(cr.x - camX, cr.y - camY); ctx.lineTo(cr.x - camX, cr.y + 60 - camY); ctx.stroke();
      }
      // Named places: labels and icons.
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      var keys = Object.keys(V.PLACES);
      for (i = 0; i < keys.length; i++) {
        var pl = V.PLACES[keys[i]];
        if (pl.x < x0 || pl.x > x1 || pl.y < y0 || pl.y > y1) continue;
        ctx.fillStyle = 'rgba(10,12,24,0.65)';
        var tw = ctx.measureText(pl.name).width + 12;
        ctx.fillRect(pl.x - tw / 2 - camX, pl.y - 46 - camY, tw, 18);
        ctx.fillStyle = '#ffd76a';
        ctx.fillText(pl.name, pl.x - camX, pl.y - 33 - camY);
      }
      // Pay N' Spray bays.
      for (i = 0; i < V.PAYNSPRAY.length; i++) {
        var ps = V.PAYNSPRAY[i];
        ctx.fillStyle = '#c94f2e';
        ctx.fillRect(ps.x - 60 - camX, ps.y - 26 - camY, 120, 52);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText('PAY N’ SPRAY  $100', ps.x - camX, ps.y - camY + 4);
      }
      // Gold coins in the world.
      for (i = 0; i < G.coins.length; i++) {
        var c = G.coins[i];
        if (c.taken || c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
        var bob = Math.sin(G.time * 3 + i) * 3;
        ctx.fillStyle = '#ffd23c';
        ctx.beginPath(); ctx.arc(c.x - camX, c.y - camY + bob, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a8763e';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText('$', c.x - camX, c.y - camY + bob + 5);
      }
      // Mission coins.
      for (i = 0; i < G.missionCoins.length; i++) {
        var mc = G.missionCoins[i];
        if (mc.taken) continue;
        ctx.fillStyle = '#ff2e88';
        ctx.beginPath(); ctx.arc(mc.x - camX, mc.y - camY, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText('$', mc.x - camX, mc.y - camY + 5);
      }
    },

    drawCarShape: function (ctx, car, camX, camY, t) {
      var m = car.model;
      ctx.save();
      ctx.translate(car.x - camX, car.y - camY);
      ctx.rotate(car.angle);
      // Shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-m.len / 2 + 3, -m.wid / 2 + 4, m.len, m.wid);
      // Body.
      ctx.fillStyle = car.color;
      ctx.beginPath();
      var r = 7;
      ctx.moveTo(-m.len / 2 + r, -m.wid / 2);
      ctx.lineTo(m.len / 2 - r, -m.wid / 2);
      ctx.quadraticCurveTo(m.len / 2, -m.wid / 2, m.len / 2, -m.wid / 2 + r);
      ctx.lineTo(m.len / 2, m.wid / 2 - r);
      ctx.quadraticCurveTo(m.len / 2, m.wid / 2, m.len / 2 - r, m.wid / 2);
      ctx.lineTo(-m.len / 2 + r, m.wid / 2);
      ctx.quadraticCurveTo(-m.len / 2, m.wid / 2, -m.len / 2, m.wid / 2 - r);
      ctx.lineTo(-m.len / 2, -m.wid / 2 + r);
      ctx.quadraticCurveTo(-m.len / 2, -m.wid / 2, -m.len / 2 + r, -m.wid / 2);
      ctx.fill();
      // Windshield + roof.
      ctx.fillStyle = 'rgba(20,30,50,0.85)';
      ctx.fillRect(m.len * 0.08, -m.wid / 2 + 3, m.len * 0.22, m.wid - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-m.len * 0.28, -m.wid / 2 + 4, m.len * 0.3, m.wid - 8);
      // Wheels.
      ctx.fillStyle = '#111';
      ctx.fillRect(-m.len / 2 + 4, -m.wid / 2 - 2, 10, 4);
      ctx.fillRect(m.len / 2 - 14, -m.wid / 2 - 2, 10, 4);
      ctx.fillRect(-m.len / 2 + 4, m.wid / 2 - 2, 10, 4);
      ctx.fillRect(m.len / 2 - 14, m.wid / 2 - 2, 10, 4);
      // Headlights at night.
      if (car.headlight || car.isPlayer) {
        ctx.fillStyle = 'rgba(255,240,180,0.9)';
        ctx.fillRect(m.len / 2 - 2, -m.wid / 2 + 3, 3, 5);
        ctx.fillRect(m.len / 2 - 2, m.wid / 2 - 8, 3, 5);
      }
      if (car.brakeLight) {
        ctx.fillStyle = '#ff2e2e';
        ctx.fillRect(-m.len / 2 - 1, -m.wid / 2 + 3, 3, 5);
        ctx.fillRect(-m.len / 2 - 1, m.wid / 2 - 8, 3, 5);
      }
      // Police livery + light bar.
      if (car.isPolice) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(-m.len * 0.1, -m.wid / 2, m.len * 0.2, m.wid);
        ctx.fillStyle = (Math.floor((t || 0) * 4) % 2 === 0) ? '#ff2e2e' : '#2e6fff';
        ctx.fillRect(-4, -m.wid / 2 + 2, 8, 6);
        ctx.fillStyle = '#111';
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VPD', 0, 3);
      }
      // Taxi sign.
      if (car.model.id === 'taxi') {
        ctx.fillStyle = '#111';
        ctx.fillRect(-6, -4, 12, 8);
        ctx.fillStyle = '#ffd23c';
        ctx.font = 'bold 7px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TAXI', 0, 3);
      }
      ctx.restore();
    },

    drawPedShape: function (ctx, ped, camX, camY, isPlayer) {
      ctx.save();
      ctx.translate(ped.x - camX, ped.y - camY);
      ctx.rotate(ped.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(2, 3, ped.r * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.arc(0, 0, ped.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath(); ctx.arc(2, 0, 5, 0, Math.PI * 2); ctx.fill();
      if (isPlayer) {
        // Gun in hand.
        ctx.fillStyle = '#222';
        ctx.fillRect(6, -2, 12, 4);
        ctx.strokeStyle = '#ffd23c';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, ped.r + 4, 0, Math.PI * 2); ctx.stroke();
      }
      if (ped.isCop) {
        ctx.fillStyle = '#ffd23c';
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VPD', 0, -ped.r - 4);
      }
      if (ped.isEnemy) {
        ctx.fillStyle = '#ff5a5a';
        ctx.fillRect(-8, -ped.r - 8, 16, 3);
        ctx.fillStyle = '#7a1020';
        ctx.fillRect(-8, -ped.r - 8, 16 * Math.max(0, ped.hp / (ped.boss ? 300 : 70)), 3);
      }
      ctx.restore();
      if (ped.taxi) {
        ctx.fillStyle = '#ffd23c';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TAXI?', ped.x - camX, ped.y - camY - 20);
      }
    },

    drawEntities: function (G) {
      var ctx = this.ctx;
      var camX = G.camX, camY = G.camY;
      var i, c;
      for (i = 0; i < G.parked.length; i++) this.drawCarShape(ctx, G.parked[i], camX, camY, G.time);
      for (i = 0; i < G.traffic.length; i++) this.drawCarShape(ctx, G.traffic[i], camX, camY, G.time);
      for (i = 0; i < G.police.length; i++) this.drawCarShape(ctx, G.police[i], camX, camY, G.time);
      for (i = 0; i < G.peds.length; i++) this.drawPedShape(ctx, G.peds[i], camX, camY, false);
      for (i = 0; i < G.cops.length; i++) this.drawPedShape(ctx, G.cops[i], camX, camY, false);
      for (i = 0; i < G.enemies.length; i++) this.drawPedShape(ctx, G.enemies[i], camX, camY, false);
      var P = G.player;
      if (P.inCar && P.car) this.drawCarShape(ctx, P.car, camX, camY, G.time);
      else this.drawPedShape(ctx, P, camX, camY, true);
      // Taxi passenger in the car.
      if (P.taxiPassenger && P.inCar) {
        ctx.fillStyle = '#e8b98a';
        ctx.beginPath(); ctx.arc(P.x - camX - 6, P.y - camY + 4, 5, 0, Math.PI * 2); ctx.fill();
      }
      // Helicopter with rotor and searchlight.
      if (G.heli) {
        var h = G.heli;
        ctx.save();
        ctx.translate(h.x - camX, h.y - camY);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.arc(4, 5, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1c2733';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 3;
        var ra = h.rotor;
        ctx.beginPath(); ctx.moveTo(Math.cos(ra) * -30, Math.sin(ra) * -30); ctx.lineTo(Math.cos(ra) * 30, Math.sin(ra) * 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(Math.cos(ra + 1.57) * -30, Math.sin(ra + 1.57) * -30); ctx.lineTo(Math.cos(ra + 1.57) * 30, Math.sin(ra + 1.57) * 30); ctx.stroke();
        ctx.fillStyle = 'rgba(255,240,180,0.35)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(P.x - h.x, P.y - h.y - 40); ctx.lineTo(P.x - h.x + 60, P.y - h.y + 40); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // Bullets and muzzle flashes.
      for (i = 0; i < G.bullets.length; i++) {
        var b = G.bullets[i];
        ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x - camX, b.y - camY); ctx.lineTo(b.x - b.vx * 0.02 - camX, b.y - b.vy * 0.02 - camY); ctx.stroke();
      }
      for (i = 0; i < G.muzzle.length; i++) {
        var mz = G.muzzle[i];
        ctx.fillStyle = 'rgba(255,220,90,0.9)';
        ctx.beginPath(); ctx.arc(mz.x - camX, mz.y - camY, 7, 0, Math.PI * 2); ctx.fill();
      }
      // Race gates.
      if (G.race) {
        var gates = G.race.def.gates;
        for (var gi = 0; gi < gates.length; gi++) {
          var g = gates[gi];
          ctx.strokeStyle = gi === G.race.gate ? '#ffd23c' : 'rgba(255,255,255,0.4)';
          ctx.lineWidth = gi === G.race.gate ? 5 : 2;
          ctx.beginPath(); ctx.arc(g[0] - camX, g[1] - camY, 60, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(gi + 1), g[0] - camX, g[1] - camY + 5);
        }
      }
    },

    drawMarkers: function (G) {
      var ctx = this.ctx;
      var target = V.currentObjectiveTarget(G);
      var P = G.player;
      if (target) {
        var pulse = 0.6 + Math.sin(G.time * 5) * 0.4;
        ctx.strokeStyle = 'rgba(255,210,60,' + pulse + ')';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(target.x - G.camX, target.y - G.camY, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,210,60,0.25)';
        ctx.beginPath(); ctx.arc(target.x - G.camX, target.y - G.camY, 30, 0, Math.PI * 2); ctx.fill();
        // Beacon column.
        var grad = ctx.createLinearGradient(target.x - G.camX, target.y - G.camY - 130, target.x - G.camX, target.y - G.camY);
        grad.addColorStop(0, 'rgba(255,210,60,0)');
        grad.addColorStop(1, 'rgba(255,210,60,0.5)');
        ctx.fillStyle = grad;
        ctx.fillRect(target.x - G.camX - 10, target.y - G.camY - 130, 20, 130);
        // Off-screen arrow.
        var sx = target.x - G.camX, sy = target.y - G.camY;
        if (sx < 60 || sx > this.W - 60 || sy < 60 || sy > this.H - 60) {
          var cx = this.W / 2, cy = this.H / 2;
          var a = V.angleTo(P.x, P.y, target.x, target.y);
          var ex = V.clamp(cx + Math.cos(a) * 300, 50, this.W - 50);
          var ey = V.clamp(cy + Math.sin(a) * 220, 50, this.H - 50);
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(a);
          ctx.fillStyle = '#ffd23c';
          ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#ffd23c';
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(Math.round(V.dist(P.x, P.y, target.x, target.y)) + 'm', ex, ey + 26);
        }
      }
      // Taxi destination marker.
      if (P.taxiDest) {
        ctx.strokeStyle = '#2ee8a8';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(P.taxiDest.x - G.camX, P.taxiDest.y - G.camY, 28, 0, Math.PI * 2); ctx.stroke();
      }
      // GPS autopilot path.
      if (G.autopilot && G.autopilotPath) {
        ctx.strokeStyle = 'rgba(46,232,168,0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(P.x - G.camX, P.y - G.camY);
        for (var i = 0; i < G.autopilotPath.length; i++) ctx.lineTo(G.autopilotPath[i].x - G.camX, G.autopilotPath[i].y - G.camY);
        ctx.stroke();
      }
    },

    drawParticles: function (G) {
      var ctx = this.ctx;
      for (var i = 0; i < G.particles.length; i++) {
        var p = G.particles[i];
        ctx.globalAlpha = Math.max(0, p.t * 1.6);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x - G.camX, p.y - G.camY, p.big ? 22 : 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    drawLighting: function (G) {
      var ctx = this.ctx;
      var dl = this.daylight(G.clock);
      ctx.fillStyle = dl.tint;
      ctx.fillRect(0, 0, this.W, this.H);
      if (G.isNight) {
        ctx.fillStyle = 'rgba(8,10,40,0.28)';
        ctx.fillRect(0, 0, this.W, this.H);
        // Headlight cone from the player's car.
        var P = G.player;
        if (P.inCar && P.car) {
          var gx = P.x - G.camX, gy = P.y - G.camY;
          var grad = ctx.createRadialGradient(gx, gy, 20, gx, gy, 320);
          grad.addColorStop(0, 'rgba(255,240,180,0.28)');
          grad.addColorStop(1, 'rgba(255,240,180,0)');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(gx, gy, 320, 0, Math.PI * 2); ctx.fill();
        }
      }
    },

    drawMinimap: function (G) {
      var mm = this.mmCtx;
      var mw = 220, mh = 160;
      var sx = mw / V.WORLD_W, sy = mh / V.WORLD_H;
      mm.clearRect(0, 0, mw, mh);
      mm.fillStyle = '#141824';
      mm.fillRect(0, 0, mw, mh);
      var d;
      for (var i = 0; i < V.DISTRICTS.length; i++) {
        d = V.DISTRICTS[i];
        mm.fillStyle = d.ground;
        mm.fillRect(d.x * sx, d.y * sy, d.w * sx, d.h * sy);
      }
      mm.fillStyle = '#2b2b31';
      for (i = 0; i < V.AVENUES.length; i++) mm.fillRect(V.AVENUES[i] * sx - 1, 0, 2, mh);
      for (i = 0; i < V.STREETS.length; i++) mm.fillRect(0, V.STREETS[i] * sy - 1, mw, 2);
      // Coins.
      mm.fillStyle = '#ffd23c';
      for (i = 0; i < G.coins.length; i++) if (!G.coins[i].taken) mm.fillRect(G.coins[i].x * sx - 1, G.coins[i].y * sy - 1, 2, 2);
      // Objective marker.
      var target = V.currentObjectiveTarget(G);
      if (target) {
        mm.fillStyle = '#ffd23c';
        mm.beginPath(); mm.arc(target.x * sx, target.y * sy, 4, 0, Math.PI * 2); mm.fill();
      }
      // Police (red), traffic (white), player (green arrow).
      mm.fillStyle = '#ff3b30';
      for (i = 0; i < G.police.length; i++) mm.fillRect(G.police[i].x * sx - 2, G.police[i].y * sy - 2, 4, 4);
      if (G.heli) { mm.fillStyle = '#ff3b30'; mm.beginPath(); mm.arc(G.heli.x * sx, G.heli.y * sy, 4, 0, Math.PI * 2); mm.fill(); }
      mm.fillStyle = 'rgba(255,255,255,0.8)';
      for (i = 0; i < G.traffic.length; i++) mm.fillRect(G.traffic[i].x * sx - 1, G.traffic[i].y * sy - 1, 2, 2);
      var P = G.player;
      mm.save();
      mm.translate(P.x * sx, P.y * sy);
      mm.rotate(P.angle);
      mm.fillStyle = '#2ee8a8';
      mm.beginPath(); mm.moveTo(6, 0); mm.lineTo(-4, -4); mm.lineTo(-4, 4); mm.closePath(); mm.fill();
      mm.restore();
      // Blit to the main canvas with a frame.
      var ctx = this.ctx;
      var mx = 16, my = this.H - 160 - 16;
      ctx.fillStyle = 'rgba(8,10,20,0.85)';
      ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
      ctx.drawImage(this.minimap, mx, my);
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 2;
      ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);
      // Viewport rectangle.
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx + G.camX * sx - 4, my + G.camY * sy - 4, this.W * sx, this.H * sy);
      ctx.fillStyle = '#ffd76a';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('VELMARA', mx, my - 8);
      var dist = V.districtAt(P.x, P.y);
      ctx.fillStyle = '#fff';
      ctx.fillText(dist ? dist.name : '', mx + 70, my - 8);
    },

    drawHud: function (G) {
      var ctx = this.ctx;
      var P = G.player;
      // Top-left: cash + wanted stars.
      ctx.fillStyle = 'rgba(8,10,20,0.8)';
      ctx.fillRect(16, 14, 250, 64);
      ctx.fillStyle = '#2ee8a8';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('$' + P.money.toLocaleString('en-US'), 28, 44);
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('COINS ' + P.coins + '/24', 150, 30);
      ctx.fillText('MISSIONS ' + P.missionsDone + '/12', 150, 48);
      ctx.fillText('RACES ' + P.racesWon + '/3', 150, 64);
      // Wanted stars.
      for (var i = 0; i < 5; i++) {
        ctx.fillStyle = i < G.wanted ? '#ffd23c' : 'rgba(255,255,255,0.25)';
        ctx.font = '22px system-ui, sans-serif';
        ctx.fillText('★', 280 + i * 26, 40);
      }
      // Top-right: clock, district, radio.
      var hh = Math.floor(G.clock) % 24, mm = Math.floor((G.clock % 1) * 60);
      var clockStr = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + (G.isNight ? '  NIGHT' : '  DAY');
      ctx.fillStyle = 'rgba(8,10,20,0.8)';
      ctx.fillRect(this.W - 286, 14, 270, 64);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(clockStr, this.W - 28, 42);
      ctx.fillStyle = '#ffd76a';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(V.RADIO[V.Audio.station].name + (V.Audio.radioOn ? '' : ' (off)'), this.W - 28, 64);
      // Compass.
      var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      var heading = ((-P.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      var idx = Math.round(heading / (Math.PI / 4)) % 8;
      ctx.fillStyle = 'rgba(8,10,20,0.8)';
      ctx.fillRect(this.W / 2 - 60, 14, 120, 30);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('◀ ' + dirs[idx] + ' ▶', this.W / 2, 36);
      // Bottom-right: health, armor, weapon, speed.
      ctx.fillStyle = 'rgba(8,10,20,0.8)';
      ctx.fillRect(this.W - 286, this.H - 96, 270, 80);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(this.W - 274, this.H - 84, 150 * (P.hp / 100), 12);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.strokeRect(this.W - 274, this.H - 84, 150, 12);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('HP ' + Math.ceil(P.hp), this.W - 118, this.H - 72);
      ctx.fillStyle = '#2e8fd1';
      ctx.fillRect(this.W - 274, this.H - 64, 150 * (P.armor / 100), 8);
      ctx.fillStyle = '#fff';
      ctx.fillText('ARMOR ' + Math.ceil(P.armor), this.W - 118, this.H - 54);
      var w = V.currentWeapon(G);
      var slot = P.weapons[w.id];
      ctx.fillText(w.name + (slot && slot.ammo !== Infinity ? '  •  ' + slot.ammo : '  •  ∞'), this.W - 274, this.H - 32);
      if (P.inCar && P.car) {
        ctx.fillStyle = '#ffd23c';
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillText(Math.round(Math.abs(P.car.speed) * 0.36 * 2) + ' km/h', this.W - 274, this.H - 84 + 66);
        ctx.fillStyle = '#fff';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(P.car.model.name + '  •  HP ' + Math.max(0, Math.round(P.car.hp)), this.W - 120, this.H - 32);
      }
      // Objective box (bottom centre).
      var m = V.currentMission(G);
      var s = V.currentStep(G);
      if (m && s) {
        ctx.fillStyle = 'rgba(8,10,20,0.85)';
        var text = s.text;
        ctx.font = 'bold 15px system-ui, sans-serif';
        var tw = Math.max(ctx.measureText(text).width, ctx.measureText('MISSION ' + m.id + ' — ' + m.title).width) + 36;
        ctx.fillRect(this.W / 2 - tw / 2, this.H - 64, tw, 48);
        ctx.fillStyle = '#ffd23c';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION ' + m.id + ' — ' + m.title, this.W / 2, this.H - 44);
        ctx.fillStyle = '#fff';
        ctx.font = '14px system-ui, sans-serif';
        var extra = '';
        if (s.kind === 'survive') extra = '  (' + Math.max(0, Math.ceil(s.seconds - G.stepTimer)) + 's)';
        if (s.timer) extra = '  (' + Math.max(0, Math.ceil(G.stepTimer)) + 's left)';
        if (s.kind === 'kill') extra = '  (' + (s.count - G.enemies.length) + '/' + s.count + ')';
        if (s.kind === 'collect') {
          var got = 0;
          for (var ci = 0; ci < G.missionCoins.length; ci++) if (G.missionCoins[ci].taken) got++;
          extra = '  (' + got + '/' + s.count + ')';
        }
        ctx.fillText(text + extra, this.W / 2, this.H - 24);
      }
      // Toasts.
      ctx.textAlign = 'left';
      for (var ti = 0; ti < G.toasts.length; ti++) {
        var toast = G.toasts[ti];
        ctx.globalAlpha = Math.min(1, toast.t);
        ctx.fillStyle = 'rgba(8,10,20,0.85)';
        ctx.fillRect(16, 92 + ti * 30, ctx.measureText(toast.text).width + 20, 24);
        ctx.fillStyle = '#ffd76a';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(toast.text, 26, 109 + ti * 30);
      }
      ctx.globalAlpha = 1;
      // Context hint.
      var hint = V.contextHint(G);
      if (hint) {
        ctx.fillStyle = 'rgba(8,10,20,0.85)';
        ctx.font = 'bold 14px system-ui, sans-serif';
        var hw = ctx.measureText(hint).width + 24;
        ctx.fillRect(this.W / 2 - hw / 2, this.H - 108, hw, 30);
        ctx.fillStyle = '#2ee8a8';
        ctx.textAlign = 'center';
        ctx.fillText(hint, this.W / 2, this.H - 88);
      }
      // Controls footer.
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('WASD move/drive · E interact/enter car · Mouse aim, Click shoot · G GPS · R radio · M mute · P pause', 250, this.H - 8);
    },

    drawMissionCard: function (G) {
      var ctx = this.ctx;
      var c = G.missionCard;
      ctx.globalAlpha = Math.min(1, c.t);
      ctx.fillStyle = 'rgba(8,10,20,0.88)';
      ctx.fillRect(this.W / 2 - 320, 150, 640, 110);
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.W / 2 - 320, 150, 640, 110);
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.title, this.W / 2, 190);
      ctx.fillStyle = '#fff';
      ctx.font = '15px system-ui, sans-serif';
      this.wrapText(c.brief, this.W / 2, 216, 600, 20);
      ctx.globalAlpha = 1;
    },

    drawActCard: function (G) {
      var ctx = this.ctx;
      ctx.globalAlpha = Math.min(1, G.actCard.t);
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(G.actCard.text, this.W / 2, 120);
      ctx.globalAlpha = 1;
    },

    wrapText: function (text, cx, y, maxW, lh) {
      var ctx = this.ctx;
      var words = text.split(' ');
      var line = '', yy = y;
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, cx, yy);
          line = words[i]; yy += lh;
        } else line = test;
      }
      if (line) ctx.fillText(line, cx, yy);
    },

    drawTitle: function (G) {
      var ctx = this.ctx;
      // Sunset gradient backdrop.
      var grad = ctx.createLinearGradient(0, 0, 0, this.H);
      grad.addColorStop(0, '#1c1440');
      grad.addColorStop(0.5, '#7a2e5e');
      grad.addColorStop(0.8, '#e8703c');
      grad.addColorStop(1, '#ffd76a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H);
      // City skyline silhouette.
      ctx.fillStyle = 'rgba(20,12,40,0.9)';
      var rng = V.mulberry32(7);
      var x = 0;
      while (x < this.W) {
        var bw = 40 + rng() * 80, bh = 120 + rng() * 220;
        ctx.fillRect(x, this.H - 180 - bh, bw, bh + 180);
        x += bw + 6;
      }
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath(); ctx.arc(this.W - 220, 150, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,210,60,0.25)';
      ctx.beginPath(); ctx.arc(this.W - 220, 150, 95, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 92px system-ui, sans-serif';
      ctx.fillText('VELMARA', this.W / 2, 260);
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText('— STREETS OF GOLD —', this.W / 2, 312);
      ctx.fillStyle = '#fff';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('An open-world crime story. 12 missions. 8 cars. 24 gold coins. One city that never sleeps.', this.W / 2, 350);
      var blink = Math.floor(G.time * 2) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#2ee8a8';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.fillText('PRESS ENTER TO PLAY', this.W / 2, 420);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText('WASD drive / walk   ·   E enter car & interact   ·   Mouse aim, Click shoot', this.W / 2, 470);
      ctx.fillText('G GPS autopilot   ·   R radio   ·   M mute   ·   P pause   ·   H horn   ·   L headlights', this.W / 2, 496);
      ctx.fillText('Steal cars, dodge the VPD, run taxis, win races, grab the gold.', this.W / 2, 522);
      if (V.hasSave()) {
        ctx.fillStyle = '#ffd23c';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText('Saved game found — press C to CONTINUE', this.W / 2, 566);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('A fully original game. Velmara, Riko Vale, Marisol and the Broker are original characters.', this.W / 2, this.H - 24);
    },

    drawPause: function (G) {
      var ctx = this.ctx;
      ctx.fillStyle = 'rgba(5,6,16,0.72)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.fillText('PAUSED', this.W / 2, 240);
      ctx.fillStyle = '#fff';
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillText('P resume    ·    S save game    ·    R restart mission    ·    Q quit to title', this.W / 2, 300);
      ctx.fillText('Money $' + G.player.money + '   •   Missions ' + G.player.missionsDone + '/12   •   Coins ' + G.player.coins + '/24   •   Races won ' + G.player.racesWon, this.W / 2, 340);
      ctx.fillText('Kills ' + G.player.kills + '   •   Cars stolen ' + G.player.carsStolen + '   •   Deaths ' + G.stats.deaths, this.W / 2, 368);
    },

    drawDead: function (G) {
      var ctx = this.ctx;
      ctx.fillStyle = 'rgba(60,4,4,0.75)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff5a5a';
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.fillText('WASTED', this.W / 2, 300);
      ctx.fillStyle = '#fff';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('The streets of Velmara got you. Press ENTER to wake up at the hospital ($100).', this.W / 2, 350);
    },

    drawEnding: function (G) {
      var ctx = this.ctx;
      ctx.fillStyle = 'rgba(8,10,20,0.88)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 52px system-ui, sans-serif';
      ctx.fillText('KING OF VELMARA', this.W / 2, 250);
      ctx.fillStyle = '#fff';
      ctx.font = '18px system-ui, sans-serif';
      this.wrapText(V.STORY.outro, this.W / 2, 300, 760, 26);
      ctx.fillStyle = '#2ee8a8';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('PRESS ENTER TO KEEP PLAYING — FREE ROAM', this.W / 2, 430);
    },

    drawShop: function (G) {
      var ctx = this.ctx;
      ctx.fillStyle = 'rgba(5,6,16,0.78)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.textAlign = 'center';
      var P = G.player;
      if (G.shopOpen === 'guns') {
        ctx.fillStyle = '#ffd23c';
        ctx.font = 'bold 34px system-ui, sans-serif';
        ctx.fillText('AMMO & IRON', this.W / 2, 150);
        ctx.fillStyle = '#fff';
        ctx.font = '16px system-ui, sans-serif';
        ctx.fillText('Press 1-4 to buy, ESC to leave. Your money: $' + P.money, this.W / 2, 185);
        var items = [
          ['1', 'P9 Pistol', '$300', P.weapons.pistol ? 'OWNED' : ''],
          ['2', 'VSP-9 SMG', '$800 + ammo $60', P.weapons.smg ? 'OWNED (' + (P.weapons.smg.ammo === Infinity ? '∞' : P.weapons.smg.ammo) + ' ammo)' : ''],
          ['3', 'Boomstick Shotgun', '$1200 + ammo $120', P.weapons.shotgun ? 'OWNED (' + (P.weapons.shotgun.ammo === Infinity ? '∞' : P.weapons.shotgun.ammo) + ' ammo)' : ''],
          ['4', 'Longshot Rifle', '$2000 + ammo $150', P.weapons.rifle ? 'OWNED (' + (P.weapons.rifle.ammo === Infinity ? '∞' : P.weapons.rifle.ammo) + ' ammo)' : '']
        ];
        for (var i = 0; i < items.length; i++) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(this.W / 2 - 260, 220 + i * 56, 520, 46);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 18px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(items[i][0] + '  ' + items[i][1], this.W / 2 - 240, 249 + i * 56);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#2ee8a8';
          ctx.fillText(items[i][2] + '  ' + items[i][3], this.W / 2 + 240, 249 + i * 56);
        }
      } else if (G.shopOpen === 'garage') {
        ctx.fillStyle = '#ffd23c';
        ctx.font = 'bold 34px system-ui, sans-serif';
        ctx.fillText('TURBO LUCHO’S GARAGE', this.W / 2, 150);
        ctx.fillStyle = '#fff';
        ctx.font = '16px system-ui, sans-serif';
        ctx.fillText('Press 1 to tune (+speed $600), 2 to repair ($200), 3 to repaint ($150). ESC to leave.', this.W / 2, 185);
        ctx.fillText('Your money: $' + P.money + (P.car ? '   •   Car: ' + P.car.model.name + ' HP ' + Math.round(P.car.hp) : '   •   No car — drive one in!'), this.W / 2, 220);
        ctx.fillText('1  ENGINE TUNE +15% top speed — $600', this.W / 2, 280);
        ctx.fillText('2  FULL REPAIR — $200', this.W / 2, 320);
        ctx.fillText('3  REPAINT — $150', this.W / 2, 360);
      }
    }
  };

})();
