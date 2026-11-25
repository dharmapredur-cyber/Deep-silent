(() => {
  'use strict';

  const W = window.DepthWorld;
  const storageKey = 'quiet-depth-profile-v1';
  const upgrades = [
    { id: 'air', icon: 'air', name: 'Запас воздуха', costs: [85, 175, 315], values: [28, 36, 46, 58], unit: ' с', copy: 'Больше времени на глубине.' },
    { id: 'speed', icon: 'bolt', name: 'Скорость', costs: [100, 215, 340], values: [218, 248, 279, 313], copy: 'Быстрее гребок и рывок.' },
    { id: 'life', icon: 'heart', name: 'Запас жизней', costs: [135, 275, 420], values: [3, 4, 5, 6], unit: ' жизней', copy: 'Помогает пережить столкновения.' },
    { id: 'weapon', icon: 'spear', name: 'Гарпун', costs: [130, 280, 440], values: [0, 1, 2, 3], copy: 'Защита от хищников.' },
  ];

  function load() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { saved = null; }
    if (!saved || typeof saved !== 'object') saved = {};
    const levels = {};
    for (const item of upgrades) {
      const value = Number(saved.levels && saved.levels[item.id]) || 0;
      levels[item.id] = W.clamp(Math.floor(value), 0, item.costs.length);
    }
    return {
      xp: Math.max(0, Math.floor(Number(saved.xp) || 0)),
      levels,
      haul: Array.isArray(saved.haul) ? [...new Set(saved.haul.filter(id => Number.isInteger(id) && W.treasures[id]))] : [],
      gonePredators: Array.isArray(saved.gonePredators) ? [...new Set(saved.gonePredators.filter(id => Number.isInteger(id) && W.predatorSites[id]))] : [],
      bestDepth: Math.max(0, Math.floor(Number(saved.bestDepth) || 0)),
      foundZones: Array.isArray(saved.foundZones) ? saved.foundZones.filter(id => W.zones.some(zone => zone.id === id)) : [],
      muted: saved.muted === true,
    };
  }

  class Dive {
    constructor(announce, end) {
      this.profile = load();
      this.announce = announce;
      this.end = end;
      this.resetExpedition();
    }

    save() {
      try { localStorage.setItem(storageKey, JSON.stringify(this.profile)); } catch { /* storage may be unavailable */ }
    }

    value(id) {
      return upgrades.find(item => item.id === id).values[this.profile.levels[id]];
    }

    get atSurface() { return this.player.y <= 2; }
    get meters() { return Math.max(0, Math.round(this.player.y / 18)); }

    resetExpedition() {
      this.player = {
        x: W.spawn.x, y: W.spawn.y, vx: 0, vy: 0, angle: .18, face: 1,
        lives: this.value('life'), air: this.value('air'), stamina: 1, invulnerable: 0,
      };
      this.haul = [];
      this.haulXp = 0;
      this.effects = [];
      this.shots = [];
      this.cooldown = 0;
      this.impact = 0;
      this.airNotice = false;
      this.sprint = false;
      this.phase = 0;
      this.activeZone = W.zone(this.player.x, this.player.y);
      this.mines = W.mineSites.map(([x, y], id) => ({ x, y, id, live: true, fuse: 0 }));
      this.predators = W.predatorSites.map(([x, y, type], id) => ({
        id, x, y, homeX: x, homeY: y, type, hp: W.predatorTypes[type].hp,
        dead: this.profile.gonePredators.includes(id), face: id % 2 ? 1 : -1,
        chasing: false, stagger: 0, phase: id * 2.399,
      }));
    }

    respawn() {
      if (this.player.lives <= 0) this.resetExpedition();
      else {
        Object.assign(this.player, W.spawn, { vx: 0, vy: 0, angle: .18, face: 1,
          air: this.value('air'), stamina: 1, invulnerable: 1.5 });
        this.effects = [];
        this.shots = [];
        this.impact = 0;
        this.cooldown = 0;
        this.airNotice = false;
        this.sprint = false;
        this.activeZone = W.zone(this.player.x, this.player.y);
      }
    }

    buy(id) {
      const item = upgrades.find(candidate => candidate.id === id);
      if (!this.atSurface || !item) return false;
      const level = this.profile.levels[id];
      const cost = item.costs[level];
      if (cost === undefined || this.profile.xp < cost) return false;
      this.profile.levels[id]++;
      this.profile.xp -= cost;
      if (id === 'air') this.player.air += item.values[level + 1] - item.values[level];
      if (id === 'life') this.player.lives++;
      this.save();
      this.announce('upgrade', item.name + ' улучшен' + ({ air: '', speed: 'а', life: '', weapon: '' }[id]));
      return true;
    }

    spark(x, y, color, count = 12, speed = 110) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const force = speed * (.3 + Math.random() * .7);
        const ttl = .3 + Math.random() * .7;
        this.effects.push({ x, y, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force,
          color, ttl, maxTtl: ttl, size: 1.3 + Math.random() * 3 });
      }
    }

    finish(cause) {
      this.save();
      this.end({ cause, lost: this.haulXp, lives: this.player.lives });
      this.haul = [];
      this.haulXp = 0;
    }

    damage(amount, source) {
      const p = this.player;
      if (p.invulnerable > 0) return;
      p.lives = Math.max(0, p.lives - amount);
      p.invulnerable = 1.35;
      this.impact = .65;
      this.announce('damage', source);
      if (p.lives === 0) this.finish(source);
    }

    move(body, dx, dy, radius) {
      if (W.fits(body.x + dx, body.y, radius)) body.x += dx;
      else if ('vx' in body) body.vx = 0;
      if (W.fits(body.x, body.y + dy, radius)) body.y += dy;
      else if ('vy' in body) body.vy = 0;
    }

    shoot(x, y) {
      if (this.atSurface || this.cooldown > 0) return;
      const weapon = this.value('weapon');
      if (!weapon) {
        this.announce('locked', 'Гарпун можно купить на поверхности');
        this.cooldown = .75;
        return;
      }
      const p = this.player;
      const angle = Math.hypot(x, y) > .15 ? Math.atan2(y, x) : p.angle;
      this.shots.push({ x: p.x + Math.cos(angle) * 12, y: p.y + Math.sin(angle) * 12,
        angle, ttl: .45 + weapon * .08, damage: weapon });
      this.cooldown = .76 - weapon * .1;
      this.announce('shot');
    }

    step(dt, controls) {
      this.phase += dt;
      const p = this.player;
      const { x, y, boost, attack } = controls;
      const norm = Math.max(1, Math.hypot(x, y));
      const ux = x / norm;
      const uy = y / norm;
      const steering = Math.hypot(ux, uy);
      const underwater = !this.atSurface;
      this.sprint = underwater && boost && steering > .1 && p.stamina > .02;
      const speed = this.value('speed') * (this.sprint ? 1.86 : 1);
      p.stamina = W.clamp(p.stamina + dt * (this.sprint ? -.51 : .30), 0, 1);
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      this.impact = Math.max(0, this.impact - dt);
      this.cooldown = Math.max(0, this.cooldown - dt);

      const blend = 1 - Math.exp(-dt * (steering > .05 ? 8 : 6));
      p.vx = W.mix(p.vx, ux * speed, blend);
      p.vy = W.mix(p.vy, uy * speed, blend);
      if (steering > .13) {
        const target = Math.atan2(uy, ux);
        const delta = Math.atan2(Math.sin(target - p.angle), Math.cos(target - p.angle));
        p.angle += delta * Math.min(1, dt * 13);
      }
      if (Math.abs(ux) > .12) p.face = Math.sign(ux);

      this.move(p, p.vx * dt, p.vy * dt, 11);
      p.y = Math.max(-13, p.y);
      if (p.y === -13 && p.vy < 0) p.vy = 0;
      if (this.atSurface) {
        if (underwater) this.save();
        if (this.haul.length) {
          this.profile.xp += this.haulXp;
          this.profile.haul.push(...this.haul);
          this.announce('bank', '+' + this.haulXp + ' ОП · добыча поднята');
          this.spark(p.x, p.y, '#dcfc93', 22);
          this.haul = [];
          this.haulXp = 0;
          this.save();
          if (this.profile.haul.length === W.treasures.length) this.announce('milestone', 'Все сокровища подняты!');
        }
        p.air = Math.min(this.value('air'), p.air + 7.4 * dt);
        this.airNotice = false;
      } else {
        p.air = Math.max(0, p.air - (this.sprint ? 1.61 : 1) * dt);
        this.profile.bestDepth = Math.max(this.meters, this.profile.bestDepth);
        if (p.air === 0) {
          p.lives = Math.max(0, p.lives - 1);
          this.finish('Кислород закончился');
          return;
        }
        if (p.air < 7 && !this.airNotice) {
          this.airNotice = true;
          this.announce('warning', 'Мало воздуха · всплывай');
        }
        if (this.sprint && Math.random() < 20 * dt) {
          this.spark(p.x - Math.cos(p.angle) * 19, p.y - Math.sin(p.angle) * 19, '#a0edea', 1, 26);
        }
      }

      const zone = W.zone(p.x, p.y);
      if (zone !== this.activeZone) {
        this.activeZone = zone;
        if (!this.profile.foundZones.includes(zone.id)) {
          this.profile.foundZones.push(zone.id);
          this.announce('zone', zone.name);
          this.save();
        }
      }

      if (!this.atSurface) {
        for (const item of W.treasures) {
          if (Math.hypot(item.x - p.x, item.y - p.y) > 27 || this.haul.includes(item.id)
            || this.profile.haul.includes(item.id) || !W.lineClear(p.x, p.y, item.x, item.y)) continue;
          const info = W.treasureTypes[item.type];
          this.haul.push(item.id);
          this.haulXp += info.xp;
          this.spark(item.x, item.y, info.color, 15);
          this.announce('find', info.name + ' · +' + info.xp + ' ОП', info.color);
        }
      }

      for (const mine of this.mines) {
        if (!mine.live) continue;
        const distance = Math.hypot(mine.x - p.x, mine.y - p.y);
        mine.fuse = distance < 91 ? mine.fuse + dt : 0;
        if (distance < 31 && W.lineClear(mine.x, mine.y, p.x, p.y)) {
          mine.live = false;
          this.spark(mine.x, mine.y, '#fcb17b', 36, 220);
          this.damage(2, 'Взрыв мины');
          if (!p.lives) return;
        }
      }
      if (attack) this.shoot(ux, uy);
      this.updatePredators(dt);
      if (!p.lives) return;
      this.updateShots(dt);

      for (const effect of this.effects) {
        effect.ttl -= dt;
        effect.x += effect.vx * dt;
        effect.y += effect.vy * dt;
        effect.vx *= 1 - dt * 2;
        effect.vy = effect.vy * (1 - dt) - 16 * dt;
      }
      this.effects = this.effects.filter(effect => effect.ttl > 0);
    }

    updatePredators(dt) {
      const p = this.player;
      for (const predator of this.predators) {
        if (predator.dead || Math.abs(p.x - predator.x) > 720 || Math.abs(p.y - predator.y) > 660) continue;
        const info = W.predatorTypes[predator.type];
        const range = Math.hypot(p.x - predator.x, p.y - predator.y);
        predator.chasing = !this.atSurface && range < info.range && W.lineClear(predator.x, predator.y, p.x, p.y)
          && Math.hypot(p.x - predator.homeX, p.y - predator.homeY) < info.range * 1.7;
        predator.stagger = Math.max(0, predator.stagger - dt);
        const targetX = predator.chasing ? p.x : predator.homeX + Math.sin(this.phase * .73 + predator.phase) * 64;
        const targetY = predator.chasing ? p.y : predator.homeY + Math.cos(this.phase * .57 + predator.phase) * 30;
        const angle = Math.atan2(targetY - predator.y, targetX - predator.x);
        if (Math.abs(targetX - predator.x) > 5) predator.face = Math.sign(targetX - predator.x);
        const speed = predator.stagger > 0 ? -40 : (predator.chasing ? info.chase : info.patrol);
        const step = Math.min(Math.abs(speed) * dt, Math.hypot(targetX - predator.x, targetY - predator.y)) * Math.sign(speed);
        this.move(predator, Math.cos(angle) * step, Math.sin(angle) * step, Math.min(17, info.size * .62));
        if (predator.chasing && range < 10 + info.size * .67) {
          this.damage(info.damage, info.name);
          predator.stagger = .55;
          if (!p.lives) return;
        }
      }
    }

    updateShots(dt) {
      for (const shot of this.shots) {
        shot.ttl -= dt;
        shot.x += Math.cos(shot.angle) * 540 * dt;
        shot.y += Math.sin(shot.angle) * 540 * dt;
        if (W.solid(shot.x, shot.y) || shot.y < -6) {
          shot.ttl = 0;
          continue;
        }
        for (const predator of this.predators) {
          if (predator.dead) continue;
          const info = W.predatorTypes[predator.type];
          if (Math.hypot(shot.x - predator.x, shot.y - predator.y) > info.size) continue;
          shot.ttl = 0;
          predator.hp -= shot.damage;
          predator.stagger = .22;
          this.spark(shot.x, shot.y, '#f6bf88', 9);
          if (predator.hp <= 0) {
            predator.dead = true;
            this.profile.gonePredators.push(predator.id);
            this.profile.xp += info.xp;
            this.save();
            this.announce('kill', info.name + ' · +' + info.xp + ' ОП');
          }
          break;
        }
      }
      this.shots = this.shots.filter(shot => shot.ttl > 0);
    }
  }

  window.DepthSimulation = { Dive, upgrades };
})();
