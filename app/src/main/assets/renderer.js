(() => {
  'use strict';

  const W = window.DepthWorld;
  const { knifeReach, knifeArc, knifeDuration } = window.DepthSimulation;
  const tau = Math.PI * 2;
  const chunkSize = 384;
  const diverScale = 1.48;
  const predatorScale = 1.38;
  const rockPath = new Path2D();
  const edges = new Map();

  function edge(x, y, ex, ey, direction) {
    const key = y * (W.cols + 1) + x;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({ x, y, ex, ey, direction });
  }
  for (let y = 0; y < W.rows; y++) {
    for (let x = 0; x < W.cols; x++) {
      if (!W.cell(x, y)) continue;
      if (y === 0 || !W.cell(x, y - 1)) edge(x, y, x + 1, y, 0);
      if (x === W.cols - 1 || !W.cell(x + 1, y)) edge(x + 1, y, x + 1, y + 1, 1);
      if (y === W.rows - 1 || !W.cell(x, y + 1)) edge(x + 1, y + 1, x, y + 1, 2);
      if (x === 0 || !W.cell(x - 1, y)) edge(x, y + 1, x, y, 3);
    }
  }
  for (const [key, list] of edges) {
    for (const first of list) {
      if (first.used) continue;
      const points = [];
      let next = first;
      while (next && !next.used) {
        next.used = true;
        const number = next.y * 175 + next.x;
        const inset = next.x > 0 && next.x < W.cols ? (W.seed(number) - .5) * 10 : 0;
        points.push([next.x * W.tile + inset, next.y * W.tile + (W.seed(number + 708) - .5) * 10]);
        const at = next.ey * (W.cols + 1) + next.ex;
        if (at === key) break;
        const targets = (edges.get(at) || []).filter(candidate => !candidate.used);
        next = targets.find(candidate => candidate.direction === (next.direction + 1) % 4) || targets[0];
      }
      if (points.length < 3) continue;
      const last = points[points.length - 1];
      rockPath.moveTo((last[0] + points[0][0]) / 2, (last[1] + points[0][1]) / 2);
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        const [nx, ny] = points[(i + 1) % points.length];
        rockPath.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      }
      rockPath.closePath();
    }
  }

  const waterPath = new Path2D();
  waterPath.rect(-1000, -1000, W.width + 2000, W.height + 2000);
  waterPath.addPath(rockPath);

  function polygon(c, color, ...points) {
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }
  function line(c, color, width, ...points) {
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  function disc(c, x, y, radius, color) {
    c.beginPath();
    c.arc(x, y, radius, 0, tau);
    c.fillStyle = color;
    c.fill();
  }
  function ellipse(c, x, y, rx, ry, rotation, color) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rotation, 0, tau);
    c.fillStyle = color;
    c.fill();
  }
  function path(c, color, draw) {
    c.beginPath();
    draw(c);
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }
  function glow(c, x, y, radius, rgb, strength = 1) {
    const light = c.createRadialGradient(x, y, 0, x, y, radius);
    light.addColorStop(0, rgba(rgb, strength));
    light.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = light;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  function rgba(rgb, alpha) { return 'rgba(' + rgb + ',' + alpha + ')'; }

  const plantColors = [
    ['#226467', '#47a597'], ['#6f464d', '#c37d6c'], ['#365e68', '#65aab0'],
    ['#605d4a', '#b3a777'], ['#3b4e75', '#797bac'], ['#1c5451', '#3b8772'],
  ];
  function garden(c, i, j) {
    const n = i * 57 + j * 143;
    const r = W.seed(n);
    if (r > .62) return;
    const x = (i + .30 + W.seed(n + 2) * .4) * W.tile;
    const y = j * W.tile + 4;
    const size = 15 + 28 * W.seed(n + 1);
    const colors = plantColors[Math.floor(W.seed(n + 4) * plantColors.length)];
    c.save();
    c.translate(x, y);
    if (r < .25) {
      for (let k = 0; k < 6; k++) {
        const drift = (W.seed(n + k * 2 + 5) - .5) * size;
        const rise = (.3 + .75 * W.seed(n + k * 2 + 6)) * size;
        c.beginPath();
        c.moveTo(k - 3, 5);
        c.quadraticCurveTo(-drift * .25, -rise * .44, drift, -rise);
        c.lineWidth = 2 + W.seed(n + k + 31) * 3;
        c.strokeStyle = colors[k % 2];
        c.lineCap = 'round';
        c.stroke();
        if (k % 2) {
          line(c, colors[1], 1.6, [drift * .6, -rise * .69], [drift * .8 + 4, -rise * .79], [drift + 6, -rise * .91]);
          disc(c, drift, -rise, 1.8, colors[1]);
        }
      }
    } else if (r < .49) {
      for (let k = 0; k < 4; k++) {
        const drift = (k - 1.4) * size * .32;
        const rise = (W.seed(n + 8 + k) * .64 + .25) * size;
        path(c, colors[k % 2], p => {
          p.moveTo(k - 1.5, 3);
          p.quadraticCurveTo(drift * .24 - 7, -rise * .58, drift, -rise);
          p.quadraticCurveTo(drift * .55 + 7, -rise * .74, k + 3, 4);
        });
      }
    } else {
      for (let k = 0; k < 5; k++) {
        const drift = (k - 2) * 6;
        const rise = (W.seed(n + 8 + k) * .5 + .13) * size;
        line(c, colors[0], 5, [drift * .66, 3], [drift, -rise]);
        ellipse(c, drift, -rise, 4, 2.1, -.1, colors[1]);
        ellipse(c, drift, -rise, 2.4, 1.1, -.1, '#112d35');
      }
    }
    c.restore();
  }

  const chunks = new Map();
  function chunk(ix, iy) {
    const key = ix + ',' + iy;
    if (chunks.has(key)) {
      const existing = chunks.get(key);
      chunks.delete(key);
      chunks.set(key, existing);
      return existing;
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = chunkSize;
    const c = canvas.getContext('2d');
    const x = ix * chunkSize;
    const y = iy * chunkSize;
    c.translate(-x, -y);
    const base = c.createLinearGradient(x, y, x + chunkSize * .23, y + chunkSize);
    const shade = Math.max(0, 1 - y / 2350);
    base.addColorStop(0, 'hsl(' + (194 - shade * 18) + ', 39%, ' + (11 + shade * 8) + '%)');
    base.addColorStop(1, 'hsl(' + (207 - shade * 21) + ', 43%, ' + (8 + shade * 7) + '%)');
    c.fillStyle = base;
    c.fill(rockPath, 'evenodd');
    c.save();
    c.clip(rockPath, 'evenodd');
    c.lineWidth = 13;
    c.strokeStyle = rgba('91,153,146', .085 + shade * .06);
    c.stroke(rockPath);
    c.lineWidth = 3.4;
    c.strokeStyle = rgba('114,181,163', .18 + shade * .14);
    c.stroke(rockPath);
    for (let j = y / W.tile - 1; j < (y + chunkSize) / W.tile + 1; j++) {
      for (let i = x / W.tile - 1; i < (x + chunkSize) / W.tile + 1; i++) {
        if (!W.cell(i, j)) continue;
        const n = i * 330 + j * 536;
        const u = (i + W.seed(n)) * W.tile;
        const v = (j + W.seed(n + 1)) * W.tile;
        const w = 16 + W.seed(n + 2) * 29;
        const exposed = !W.cell(i, j - 1) || !W.cell(i + 1, j) || !W.cell(i - 1, j);
        polygon(c, rgba('118,159,149', (exposed ? .17 : .065) * W.seed(n + 7)),
          [u - w, v + 5], [u - w * .21, v - 13], [u + w * .53, v - 10], [u + w, v + 8], [u + 1, v + 23]);
        polygon(c, rgba('1,8,18', .16 + W.seed(n + 10) * .13),
          [u - w, v + 5], [u + w * .32, v + 10], [u + w, v + 8], [u + w * .2, v + 24]);
        if (exposed && W.seed(n + 20) > .35) {
          line(c, 'rgba(129,185,163,.17)', 1.2, [u - w * .6, v - 4], [u, v - 9], [u + w * .41, v - 7]);
        }
        for (let k = 0; k < 9; k++) {
          const a = W.seed(n + k * 4 + 25);
          const b = W.seed(n + k * 4 + 26);
          disc(c, u - 15 + a * 31, v - 15 + b * 31, .45 + a * 1.1, rgba('145,189,162', .055 + b * .13));
        }
      }
    }
    c.restore();
    for (let j = Math.max(1, y / W.tile - 1); j <= Math.min(W.rows - 1, (y + chunkSize + 56) / W.tile); j++) {
      for (let i = Math.max(0, x / W.tile - 1); i < Math.min(W.cols, (x + chunkSize) / W.tile + 1); i++) {
        if (W.cell(i, j) && !W.cell(i, j - 1)) garden(c, i, j);
      }
    }
    if (chunks.size >= 22) {
      const oldest = chunks.keys().next().value;
      const discarded = chunks.get(oldest);
      discarded.width = discarded.height = 1;
      chunks.delete(oldest);
    }
    chunks.set(key, canvas);
    return canvas;
  }

  function boat(c, time) {
    const x = W.spawn.x;
    const y = -11 + Math.sin(time * 1.65) * 2;
    c.save();
    c.translate(x, y);
    ellipse(c, -3, 12, 75, 12, 0, '#1634404c');
    line(c, '#a8cfb6', 1.4, [-5, -1], [6, 18], [6, 66], [21, 103]);
    line(c, '#255a60', 1.3, [21, 103], [21, 128]);
    path(c, '#172f3c', p => { p.moveTo(-61, -12); p.lineTo(63, -12); p.lineTo(42, 12); p.quadraticCurveTo(0, 18, -45, 9); });
    path(c, '#f09263', p => { p.moveTo(-62, -13); p.lineTo(63, -13); p.lineTo(54, -4); p.lineTo(-55, -4); });
    line(c, '#ffc493', 1.5, [-58, -12], [59, -12]);
    polygon(c, '#295868', [-34, -13], [-24, -27], [18, -27], [31, -13]);
    polygon(c, '#a4d1cb', [-22, -25], [17, -25], [22, -20], [-26, -20]);
    line(c, '#d7ece0', 1.6, [-25, -27], [15, -27], [15, -52]);
    polygon(c, '#e5f6a5', [16, -52], [38, -49 + Math.sin(time * 3) * 3], [16, -42]);
    c.restore();
  }

  function splash(c, x, y, time) {
    c.save();
    c.globalAlpha = .48;
    for (let i = 0; i < 3; i++) {
      const f = (time * .9 + i / 3) % 1;
      c.strokeStyle = rgba('214,255,233', .7 * (1 - f));
      c.lineWidth = 1.1;
      c.beginPath();
      c.ellipse(x, y, 9 + f * 48, 2 + f * 5, 0, 0, tau);
      c.stroke();
    }
    c.restore();
  }

  function diver(c, p, dive) {
    const time = dive.phase;
    const surface = dive.atSurface;
    const moving = Math.min(1, Math.hypot(p.vx, p.vy) / 180);
    const kick = Math.sin(time * (dive.sprint ? 24 : 11)) * (4 + 9 * moving);
    c.save();
    c.translate(p.x, p.y + (surface ? Math.sin(time * 2.6) * 3 : 0));
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 13) % 2) c.globalAlpha = .42;
    let angle = p.angle;
    let flip = false;
    if (surface && moving < .15) angle = p.face > 0 ? .36 : Math.PI - .36;
    if (Math.cos(angle) < 0) flip = true;
    c.rotate(angle);
    c.scale(diverScale, flip ? -diverScale : diverScale);

    c.lineCap = 'round';
    c.lineJoin = 'round';
    line(c, '#2a5363', 7.5, [-3, 4], [-16, 7 - kick * .28], [-27, 6 - kick * .57]);
    polygon(c, '#317c7a', [-24, 3 - kick*.55], [-37, 1 - kick], [-50, 7 - kick], [-37, 12 - kick], [-26, 9 - kick*.54]);
    line(c, '#153843', 9, [-4, 2], [-15, 0 + kick * .29], [-25, 3 + kick * .53]);
    line(c, '#4e8586', 2.4, [-11, 1 + kick * .12], [-17, 1 + kick*.30], [-24, 2 + kick * .5]);
    polygon(c, '#cce889', [-22, 0 + kick*.51], [-35, 1 + kick*.77], [-49, 7 + kick], [-35, 12 + kick*.81], [-23, 7 + kick*.54]);
    line(c, '#647c56', 1.2, [-27, 5 + kick*.6], [-42, 7 + kick*.9]);

    path(c, '#193a49', q => {
      q.moveTo(-10, -3); q.quadraticCurveTo(-3, -10, 9, -7);
      q.quadraticCurveTo(17, -4, 13, 2); q.quadraticCurveTo(7, 8, -7, 6);
    });
    path(c, '#d4e895', q => {
      q.moveTo(-9, -4); q.quadraticCurveTo(0, -9, 10, -6);
      q.lineTo(13, -3); q.quadraticCurveTo(1, -4, -9, 1);
    });
    const arm = Math.sin(time * 7.5) * moving;
    line(c, '#366875', 5, [9, 0], [16 + arm * 2, 4 + arm * 3], [24 + arm * 4, 1 + arm * 4]);
    ellipse(c, 23 + arm * 4, 1 + arm * 4, 3.1, 2.1, 0, '#e2ab84');
    ellipse(c, 17, -5, 7.4, 6.7, 0, '#113842');
    ellipse(c, 19.5, -4.2, 5.5, 5.4, 0, '#e2ae86');
    polygon(c, '#a8ecdc', [18, -8], [25, -7], [26, -4], [19, -3]);
    line(c, '#effff0', 1, [19, -7], [23, -6.8]);
    if (dive.knifeSlash) {
      line(c, '#2b555a', 2.5, [22, 2], [28, 2]);
      polygon(c, '#e0f1de', [27, .2], [35, -1.6], [32, 3], [27, 3.4]);
    } else if (dive.value('weapon')) {
      line(c, '#b1d1c7', 2, [8, 6], [32, 5]);
      polygon(c, '#e5f2c7', [29, 2.4], [34, 4.9], [29, 7.3]);
    }
    c.restore();
  }

  function knifeSwing(c, p, slash) {
    const progress = 1 - slash.remaining / knifeDuration;
    const leading = -knifeArc + knifeArc * 2 * Math.min(1, progress * 1.65 + .20);
    const trailing = Math.max(-knifeArc, leading - .72);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(slash.angle);
    c.globalAlpha = (1 - progress) * .9;
    c.beginPath();
    c.arc(0, 0, knifeReach, trailing, leading);
    c.strokeStyle = '#dcf4dc';
    c.lineWidth = 3.2;
    c.lineCap = 'round';
    c.stroke();
    c.beginPath();
    c.arc(0, 0, knifeReach - 7, trailing + .03, leading);
    c.strokeStyle = '#a7dfd5';
    c.lineWidth = 1.5;
    c.stroke();
    c.restore();
  }

  function star(c, color) {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * tau / 10;
      const d = i % 2 === 0 ? 13 : 5.9;
      points.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    polygon(c, color, ...points);
  }
  function treasure(c, item, time) {
    const float = Math.sin(time * 1.8 + item.id * 1.3) * 3;
    const a = .24 + .08 * Math.sin(time * 2.6 + item.id);
    const palette = ['255,150,120', '161,225,251', '255,198,101', '192,155,250'];
    c.save();
    c.translate(item.x, item.y + float);
    glow(c, 0, 0, 29 + item.type * 7, palette[item.type], a + item.type * .035);
    if (item.type === 0) {
      c.rotate(-.18 + Math.sin(time + item.id) * .20);
      star(c, '#fb987f');
      line(c, '#ffd2aa', 1.1, [0,-8], [0,1], [6,4]);
      disc(c, -3.2, .6, 1.2, '#ffdcbd');
      disc(c, 1.7, .1, 1, '#ffdcbd');
    } else if (item.type === 1) {
      path(c, '#7994a9', p => { p.moveTo(-12, 2); p.quadraticCurveTo(-6, 16, 7, 11); p.quadraticCurveTo(12, 7, 13, 1); });
      ellipse(c, 0, 2, 12, 4.8, 0, '#bd9dca');
      disc(c, 0, -1.5, 7.7, '#c4eefa');
      disc(c, -2.4, -4.7, 2.6, '#f3feff');
    } else if (item.type === 2) {
      polygon(c, '#9d593f', [-13, -4], [10, -5], [13, 9], [-11, 10]);
      polygon(c, '#e9ae62', [-15, -2], [11, -3], [14, 2], [-14, 4]);
      polygon(c, '#ffda81', [-13, -5], [-6, -12], [6, -12], [12, -5]);
      line(c, '#ffecab', 1.5, [-6, -9], [5, -9]);
      polygon(c, '#ffcf77', [-2, 1], [3, 1], [3, 6], [-2, 6]);
    } else {
      c.rotate(.21);
      polygon(c, '#ae88dd', [0,-19], [10,-9], [13,10], [0,18], [-12,9], [-10,-8]);
      polygon(c, '#d9bbf4', [0,-19], [10,-9], [4,10], [0,18], [-2,1]);
      polygon(c, '#735caa', [-12,9], [-2,1], [0,18]);
      line(c, '#efe6fb', 1.5, [-1,-11], [-3,-5], [2,-2], [3,5]);
    }
    const glint = .6 + Math.sin(time * 2.5 + item.id) * .35;
    line(c, rgba('250,255,235', glint), 1, [13, -14], [21, -14]);
    line(c, rgba('250,255,235', glint), 1, [17, -18], [17, -10]);
    c.restore();
  }

  function mine(c, obj, time) {
    c.save();
    c.translate(obj.x, obj.y + Math.sin(time * 1.5 + obj.id) * 1.2);
    const pulse = .35 + .18 * Math.sin(time * 2.7 + obj.id);
    glow(c, 0, 0, obj.fuse > 0 ? 38 : 24, '249,109,72', obj.fuse > 0 ? pulse + .22 : .15);
    c.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const a = k * tau / 7;
      line(c, '#4e5e60', 4, [Math.cos(a) * 12, Math.sin(a) * 12], [Math.cos(a) * 21, Math.sin(a) * 21]);
      disc(c, Math.cos(a) * 21, Math.sin(a) * 21, 2.35, '#a17366');
    }
    disc(c, 0, 0, 15.3, '#243642');
    ellipse(c, -2, -5, 11.5, 5.1, -.28, '#526869');
    disc(c, 1, 1, 6.5, '#573635');
    disc(c, 1, 1, 3.4 + pulse, obj.fuse > 0 ? '#ffd3a6' : '#ff966e');
    if (obj.fuse > 0) {
      c.beginPath();
      c.arc(0, 0, 29 + 4 * Math.sin(time * 7), 0, tau);
      c.strokeStyle = rgba('255,158,109', pulse);
      c.lineWidth = 1.4;
      c.stroke();
    }
    c.restore();
  }

  function animal(c, obj, time) {
    const species = W.predatorTypes[obj.type];
    const k = species.size / 31 * predatorScale;
    const wiggle = Math.sin(time * (obj.chasing ? 11 : 5.4) + obj.phase);
    c.save();
    c.translate(obj.x, obj.y);
    c.scale(obj.face * k, k);
    const body = obj.stagger ? '#ccaaa1' : species.color;
    if (obj.type === 2) {
      path(c, body, p => {
        p.moveTo(25,-9); p.quadraticCurveTo(35,-11,37,-1); p.lineTo(31,6);
        p.bezierCurveTo(4,10,-17,-8,-46,wiggle * 6); p.quadraticCurveTo(-26,-15,-4,-7);
        p.quadraticCurveTo(12,0,25,-9);
      });
      for (let i = 0; i < 6; i++) disc(c, -21 + i * 8, -5 + Math.sin(i) * 2, 1.3 + i * .12, '#596950');
    } else {
      const slender = obj.type === 0 ? .56 : 1;
      c.scale(1, slender);
      path(c, '#3b697c', p => {
        p.moveTo(-24,-1); p.lineTo(-40,-16 + wiggle * 2); p.lineTo(-37,0); p.lineTo(-45,15 + wiggle * 4); p.lineTo(-19,4);
      });
      polygon(c, '#4a7487', [-14,-7], [-4,-25], [7,-10], [16,-4]);
      path(c, body, p => {
        p.moveTo(-28,-1); p.bezierCurveTo(-12,-13,17,-17,38,-4);
        p.quadraticCurveTo(30,5,18,8); p.bezierCurveTo(0,14,-19,7,-28,-1);
      });
      path(c, '#c0d6d2', p => {
        p.moveTo(-15,3); p.quadraticCurveTo(7,10,34,-1); p.quadraticCurveTo(19,14,-5,10);
      });
      polygon(c, '#517487', [4,3], [-7,17], [11,12], [16,4]);
      for (let i = 0; i < 3; i++) line(c, '#3e6675', 1, [15 - i * 3, -3], [13 - i * 3, 3]);
    }
    line(c, '#263842', 1.1, [24, 3], [34, 1]);
    disc(c, 24, -4.5, 2.5, obj.chasing ? '#ffbc81' : '#e2eee0');
    disc(c, 24.8, -4.4, 1.13, '#10212b');
    if (obj.hp < species.hp) {
      line(c, '#192932', 3.9, [-15, -31], [15, -31]);
      line(c, '#ffb59a', 2.1, [-15, -31], [-15 + 30 * obj.hp / species.hp, -31]);
    }
    c.restore();
  }

  function ruins(c, x, y) {
    c.save();
    c.translate(x, y);
    const base = '#294e59';
    const trim = '#407179';
    polygon(c, '#273d4f', [-77,39], [46,35], [82,58], [-74,63]);
    for (let i = -1; i < 2; i++) {
      const left = i * 44 - 7;
      const top = i === 0 ? -18 : -6 + i * 3;
      polygon(c, base, [left,top], [left+20,top-4], [left+21,41], [left-3,45]);
      line(c, trim, 2.2, [left+1,top], [left-1,40]);
      polygon(c, '#406272', [left-6,39], [left+23,36], [left+25,43], [left-6,48]);
      if (i === 0) polygon(c, '#507480', [left-18,-16], [left+7,-37], [left+38,-22], [left+39,-16]);
    }
    c.restore();
  }

  const school = [
    [470, 112, 9], [1010, 94, 12], [1440, 317, 13], [2140, 211, 9], [2470, 430, 13],
    [2900, 813, 6], [3435, 610, 12], [3670, 885, 11], [3045, 1390, 10], [2524, 1665, 7],
  ];

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha: false });
      this.camX = W.spawn.x;
      this.camY = 90;
      this.resize();
    }

    resize() {
      this.width = this.canvas.clientWidth;
      this.height = this.canvas.clientHeight;
      this.pixel = Math.min(window.devicePixelRatio || 1, 2, 1800 / Math.max(this.width, this.height));
      this.canvas.width = Math.max(1, Math.round(this.width * this.pixel));
      this.canvas.height = Math.max(1, Math.round(this.height * this.pixel));
      this.zoom = Math.min(1.85, Math.max(.57, this.height / 610));
    }

    snap(player) {
      this.camX = player.x;
      this.camY = Math.max(this.height / this.zoom * .25, player.y + 46);
    }

    draw(dive, elapsed) {
      const c = this.context;
      const p = dive.player;
      const scale = this.zoom * this.pixel;
      const dw = this.width / this.zoom;
      const dh = this.height / this.zoom;
      const follow = 1 - Math.exp(-elapsed * 4.5);
      this.camX = W.mix(this.camX, p.x + p.vx * .19, follow);
      this.camY = W.mix(this.camY, Math.max(dh * .25, p.y + p.vy * .13 + 33), follow);
      const left = W.clamp(this.camX - dw / 2, -76, Math.max(-76, W.width - dw + 76));
      const top = Math.min(this.camY - dh / 2, W.height - dh + 45);
      const right = left + dw;
      const bottom = top + dh;
      const time = dive.phase;
      const visible = (x, y, pad = 72) => x > left - pad && x < right + pad && y > top - pad && y < bottom + pad;
      c.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);

      const sea = c.createLinearGradient(0, -235, 0, W.height);
      sea.addColorStop(0, '#53898f');
      sea.addColorStop(.091, '#447c82');
      sea.addColorStop(.092, '#1d656b');
      sea.addColorStop(.14, '#246d72');
      sea.addColorStop(.28, '#164b59');
      sea.addColorStop(.57, '#102e44');
      sea.addColorStop(1, '#0d1a31');
      c.fillStyle = sea;
      c.fillRect(left - 1, top - 1, dw + 2, dh + 2);

      this.environment(c, left, top, right, bottom, time);
      for (let j = Math.max(0, Math.floor(top / chunkSize)); j < Math.min(Math.ceil(W.height / chunkSize), Math.ceil(bottom / chunkSize)); j++) {
        for (let i = Math.max(0, Math.floor(left / chunkSize)); i < Math.min(Math.ceil(W.width / chunkSize), Math.ceil(right / chunkSize)); i++) {
          c.drawImage(chunk(i, j), i * chunkSize, j * chunkSize);
        }
      }

      if (visible(W.spawn.x, 0, 160)) boat(c, time);
      if (dive.atSurface) splash(c, p.x, 1, time);

      for (const item of W.treasures) {
        if (visible(item.x, item.y) && !dive.haul.includes(item.id) && !dive.profile.haul.includes(item.id)) treasure(c, item, time);
      }
      for (const obj of dive.mines) if (obj.live && visible(obj.x, obj.y)) mine(c, obj, time);
      const nearbyPredators = dive.predators.filter(obj => !obj.dead && visible(obj.x, obj.y, 90));
      if (nearbyPredators.length) {
        c.save();
        c.clip(waterPath, 'evenodd');
        for (const obj of nearbyPredators) animal(c, obj, time);
        c.restore();
      }
      for (const shot of dive.shots) {
        c.save();
        c.translate(shot.x, shot.y);
        c.rotate(shot.angle);
        line(c, '#e1f1cc', 1.8, [-18, 0], [5, 0]);
        polygon(c, '#f2e4ae', [0,-3], [7,0], [0,3]);
        c.restore();
      }
      for (const effect of dive.effects) {
        c.globalAlpha = effect.ttl / effect.maxTtl;
        disc(c, effect.x, effect.y, effect.size, effect.color);
      }
      c.globalAlpha = 1;

      if (p.y > 175) {
        const fog = W.clamp((p.y - 175) / 470, 0, .82);
        const outer = Math.max(440, Math.min(dw, dh) * .85);
        const light = c.createRadialGradient(p.x, p.y, 52, p.x, p.y, outer);
        light.addColorStop(0, 'rgba(4,12,27,0)');
        light.addColorStop(.35, rgba('4,12,27', fog * .28));
        light.addColorStop(1, rgba('4,12,27', fog));
        c.fillStyle = light;
        c.fillRect(left, Math.max(top, 0), dw, bottom - Math.max(top, 0));
        glow(c, p.x, p.y, 126, '209,231,189', fog * .12);
      }
      c.save();
      if (p.y > 20 && !W.fits(p.x, p.y, 78)) c.clip(waterPath, 'evenodd');
      diver(c, p, dive);
      if (dive.knifeSlash) knifeSwing(c, p, dive.knifeSlash);
      c.restore();
    }

    environment(c, left, top, right, bottom, time) {
      if (top < 4) {
        for (let i = 0; i < 3; i++) {
          const px = i * 188 + left * .19;
          path(c, rgba('203,232,218', .07 + i * .024), p => {
            p.moveTo(px - 180, -105 - i * 19); p.quadraticCurveTo(px + 80, -143, px + 400, -100 + i * 10);
            p.quadraticCurveTo(px + 285, -93, px + 1, -95 + i * 10);
          });
        }
        for (let n = -1; n <= 3; n++) {
          const y = n * 9;
          c.beginPath();
          for (let x = left - 3; x < right + 14; x += 10) {
            const wave = y + Math.sin(x * .039 + time * 1.8 + n * .3) * (2 + Math.abs(n)) + Math.sin(x * .095 + time * 2.7) * 1.2;
            if (x === left - 3) c.moveTo(x, wave);
            else c.lineTo(x, wave);
          }
          c.strokeStyle = rgba('186,252,221', .22 / (Math.abs(n) + 1) + (n === 0 ? .48 : 0));
          c.lineWidth = n === 0 ? 2 : 1;
          c.stroke();
        }
      }
      if (top < 840 && bottom > 0) {
        c.save();
        c.beginPath();
        c.rect(left, Math.max(top, 0), right - left, Math.max(0, bottom - Math.max(top, 0)));
        c.clip();
        const light = c.createLinearGradient(0, 0, 0, 840);
        light.addColorStop(0, 'rgba(153,252,220,.18)');
        light.addColorStop(.42, 'rgba(125,240,210,.11)');
        light.addColorStop(1, 'rgba(104,229,213,0)');
        for (let i = Math.floor((left - 430) / 136); i < Math.ceil((right + 120) / 136); i++) {
          const x = i * 136 + 82 * W.seed(i + 30) + Math.sin(time * .42 + i) * 22;
          const end = x + 260 + W.seed(i + 82) * 220;
          polygon(c, light, [x,0], [x+12+W.seed(i+32)*34,0], [end+116,840], [end,840]);
        }
        c.restore();
      }

      for (let layer = 0; layer < 2; layer++) {
        const grid = layer === 0 ? 230 : 170;
        const px = left * (layer === 0 ? .42 : .66);
        const py = top * .76;
        for (let j = Math.max(0, Math.floor(py / grid) - 1); j < Math.ceil((py + (bottom - top)) / grid) + 1; j++) {
          for (let i = Math.floor(px / grid) - 1; i < Math.ceil((px + (right - left)) / grid) + 1; i++) {
            const n = i * 39 + j * 112 + layer * 309;
            const x = i * grid + (left - px) + W.seed(n) * 110;
            const y = j * grid + (top - py) + W.seed(n + 2) * 130 + 125;
            const peak = W.seed(n + 3) * 90;
            if (y < 90 || W.seed(n + 5) > (layer === 0 ? .68 : .34)) continue;
            path(c, layer === 0 ? '#102e3940' : '#10334046', p => {
              p.moveTo(x-160,y+160); p.lineTo(x-116,y+73); p.lineTo(x-64,y+59);
              p.lineTo(x-19,y+21); p.lineTo(x+27,y-peak); p.lineTo(x+67,y+20);
              p.lineTo(x+93,y+12); p.lineTo(x+145,y+91); p.lineTo(x+192,y+158);
            });
          }
        }
      }

      if (bottom > 1740) {
        for (const [x, y] of [[1545, 2045], [2275, 2130], [3978, 1914], [1945, 1925]]) {
          if (x < right + 100 && x > left - 100 && y < bottom + 100 && y > top - 100) ruins(c, x, y);
        }
      }

      for (const [x, y, count] of school) {
        if (x < left - 190 || x > right + 190 || y < top - 80 || y > bottom + 80) continue;
        for (let i = 0; i < count; i++) {
          const n = i + x;
          const v = x + (W.seed(n) - .5) * 145 + Math.sin(time * .65 + i * .26) * 42;
          const w = y + (W.seed(n + 2) - .5) * 75 + Math.sin(time * 1.4 + i) * 6;
          if (W.solid(v, w)) continue;
          const tone = rgba('152,218,209', .16 + W.seed(n + 3) * .29);
          const d = (Math.cos(time * .65 + i * .26) < 0 ? -1 : 1) * (3.4 + W.seed(n + 5) * 4.5);
          ellipse(c, v, w, Math.abs(d), Math.abs(d) * .32, .10, tone);
          polygon(c, tone, [v-d*.6,w], [v-d*1.65,w-2.8], [v-d*1.65,w+2.7]);
        }
      }

      for (let j = Math.max(0, Math.floor(top / 69)); j <= Math.ceil(bottom / 69); j++) {
        for (let i = Math.floor(left / 72); i <= Math.ceil(right / 72); i++) {
          for (let k = 0; k < 2; k++) {
            const n = i * 720 + j * 341 + k * 4314;
            const x = (i + W.seed(n)) * 72 + Math.sin(time * .4 + n) * 12;
            const y = (j + W.seed(n + 2)) * 69 + Math.cos(time * .5 + n) * 6;
            if (y < 6) continue;
            disc(c, x, y, .42 + 1.42 * W.seed(n + 3), rgba('176,244,228', .13 + W.seed(n + 4) * .42));
          }
        }
      }
    }

    drawMap(canvas, dive) {
      const c = canvas.getContext('2d');
      canvas.width = 1040;
      canvas.height = 576;
      c.setTransform(.25, 0, 0, .25, 0, 0);
      c.fillStyle = '#173a4b';
      c.fillRect(0, 0, W.width, W.height);
      c.fillStyle = '#0b202d';
      c.fill(rockPath, 'evenodd');
      c.strokeStyle = '#355568';
      c.lineWidth = 6;
      c.stroke(rockPath);
      for (const item of W.treasures) {
        if (dive.profile.haul.includes(item.id)) continue;
        disc(c, item.x, item.y, 11, W.treasureTypes[item.type].color);
      }
      c.strokeStyle = '#dff6a5';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(dive.player.x, Math.max(40, dive.player.y), 34, 0, tau);
      c.stroke();
      disc(c, dive.player.x, Math.max(40, dive.player.y), 15, '#e1f9a2');
      line(c, '#81cdbf', 4, [0,3], [W.width,3]);
    }
  }

  window.DepthRenderer = Renderer;
})();
