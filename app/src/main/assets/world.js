(() => {
  'use strict';

  const tile = 32;
  const cols = 130;
  const rows = 72;
  const width = cols * tile;
  const height = rows * tile;
  const spawn = { x: 386, y: -9 };
  const floor = [
    [0, 248], [140, 370], [300, 420], [490, 442], [700, 487], [850, 516],
    [970, 390], [1080, 465], [1210, 628], [1370, 590], [1550, 760],
    [1700, 725], [1840, 877], [2050, 787], [2200, 650], [2340, 737],
    [2470, 805], [2580, 1050], [2700, 900], [2820, 1260], [2950, 1710],
    [3090, 1955], [3270, 2010], [3380, 1790], [3470, 1660],
    [3560, 1450], [3680, 1410], [3790, 1150], [3900, 780], [4160, 520],
  ];

  const passages = [
    [94, [[1344, 526], [1350, 720], [1180, 860], [930, 860], [804, 940], [636, 1060]]],
    [76, [[640, 1040], [650, 1170], [852, 1290], [1050, 1290], [1235, 1155], [1400, 1100], [1530, 950], [1430, 812]]],
    [59, [[925, 870], [1024, 985], [960, 1130], [1050, 1280]]],
    [69, [[690, 1130], [510, 1070], [390, 1090]]],
    [104, [[1910, 798], [1920, 969], [2090, 1095], [2300, 1085], [2440, 995], [2580, 985]]],
    [69, [[2100, 1100], [2110, 1254], [1930, 1370], [1750, 1390], [1580, 1315], [1510, 1160], [1430, 1130]]],
    [86, [[2320, 1090], [2410, 1240], [2320, 1430], [2380, 1570], [2540, 1690], [2730, 1630], [2890, 1470], [2990, 1440]]],
    [64, [[1930, 1370], [2000, 1530], [1840, 1660], [1640, 1640]]],
    [72, [[2380, 1570], [2270, 1740], [2135, 1870], [1950, 1890], [1770, 2010], [1570, 2000]]],
    [67, [[2730, 1630], [2810, 1810], [2650, 1950], [2520, 1960], [2460, 2070], [2210, 2110], [2070, 2050], [1980, 1885]]],
    [61, [[3510, 1330], [3635, 1520], [3760, 1670], [3720, 1830], [3540, 1920], [3300, 1900]]],
    [75, [[3745, 1670], [3890, 1620], [3970, 1695], [3980, 1835]]],
  ];

  const rooms = [
    [637, 1085, 158, 128], [397, 1090, 106, 95], [855, 1270, 180, 112],
    [2080, 1115, 155, 126], [1740, 1390, 126, 111], [1640, 1630, 106, 112],
    [2545, 1645, 174, 150], [1920, 1875, 110, 95], [1550, 2000, 127, 105],
    [2220, 2080, 174, 123], [3965, 1825, 112, 112],
  ];

  const islands = [
    [890, 214, 146, 43], [1636, 480, 218, 72], [2178, 342, 145, 53],
    [2670, 625, 155, 57], [3160, 770, 270, 62], [3320, 1250, 182, 94],
    [3760, 400, 150, 78], [2936, 1030, 75, 94],
    [750, 1115, 42, 47], [2175, 1114, 33, 42],
  ];

  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  const mix = (a, b, t) => a + (b - a) * t;
  function seed(n) {
    const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return value - Math.floor(value);
  }
  function seaFloor(x) {
    for (let i = 1; i < floor.length; i++) {
      const [right, bottom] = floor[i];
      if (right < x) continue;
      const [left, top] = floor[i - 1];
      return mix(top, bottom, (x - left) / (right - left));
    }
    return floor.at(-1)[1];
  }
  function distanceToSegment(x, y, a, b) {
    const u = b[0] - a[0];
    const v = b[1] - a[1];
    const t = clamp(((x - a[0]) * u + (y - a[1]) * v) / (u * u + v * v), 0, 1);
    return Math.hypot(x - (a[0] + u * t), y - (a[1] + v * t));
  }
  function ellipse(x, y, [cx, cy, rx, ry]) {
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
  }
  function rock(x, y) {
    const ripple = 11 * Math.sin(x * .026 + y * .018) + 8 * Math.cos(x * .049 - y * .031);
    if (y < seaFloor(x) + ripple) return islands.some(room => ellipse(x, y, room) < 1 + ripple / 85);
    if (rooms.some(room => ellipse(x, y, room) < 1 + ripple / 105)) return false;
    for (const [radius, points] of passages) {
      for (let i = 1; i < points.length; i++) {
        if (distanceToSegment(x, y, points[i - 1], points[i]) < radius + ripple) return false;
      }
    }
    return true;
  }

  const terrain = Array.from({ length: rows }, (_, j) =>
    Uint8Array.from({ length: cols }, (_, i) => Number(rock((i + .5) * tile, (j + .5) * tile)))
  );
  function cell(i, j) {
    if (i < 0 || i >= cols || j >= rows) return 1;
    return j < 0 ? 0 : terrain[j][i];
  }
  function solid(x, y) {
    return Boolean(cell(Math.floor(x / tile), Math.floor(y / tile)));
  }
  function fits(x, y, radius = 10) {
    const diagonal = radius * .71;
    return !solid(x, y) && !solid(x + radius, y) && !solid(x - radius, y)
      && !solid(x, y + radius) && !solid(x, y - radius)
      && !solid(x + diagonal, y + diagonal) && !solid(x - diagonal, y + diagonal)
      && !solid(x + diagonal, y - diagonal) && !solid(x - diagonal, y - diagonal);
  }
  function lineClear(x, y, toX, toY) {
    const count = Math.ceil(Math.hypot(toX - x, toY - y) / 14);
    for (let i = 1; i < count; i++) {
      if (solid(mix(x, toX, i / count), mix(y, toY, i / count))) return false;
    }
    return true;
  }

  const treasureTypes = [
    { name: 'Морская звезда', plural: 'Морские звёзды', xp: 25, color: '#ff9e8d' },
    { name: 'Жемчужина', plural: 'Жемчуг', xp: 60, color: '#a9eaf9' },
    { name: 'Золото', plural: 'Золото', xp: 125, color: '#ffcc72' },
    { name: 'Артефакт', plural: 'Артефакты', xp: 290, color: '#c8acf9' },
  ];
  const treasures = [
    [480, 150, 0], [305, 245, 0], [580, 320, 0], [785, 350, 0], [1048, 308, 0],
    [150, 235, 0], [694, 407, 1], [1248, 506, 1], [1630, 625, 1],
    [2010, 507, 0], [2270, 536, 1], [2554, 831, 1], [3655, 1070, 1],
    [1354, 720, 1], [1010, 882, 1], [410, 1085, 2], [817, 1288, 2],
    [1415, 1086, 2], [2120, 1030, 1], [2460, 1017, 1], [1660, 1360, 2],
    [1660, 1645, 2], [2510, 1565, 2], [2740, 1600, 2], [3225, 1840, 2],
    [3600, 1910, 2], [3980, 1868, 3], [1540, 2010, 3], [2275, 2088, 3],
    [3260, 1055, 1], [3060, 1560, 2], [365, 355, 0],
  ].map(([x, y, type], id) => ({ id, x, y, type }));
  const mineSites = [
    [1170, 384], [1810, 625], [2410, 625], [2850, 746], [3340, 950], [3520, 1090],
    [1100, 850], [1100, 1247], [1490, 980], [1980, 1030], [2408, 1240],
    [1920, 1370], [2480, 1610], [2770, 1720], [3050, 1640],
    [3710, 1620], [3855, 1670], [2040, 1887], [1700, 2000], [2390, 2040],
  ];
  const predatorTypes = [
    { name: 'Барракуда', hp: 1, patrol: 66, chase: 180, range: 185, size: 17, xp: 45, damage: 1, color: '#a0d1c7' },
    { name: 'Рифовая акула', hp: 2, patrol: 77, chase: 227, range: 230, size: 31, xp: 95, damage: 1, color: '#6cabb7' },
    { name: 'Пещерная мурена', hp: 3, patrol: 65, chase: 242, range: 205, size: 27, xp: 145, damage: 1, color: '#a1af7b' },
    { name: 'Глубинная акула', hp: 4, patrol: 75, chase: 271, range: 245, size: 40, xp: 240, damage: 2, color: '#9b83af' },
  ];
  const predatorSites = [
    [872, 320, 0], [1400, 360, 0], [1900, 500, 0], [2380, 535, 1], [2820, 550, 1],
    [1190, 860, 0], [667, 1140, 2], [925, 1250, 1], [2210, 1050, 1], [1730, 1410, 2],
    [2580, 1670, 2], [3180, 1530, 1], [3260, 1835, 3], [3755, 1770, 2],
    [1955, 1890, 3], [2220, 2135, 3], [1570, 1940, 2],
  ];
  const zones = [
    { id: 'bay', name: 'Зелёная бухта' },
    { id: 'reef', name: 'Коралловый риф' },
    { id: 'grotto', name: 'Известковые гроты' },
    { id: 'trench', name: 'Синий разлом' },
    { id: 'ruins', name: 'Затонувшие руины' },
  ];
  function zone(x, y) {
    if (y > 1710 && (x < 2850 || x > 3630)) return zones[4];
    if (x > 2730 && y > 660) return zones[3];
    if (y > 768 && x < 2750) return zones[2];
    return x < 980 ? zones[0] : zones[1];
  }
  window.DepthWorld = {
    tile, cols, rows, width, height, spawn, clamp, mix, seed, terrain, cell, solid,
    fits, lineClear, treasures, treasureTypes, mineSites, predatorTypes, predatorSites, zones, zone,
  };
})();
