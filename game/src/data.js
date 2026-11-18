// VELMARA data: the city of Velmara, its districts, vehicles, weapons, missions and story.
// All names, characters and places are original. World size 3600 x 2600.
(function () {
  'use strict';
  var V = window.VELMARA = window.VELMARA || {};

  V.WORLD_W = 3600;
  V.WORLD_H = 2600;

  // Roads: vertical avenues and horizontal streets; intersections are the road graph.
  V.AVENUES = [300, 700, 1100, 1500, 1900, 2300, 2700, 3100];
  V.STREETS = [250, 550, 850, 1150, 1450, 1750, 2050, 2350];
  V.ROAD_HALF = 34;

  V.DISTRICTS = [
    { name: 'Palm Beach', x: 0, y: 2350, w: 3600, h: 250, ground: '#e8cf8f', roof: '#d9b96a', accent: '#2e7f8f', desc: 'Sand, surf and neon hotels along the southern shore.' },
    { name: 'Old Town', x: 0, y: 0, w: 700, h: 850, ground: '#b7a98a', roof: '#8a6f4d', accent: '#c94f2e', desc: 'Brick lanes, old churches and the smell of fried plantain.' },
    { name: 'Calle Sol', x: 700, y: 0, w: 1200, h: 850, ground: '#c9b489', roof: '#a8763e', accent: '#e8a13c', desc: 'Sun-baked plazas, murals and Marisol’s café row.' },
    { name: 'Goldport Docks', x: 2900, y: 0, w: 700, h: 850, ground: '#9aa0a8', roof: '#5d6b7a', accent: '#e8c33c', desc: 'Cranes, containers and gold that never reaches the bank.' },
    { name: 'Neon Strip', x: 1100, y: 850, w: 1200, h: 600, ground: '#8f8aa8', roof: '#5a5478', accent: '#ff2e88', desc: 'Casinos, clubs and billboards that never sleep.' },
    { name: 'Marina Bay', x: 0, y: 850, w: 1100, h: 1500, ground: '#a8b89a', roof: '#6d7f5e', accent: '#2e8f7a', desc: 'Yachts, fish markets and the Broker’s quiet office.' },
    { name: 'University Hill', x: 2300, y: 850, w: 1300, h: 900, ground: '#a3b18a', roof: '#7a8a5e', accent: '#3c6fd1', desc: 'Students, bookshops and the city’s best tacos.' },
    { name: 'Industrial Zone', x: 1900, y: 1750, w: 1700, h: 600, ground: '#8d8d94', roof: '#565660', accent: '#d17a3c', desc: 'Warehouses, chop shops and deals done after dark.' }
  ];

  V.PLACES = {
    safehouse: { x: 700, y: 550, name: 'Riko’s Safehouse', desc: 'Home. Save here, heal up, stash cars.' },
    marisolShop: { x: 1500, y: 850, name: 'Casa Marisol', desc: 'Marisol’s café and the best coffee in Velmara.' },
    brokerOffice: { x: 300, y: 1450, name: 'Broker’s Office', desc: 'A quiet man with loud money.' },
    docks: { x: 3100, y: 250, name: 'Goldport Docks', desc: 'Container yard, crane 4.' },
    goldBank: { x: 1900, y: 1150, name: 'Gold Bank of Velmara', desc: 'Vault full of other people’s gold.' },
    casino: { x: 2300, y: 1150, name: 'Casino El Dorado', desc: 'All gold, all night.' },
    gunShop: { x: 1100, y: 1450, name: 'Ammo & Iron', desc: 'Guns, ammo, no questions.' },
    garage: { x: 2700, y: 1750, name: 'Turbo Lucho’s Garage', desc: 'Tune it, paint it, make it yours.' },
    hospital: { x: 1500, y: 2050, name: 'St. Velmara Hospital', desc: 'Patch up, walk out.' },
    policeHQ: { x: 2300, y: 850, name: 'VPD Headquarters', desc: 'Best avoided.' },
    helipad: { x: 3100, y: 1750, name: 'Rooftop Helipad', desc: 'A helicopter with the keys in it.' },
    solPlaza: { x: 1500, y: 550, name: 'Sol Plaza', desc: 'Fountains, pigeons, pickpockets.' },
    marinaRestaurant: { x: 2700, y: 1450, name: 'La Perla Restaurant', desc: 'White tablecloths, dark business.' },
    warehouse: { x: 2300, y: 2050, name: 'Warehouse 9', desc: 'Rival gang turf.' },
    showdownPier: { x: 3300, y: 550, name: 'Pier 12', desc: 'Where it ends.' }
  };

  V.CARS = [
    { id: 'primo', name: 'Primo', kind: 'sedan', top: 250, accel: 150, brake: 320, grip: 2.6, len: 46, wid: 22, price: 0, colors: ['#c0392b', '#2e6fb0', '#d8d8d8', '#2f2f38'] },
    { id: 'blista', name: 'Blista', kind: 'compact', top: 225, accel: 165, brake: 340, grip: 3.0, len: 40, wid: 20, price: 1200, colors: ['#e8c33c', '#3fae6a', '#e07a2e', '#7a5fd0'] },
    { id: 'taxi', name: 'Cab', kind: 'taxi', top: 235, accel: 150, brake: 330, grip: 2.7, len: 46, wid: 22, price: 2500, colors: ['#f2c200'] },
    { id: 'stallion', name: 'Stallion', kind: 'muscle', top: 305, accel: 200, brake: 300, grip: 2.3, len: 48, wid: 23, price: 9000, colors: ['#8e1f2f', '#1f2a44', '#e8e8e8'] },
    { id: 'comet', name: 'Comet S', kind: 'sports', top: 350, accel: 235, brake: 360, grip: 3.2, len: 46, wid: 22, price: 22000, colors: ['#ff2e88', '#ffd23c', '#18c8e8', '#111318'] },
    { id: 'mule', name: 'Mule Van', kind: 'van', top: 200, accel: 120, brake: 280, grip: 2.1, len: 54, wid: 24, price: 4000, colors: ['#d8d8d8', '#5d6b7a', '#7a4a2e'] },
    { id: 'hauler', name: 'Hauler', kind: 'truck', top: 190, accel: 105, brake: 250, grip: 1.9, len: 62, wid: 26, price: 6000, colors: ['#c9722e', '#3c6f4a', '#8a8a92'] },
    { id: 'interceptor', name: 'Interceptor', kind: 'police', top: 335, accel: 225, brake: 370, grip: 3.1, len: 48, wid: 23, price: 0, colors: ['#1c2733'] }
  ];

  V.WEAPONS = [
    { id: 'fists', name: 'Fists', dmg: 14, rate: 0.32, range: 46, auto: false, price: 0, ammoPrice: 0, spread: 0, color: '#e8b98a' },
    { id: 'pistol', name: 'P9 Pistol', dmg: 26, rate: 0.28, range: 420, auto: false, price: 300, ammoPrice: 0, spread: 0.03, color: '#c8c8d0' },
    { id: 'smg', name: 'VSP-9 SMG', dmg: 17, rate: 0.09, range: 380, auto: true, price: 800, ammoPrice: 60, spread: 0.09, color: '#3c3c46' },
    { id: 'shotgun', name: 'Boomstick', dmg: 11, rate: 0.7, range: 300, auto: false, price: 1200, ammoPrice: 120, spread: 0.16, pellets: 7, color: '#6b4a2e' },
    { id: 'rifle', name: 'Longshot Rifle', dmg: 48, rate: 0.55, range: 620, auto: false, price: 2000, ammoPrice: 150, spread: 0.01, color: '#2e4a3c' }
  ];

  V.RADIO = [
    { id: 'neon', name: 'NEON FM 88.1', tag: 'Neon Nights', bpm: 112, root: 45, scale: [0, 3, 5, 7, 10], wave: 'sawtooth', color: '#ff2e88' },
    { id: 'sol', name: 'RADIO SOL 101.5', tag: 'Calle Sol', bpm: 96, root: 41, scale: [0, 2, 4, 7, 9], wave: 'triangle', color: '#e8a13c' },
    { id: 'gold', name: 'GOLD COAST 94.7', tag: 'Slow Gold', bpm: 76, root: 38, scale: [0, 3, 5, 8, 10], wave: 'sine', color: '#2e8f7a' }
  ];

  // 24 gold coins scattered across the city. Collecting one pays $150.
  V.COINS = [
    [300, 250], [1100, 250], [1900, 250], [2700, 250], [700, 850], [1500, 850], [2300, 850],
    [300, 1150], [1100, 1150], [2700, 1150], [700, 1450], [1900, 1450], [3100, 1450],
    [300, 1750], [1500, 1750], [2300, 1750], [700, 2050], [1100, 2050], [2700, 2050],
    [300, 2350], [1100, 2350], [1900, 2350], [2700, 2350], [3300, 1150]
  ].map(function (p, i) { return { id: i, x: p[0], y: p[1], taken: false }; });

  V.RACES = [
    { id: 'neon', name: 'Neon Run', start: [1100, 250], prize: 1200, laps: 1, gates: [[1100, 850], [1900, 850], [1900, 1750], [1100, 1750], [1100, 250]] },
    { id: 'beach', name: 'Beach Dash', start: [300, 2050], prize: 900, laps: 1, gates: [[300, 2350], [1500, 2350], [2300, 2350], [2300, 2050], [300, 2050]] },
    { id: 'dock', name: 'Dock Sprint', start: [3100, 2350], prize: 1500, laps: 1, gates: [[3100, 1150], [3100, 250], [2300, 250], [2300, 2350], [3100, 2350]] }
  ];

  V.PAYNSPRAY = [
    { x: 700, y: 2050, name: 'Pay N’ Spray — Marina' },
    { x: 2700, y: 550, name: 'Pay N’ Spray — Docks' }
  ];

  // Mission steps: goto (reach marker), interact (press E at marker), collect (walk/drive over n
  // mission coins), kill (defeat n enemies), survive (stay alive n seconds), race (hit gates in
  // order), escape (drop wanted to 0), deliver (goto while carrying), choice (press 1 or 2).
  V.MISSIONS = [
    { id: 1, act: 1, title: 'First Gold', reward: 400,
      brief: 'Riko Vale is back in Velmara with empty pockets. A package waits at the warehouse on Sol Plaza. Pick it up and bring it home.',
      steps: [
        { kind: 'interact', x: 1100, y: 550, r: 70, text: 'Pick up the package at the warehouse' },
        { kind: 'deliver', x: 700, y: 550, r: 80, text: 'Deliver the package to your safehouse' }
      ] },
    { id: 2, act: 1, title: 'Taxi for Marisol', reward: 600,
      brief: 'Marisol needs a ride to La Perla and she pays in cash. Get a car, pick her up at Sol Plaza, and drive her there before she is late.',
      steps: [
        { kind: 'goto', x: 1500, y: 550, r: 90, text: 'Get in a car and reach Sol Plaza', needCar: true },
        { kind: 'interact', x: 1500, y: 550, r: 70, text: 'Pick up Marisol (press E)' },
        { kind: 'deliver', x: 2700, y: 1450, r: 90, text: 'Drive Marisol to La Perla — don’t keep her waiting', timer: 90 }
      ] },
    { id: 3, act: 1, title: 'Gold Rush', reward: 800,
      brief: 'Word is the old crew hid gold coins all over the Neon Strip. Grab five of them and prove you still know these streets.',
      steps: [
        { kind: 'collect', count: 5, spots: [[1100, 850], [1500, 850], [1900, 850], [1500, 1150], [1900, 1150], [2300, 850], [1100, 1150]], text: 'Collect 5 gold coins around the Neon Strip' }
      ] },
    { id: 4, act: 1, title: 'The Broker’s Call', reward: 1000,
      brief: 'The Broker wants to meet at his Marina office. He has work — and someone else wants you dead before you get it.',
      steps: [
        { kind: 'goto', x: 300, y: 1450, r: 80, text: 'Meet the Broker at his Marina office' },
        { kind: 'kill', count: 3, spawn: [300, 1450], text: 'Ambush! Take out the three hitmen' },
        { kind: 'goto', x: 700, y: 550, r: 80, text: 'Get back to the safehouse in one piece' }
      ] },
    { id: 5, act: 2, title: 'Neon Run', reward: 1200,
      brief: 'The street racers own the night. Beat their best driver in the Neon Run and the whole Strip will know your name.',
      steps: [
        { kind: 'race', race: 'neon', text: 'Win the Neon Run street race' }
      ] },
    { id: 6, act: 2, title: 'Payback', reward: 1000,
      brief: 'The Vipers jumped one of Marisol’s couriers at Warehouse 9. Go there and remind them who runs these streets.',
      steps: [
        { kind: 'kill', count: 4, spawn: [2300, 2050], text: 'Clear Warehouse 9 of Vipers' }
      ] },
    { id: 7, act: 2, title: 'Two Roads', reward: 1500, branch: true,
      brief: 'Marisol’s café is about to be hit — and the Broker has a vault job the same night. You can only be in one place. Choose.',
      steps: [
        { kind: 'choice', text: 'Choose: [1] Protect Casa Marisol  or  [2] Rob the Gold Bank with the Broker' }
      ] },
    { id: 8, act: 2, title: 'Aftermath', reward: 1500,
      brief: 'The choice is made. Now finish what it started.',
      steps: [] }, // steps filled at runtime from the branch chosen in mission 7
    { id: 9, act: 2, title: 'Helicopter Heist', reward: 2000,
      brief: 'A VPD helicopter sits on the helipad with the keys in it. Take it — and survive the whole city coming after you.',
      steps: [
        { kind: 'goto', x: 3100, y: 1750, r: 80, text: 'Reach the rooftop helipad' },
        { kind: 'survive', seconds: 45, wanted: 4, text: 'Survive 45 seconds at 4 stars!' }
      ] },
    { id: 10, act: 3, title: 'The Big Score', reward: 3000,
      brief: 'Casino El Dorado keeps its gold in a back room. Walk in, take it, and get out before the VPD locks the Strip down.',
      steps: [
        { kind: 'interact', x: 2300, y: 1150, r: 70, text: 'Grab the gold at Casino El Dorado (press E)' },
        { kind: 'deliver', x: 1900, y: 1450, r: 90, text: 'Reach the getaway car — wanted level rising!', wanted: 3 },
        { kind: 'deliver', x: 700, y: 550, r: 90, text: 'Drive the gold home to the safehouse' }
      ] },
    { id: 11, act: 3, title: 'Showdown', reward: 3000,
      brief: 'El Toro, the man behind everything, is waiting at Pier 12 with his whole crew. End it tonight.',
      steps: [
        { kind: 'kill', count: 7, spawn: [3300, 550], boss: true, text: 'Take down El Toro and his crew at Pier 12' }
      ] },
    { id: 12, act: 3, title: 'Streets of Gold', reward: 5000,
      brief: 'One last delivery. The gold goes home, the city is yours, and Velmara finally knows the name Riko Vale.',
      steps: [
        { kind: 'deliver', x: 700, y: 550, r: 90, text: 'Bring the gold home — final delivery' }
      ] }
  ];

  V.BRANCH_MISSIONS = {
    marisol: [
      { kind: 'kill', count: 6, spawn: [1500, 850], text: 'Defend Casa Marisol — stop the Viper waves!' },
      { kind: 'goto', x: 700, y: 550, r: 80, text: 'Return to the safehouse' }
    ],
    broker: [
      { kind: 'interact', x: 1900, y: 1150, r: 70, text: 'Crack the Gold Bank vault (press E)' },
      { kind: 'escape', text: 'Lose the cops — get your wanted level to zero!' },
      { kind: 'deliver', x: 300, y: 1450, r: 80, text: 'Deliver the Broker’s cut to his office' }
    ]
  };

  V.BRANCH_M8 = {
    marisol: { title: 'Marisol’s Revenge', brief: 'The Vipers’ lieutenant hides at the docks. Marisol wants him gone — permanently.',
      steps: [{ kind: 'kill', count: 4, spawn: [3100, 850], text: 'Take out the lieutenant and his guards at the docks' }] },
    broker: { title: 'The Broker’s Cut', brief: 'The vault gold is hot. Get the Broker’s cut to his office while the VPD is still looking.',
      steps: [{ kind: 'deliver', x: 300, y: 1450, r: 80, text: 'Deliver the gold to the Broker’s office', wanted: 2 }] }
  };

  V.STORY = {
    intro: 'VELMARA — a sun-soaked city where gold flows like water and everyone wants a cut. Riko Vale came home broke. Tonight, that changes.',
    actNames: { 1: 'ACT I — GOLD RUSH', 2: 'ACT II — STREETS OF GOLD', 3: 'ACT III — KING OF VELMARA' },
    outro: 'The gold is home. The Strip chants your name. Riko Vale — king of Velmara. Free roam unlocked: keep driving, keep earning.'
  };

  V.TIPS = [
    'WASD drive / walk — E enter car, pick up, talk. SPACE brake. SHIFT sprint.',
    'Mouse aims, CLICK shoots. Press Q to swap weapons, 1-5 to pick one.',
    'Steal any parked car with E. Cops nearby will notice — check the stars.',
    'Gold coins pay $150 each. Taxis pay double at night. Races pay up to $1,500.',
    'Pay N’ Spray wipes your wanted level for $100. G toggles GPS autopilot.',
    'R changes the radio station. M mutes. P pauses. F5 quick-saves at the safehouse.',
    'Honk with H. Headlights with L. Your car is faster than running — usually.'
  ];

  V.PED_NAMES = ['Ana', 'Beto', 'Carla', 'Diego', 'Elena', 'Felix', 'Gabi', 'Hugo', 'Ines', 'Jorge', 'Luz', 'Marco', 'Nina', 'Oscar', 'Pilar', 'Rosa', 'Tomas', 'Vera'];
  V.TAXI_LINES = ['La Perla, please — and step on it!', 'Neon Strip, the casino. I feel lucky.', 'Take me to the beach, driver.', 'Sol Plaza, quick! I’m late!', 'Goldport Docks. Don’t ask why.'];
})();
