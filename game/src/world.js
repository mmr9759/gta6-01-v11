// VELMARA world: deterministic city generation, road graph, GPS pathfinding and collision.
(function () {
  'use strict';
  var V = window.VELMARA = window.VELMARA || {};

  /** Deterministic RNG (mulberry32) so the city is identical on every load. */
  V.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  V.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  V.lerp = function (a, b, t) { return a + (b - a) * t; };
  V.dist = function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); };
  V.angleTo = function (x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); };
  V.angleDiff = function (a, b) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  V.rand = function (a, b) { return a + Math.random() * (b - a); };
  V.pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };

  /** Build the city: buildings fill every block between roads; parks, beach and port stay open. */
  V.buildCity = function () {
    var rng = V.mulberry32(20261118);
    var buildings = [];
    var trees = [];
    var lamps = [];
    var i, j, x, y;
    for (i = 0; i < V.AVENUES.length - 1; i++) {
      for (j = 0; j < V.STREETS.length - 1; j++) {
        var bx0 = V.AVENUES[i] + V.ROAD_HALF + 20;
        var by0 = V.STREETS[j] + V.ROAD_HALF + 20;
        var bx1 = V.AVENUES[i + 1] - V.ROAD_HALF - 20;
        var by1 = V.STREETS[j + 1] - V.ROAD_HALF - 20;
        var cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
        // Palm Beach strip stays sandy; a few beach huts only.
        if (cy > 2380) {
          if (rng() < 0.5) buildings.push({ x: cx - 30, y: cy - 20, w: 60, h: 40, hgt: 1, color: '#d9b96a', roof: '#b89a55', kind: 'hut' });
          continue;
        }
        // Random park block.
        if (rng() < 0.12) {
          for (var t = 0; t < 7; t++) trees.push({ x: bx0 + rng() * (bx1 - bx0), y: by0 + rng() * (by1 - by0), r: 10 + rng() * 8 });
          continue;
        }
        // 1-4 buildings per block.
        var n = 1 + ((rng() * 3) | 0);
        for (var k = 0; k < n; k++) {
          var bw = 60 + rng() * 90, bh = 50 + rng() * 80;
          var px = bx0 + rng() * Math.max(1, (bx1 - bx0) - bw);
          var py = by0 + rng() * Math.max(1, (by1 - by0) - bh);
          var d = V.districtAt(cx, cy);
          var palette = ['#8a6f4d', '#a8763e', '#5d6b7a', '#5a5478', '#6d7f5e', '#7a8a5e', '#565660', '#b89a55'];
          var col = palette[(rng() * palette.length) | 0];
          buildings.push({ x: px, y: py, w: bw, h: bh, hgt: 1 + ((rng() * 3) | 0), color: col, roof: d ? d.roof : '#666666', kind: rng() < 0.08 ? 'tower' : 'block' });
        }
        if (rng() < 0.6) trees.push({ x: bx0 + 8, y: by0 + 8, r: 9 + rng() * 6 });
        if (rng() < 0.5) trees.push({ x: bx1 - 8, y: by1 - 8, r: 9 + rng() * 6 });
      }
    }
    // Street lamps along every avenue/street crossing.
    for (i = 0; i < V.AVENUES.length; i++) {
      for (j = 0; j < V.STREETS.length; j++) {
        lamps.push({ x: V.AVENUES[i] + V.ROAD_HALF + 6, y: V.STREETS[j] + V.ROAD_HALF + 6 });
      }
    }
    // Port cranes on the east edge.
    var cranes = [];
    for (i = 0; i < 4; i++) cranes.push({ x: 3400, y: 300 + i * 180 });
    return { buildings: buildings, trees: trees, lamps: lamps, cranes: cranes };
  };

  /** District at a point (Palm Beach strip first, then the rest in order). */
  V.districtAt = function (x, y) {
    var i, d;
    for (i = 0; i < V.DISTRICTS.length; i++) {
      d = V.DISTRICTS[i];
      if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
    }
    return null;
  };

  /** True when the point is on a road (within the road half-width of an avenue or street). */
  V.onRoad = function (x, y) {
    var i;
    for (i = 0; i < V.AVENUES.length; i++) if (Math.abs(x - V.AVENUES[i]) < V.ROAD_HALF) return true;
    for (i = 0; i < V.STREETS.length; i++) if (Math.abs(y - V.STREETS[i]) < V.ROAD_HALF) return true;
    return false;
  };

  /** Nearest point on the road network to (x, y). */
  V.nearestRoadPoint = function (x, y) {
    var best = null, bestD = 1e9, i, d, px, py;
    for (i = 0; i < V.AVENUES.length; i++) {
      px = V.AVENUES[i]; py = V.clamp(y, 0, V.WORLD_H);
      d = V.dist(x, y, px, py); if (d < bestD) { bestD = d; best = { x: px, y: py }; }
    }
    for (i = 0; i < V.STREETS.length; i++) {
      px = V.clamp(x, 0, V.WORLD_W); py = V.STREETS[i];
      d = V.dist(x, y, px, py); if (d < bestD) { bestD = d; best = { x: px, y: py }; }
    }
    return best;
  };

  /** Snap a point to the nearest road centre line. */
  V.snapToRoad = function (x, y) {
    var p = V.nearestRoadPoint(x, y);
    return p;
  };

  // ---- Road graph: nodes are intersections, edges run along avenues/streets. ----
  V.buildRoadGraph = function () {
    var nodes = [], index = {}, i, j, id;
    for (i = 0; i < V.AVENUES.length; i++) {
      for (j = 0; j < V.STREETS.length; j++) {
        id = i + ':' + j;
        index[id] = nodes.length;
        nodes.push({ x: V.AVENUES[i], y: V.STREETS[j], ai: i, sj: j, links: [] });
      }
    }
    function link(a, b) { nodes[a].links.push(b); nodes[b].links.push(a); }
    for (i = 0; i < V.AVENUES.length; i++) {
      for (j = 0; j < V.STREETS.length - 1; j++) link(index[i + ':' + j], index[i + ':' + (j + 1)]);
    }
    for (i = 0; i < V.AVENUES.length - 1; i++) {
      for (j = 0; j < V.STREETS.length; j++) link(index[i + ':' + j], index[(i + 1) + ':' + j]);
    }
    return { nodes: nodes, index: index };
  };

  V.nearestNode = function (graph, x, y) {
    var best = 0, bestD = 1e9, i, d;
    for (i = 0; i < graph.nodes.length; i++) {
      d = V.dist(x, y, graph.nodes[i].x, graph.nodes[i].y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  /** BFS shortest path between two world points, as a list of {x,y} waypoints. */
  V.findPath = function (graph, x1, y1, x2, y2) {
    var start = V.nearestNode(graph, x1, y1);
    var goal = V.nearestNode(graph, x2, y2);
    if (start === goal) return [{ x: x2, y: y2 }];
    var prev = new Array(graph.nodes.length).fill(-1);
    var seen = new Array(graph.nodes.length).fill(false);
    var queue = [start];
    seen[start] = true;
    while (queue.length) {
      var cur = queue.shift();
      if (cur === goal) break;
      var links = graph.nodes[cur].links;
      for (var i = 0; i < links.length; i++) {
        if (!seen[links[i]]) { seen[links[i]] = true; prev[links[i]] = cur; queue.push(links[i]); }
      }
    }
    if (!seen[goal]) return [{ x: x2, y: y2 }];
    var path = [], n = goal;
    while (n !== -1) { path.unshift({ x: graph.nodes[n].x, y: graph.nodes[n].y }); n = prev[n]; }
    path.push({ x: x2, y: y2 });
    return path;
  };

  // ---- Collision: two-circle for entities, circle-vs-rect for buildings. ----
  V.circlesHit = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, r = a.r + b.r;
    return dx * dx + dy * dy < r * r;
  };

  /** Push a circle out of a rectangle; returns true when a collision happened. */
  V.circleRectResolve = function (c, rect) {
    var nx = V.clamp(c.x, rect.x, rect.x + rect.w);
    var ny = V.clamp(c.y, rect.y, rect.y + rect.h);
    var dx = c.x - nx, dy = c.y - ny;
    var d2 = dx * dx + dy * dy;
    if (d2 >= c.r * c.r) return false;
    if (d2 > 0.0001) {
      var d = Math.sqrt(d2);
      c.x = nx + (dx / d) * c.r;
      c.y = ny + (dy / d) * c.r;
    } else {
      // Centre inside the rect: push out along the smallest penetration axis.
      var left = c.x - rect.x, right = rect.x + rect.w - c.x;
      var top = c.y - rect.y, bottom = rect.y + rect.h - c.y;
      var m = Math.min(left, right, top, bottom);
      if (m === left) c.x = rect.x - c.r;
      else if (m === right) c.x = rect.x + rect.w + c.r;
      else if (m === top) c.y = rect.y - c.r;
      else c.y = rect.y + rect.h + c.r;
    }
    return true;
  };

  /** Resolve a circle against all buildings and the world bounds. */
  V.collideWorld = function (c, city) {
    var hit = false;
    for (var i = 0; i < city.buildings.length; i++) {
      if (V.circleRectResolve(c, city.buildings[i])) hit = true;
    }
    if (c.x < c.r) { c.x = c.r; hit = true; }
    if (c.y < c.r) { c.y = c.r; hit = true; }
    if (c.x > V.WORLD_W - c.r) { c.x = V.WORLD_W - c.r; hit = true; }
    if (c.y > V.WORLD_H - c.r) { c.y = V.WORLD_H - c.r; hit = true; }
    return hit;
  };

  /** A random point on a road, away from the given point. */
  V.randomRoadPoint = function (awayFrom, minDist) {
    for (var tries = 0; tries < 40; tries++) {
      var horizontal = Math.random() < 0.5;
      var x, y;
      if (horizontal) { x = V.rand(150, V.WORLD_W - 150); y = V.pick(V.STREETS); }
      else { x = V.pick(V.AVENUES); y = V.rand(150, V.WORLD_H - 150); }
      if (!awayFrom || V.dist(x, y, awayFrom.x, awayFrom.y) > (minDist || 400)) return { x: x, y: y };
    }
    return { x: 1100, y: 850 };
  };
})();
