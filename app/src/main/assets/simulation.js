(() => {
  'use strict';

  const W = window.DepthWorld;
  const storageKey = 'quiet-depth-profile-v1';
  const knifeReaches = [56, 61, 67, 73];
  const knifeArc = .91;
  const knifeDuration = .20;
  const mineKitCost = 100;
  const mineKitReach = 85;
  const breathDuration = .82;
  const shieldDuration = .68;
  const treasureDelay = 120_000;
  const predatorDelay = 90_000;
  const upgrades = [
    { id: 'air', icon: 'air', name: 'Запас воздуха', costs: [85, 175, 315], values: [28, 36, 46, 58], copy: 'Больше времени на глубине.' },
    { id: 'speed', icon: 'bolt', name: 'Скорость', costs: [100, 215, 340], values: [218, 248, 279, 313], copy: 'Быстрее гребок и рывок.' },
    { id: 'life', icon: 'heart', name: 'Запас жизней', costs: [135, 275, 420], values: [3, 4, 5, 6], copy: 'Помогает пережить столкновения.' },
    { id: 'weapon', icon: 'spear', name: 'Гарпун', costs: [130, 280, 440], values: [0, 1, 2, 3], copy: 'Больше урона на расстоянии.' },
    { id: 'knife', icon: 'knife', name: 'Нож', firstLevel: 1, costs: [95, 215, 350], values: [1, 1.5, 2, 3], reaches: knifeReaches },
    { id: 'insulation', icon: 'shield', name: 'Электрозащита', costs: [150, 270, 420], values: [0, 1, 2, 3], copy: 'Костюм защищает от разрядов скатов.' },
    { id: 'boostDuration', icon: 'bolt', name: 'Длительность рывка', firstLevel: 1, costs: [95, 190, 325], values: [2, 2.6, 3.3, 4], copy: 'Запас' },
    { id: 'boostRecovery', icon: 'air', name: 'Восстановление рывка', firstLevel: 1, costs: [100, 200, 335], values: [10, 8, 6.5, 5], copy: 'Полная зарядка' },
  ];

  function savedIds(values, sites) {
    return Array.isArray(values) ? [...new Set(values.filter(id => Number.isInteger(id) && sites[id]))] : [];
  }

  function recoveryTimes(ids, time, previous, delay, depth) {
    const entries = ids.filter(id => W.renewsAt(depth(id))).map(id => [
      id, Number.isFinite(previous?.[id]) ? previous[id] : time + delay,
    ]);
    return Object.fromEntries(entries);
  }

  function expeditionFrom(saved = {}) {
    const savedSeed = saved.worldSeed ?? saved.patrolSeed;
    const worldSeed = Number.isSafeInteger(savedSeed) ? savedSeed >>> 0 : Math.floor(Math.random() * 2 ** 32);
    const layout = W.generateLayout(worldSeed);
    const levels = {};
    for (const item of upgrades) {
      const value = Number(saved.levels && saved.levels[item.id]) || 0;
      levels[item.id] = W.clamp(Math.floor(value), 0, item.costs.length);
    }
    const sameLayout = saved.layoutVersion === W.layoutVersion && Number.isSafeInteger(saved.worldSeed);
    const haul = sameLayout ? savedIds(saved.haul, layout.treasures) : [];
    const gonePredators = sameLayout ? savedIds(saved.gonePredators, layout.predators) : [];
    const time = Date.now();
    const kits = Number.isSafeInteger(saved.kits) && saved.kits >= 0 ? saved.kits : 0;
    const profile = {
      xp: Math.max(0, Math.floor(Number(saved.xp) || 0)),
      levels,
      haul,
      gonePredators,
      treasureRecovery: recoveryTimes(haul, time, saved.treasureRecovery, treasureDelay, id => layout.treasures[id].y),
      predatorRecovery: recoveryTimes(gonePredators, time, saved.predatorRecovery, predatorDelay, id => layout.predators[id].y),
      kits,
      disarmedMines: savedIds(saved.disarmedMines, W.mineSites),
      layoutVersion: W.layoutVersion,
      worldSeed,
      controlMode: saved.controlMode === 'tilt' ? 'tilt' : 'stick',
      bestDepth: Math.max(0, Math.floor(Number(saved.bestDepth) || 0)),
      foundZones: Array.isArray(saved.foundZones) ? saved.foundZones.filter(id => W.zones.some(zone => zone.id === id)) : [],
      muted: saved.muted === true,
    };
    return { profile, layout };
  }

  function load() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { saved = null; }
    return expeditionFrom(saved && typeof saved === 'object' ? saved : {});
  }

  function createPredator({ x, y, type }, id, dead = false) {
    return {
      id, x, y, homeX: x, homeY: y, type, hp: W.predatorTypes[type].hp,
      dead, face: id % 2 ? 1 : -1, chasing: false, stagger: 0, phase: id * 2.399,
      strokeDistance: W.seed(id + 18) * 58, charge: 0, discharge: 0, zapCooldown: 0,
    };
  }

  class Dive {
    constructor(announce, end) {
      Object.assign(this, load());
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
    get treasures() { return this.layout.treasures; }
    get knifeReach() { return knifeReaches[this.profile.levels.knife]; }

    resetExpedition() {
      this.now = Date.now();
      this.expeditionEnded = false;
      this.player = {
        x: W.spawn.x, y: W.spawn.y, vx: 0, vy: 0, angle: .18, face: 1,
        lives: this.value('life'), air: this.value('air'), boostCharge: this.value('boostDuration'), invulnerable: 0,
      };
      this.haul = [];
      this.defeated = [];
      this.pendingXp = 0;
      this.effects = [];
      this.shots = [];
      this.cooldown = 0;
      this.knifeCooldown = 0;
      this.knifeSlash = null;
      this.strokeDistance = 0;
      this.breathTime = 0;
      this.impact = 0;
      this.shieldPulse = 0;
      this.airNotice = false;
      this.sprint = false;
      this.boostDepleted = false;
      this.phase = 0;
      this.activeZone = W.zone(this.player.x, this.player.y);
      this.mines = W.mineSites.map(([x, y], id) => ({
        x, y, id, live: !this.profile.disarmedMines.includes(id), fuse: 0,
      }));
      this.predators = this.layout.predators.map((site, id) => {
        const defeated = this.profile.gonePredators.includes(id) && !this.predatorReady(id);
        return createPredator(site, id, !site.active || defeated);
      });
    }

    respawn() {
      if (this.player.lives === 0) this.resetExpedition();
    }

    updateBoost(dt, requested) {
      const p = this.player;
      const capacity = this.value('boostDuration');
      const recovery = this.value('boostRecovery');
      const used = requested && !this.boostDepleted ? Math.min(dt, p.boostCharge) : 0;
      if (used > 0) {
        p.boostCharge -= used;
        if (p.boostCharge < 1e-8) {
          p.boostCharge = 0;
          this.boostDepleted = true;
        }
      } else {
        p.boostCharge = Math.min(capacity, p.boostCharge + dt * capacity / recovery);
        if (capacity - p.boostCharge < 1e-8) {
          p.boostCharge = capacity;
          this.boostDepleted = false;
        }
      }
      this.sprint = used > 0;
      return this.sprint ? used / dt : 0;
    }

    treasureAvailable(item) {
      return !this.haul.includes(item.id)
        && (!this.profile.haul.includes(item.id) || this.profile.treasureRecovery[item.id] <= this.now);
    }

    predatorReady(id) {
      return this.profile.predatorRecovery[id] <= this.now;
    }

    recoverPredators() {
      const p = this.player;
      for (const predator of this.predators) {
        if (!predator.dead || !this.predatorReady(predator.id) || this.defeated.includes(predator.id)) continue;
        if (Math.hypot(p.x - predator.homeX, p.y - predator.homeY) < 220) continue;
        this.predators[predator.id] = createPredator(this.layout.predators[predator.id], predator.id);
      }
    }

    get canBuyKit() { return this.atSurface && this.profile.xp >= mineKitCost; }

    buyKit() {
      if (!this.canBuyKit) return false;
      this.profile.xp -= mineKitCost;
      this.profile.kits++;
      this.save();
      this.announce('upgrade', 'Набор куплен · запас ' + this.profile.kits);
      return true;
    }

    nearbyMine() {
      if (this.atSurface) return undefined;
      const p = this.player;
      let nearest = mineKitReach;
      let target;
      for (const mine of this.mines) {
        if (!mine.live) continue;
        const distance = Math.hypot(p.x - mine.x, p.y - mine.y);
        if (distance > nearest || !W.lineClear(p.x, p.y, mine.x, mine.y)) continue;
        nearest = distance;
        target = mine;
      }
      return target;
    }

    defuseMine() {
      if (this.atSurface) return false;
      const mine = this.nearbyMine();
      if (!mine || this.profile.kits === 0) {
        this.announce('locked', mine ? 'Купи набор на поверхности' : 'Подплыви ближе к мине');
        return false;
      }
      mine.live = false;
      this.profile.kits--;
      this.profile.disarmedMines.push(mine.id);
      this.save();
      this.spark(mine.x, mine.y, '#c4efb1', 18, 74);
      this.announce('defuse', 'Мина обезврежена');
      return true;
    }

    upgradeOffer(item) {
      const level = this.profile.levels[item.id];
      const cost = item.costs[level];
      const canBuy = cost !== undefined && this.atSurface && this.profile.xp >= cost;
      return { level, cost, canBuy };
    }

    buy(id) {
      const item = upgrades.find(candidate => candidate.id === id);
      if (!item) return false;
      const { level, cost, canBuy } = this.upgradeOffer(item);
      if (!canBuy) return false;
      this.profile.levels[id] = level + 1;
      this.profile.xp -= cost;
      if (id === 'air') this.player.air += item.values[level + 1] - item.values[level];
      if (id === 'life') this.player.lives++;
      if (id === 'boostDuration') this.player.boostCharge *= item.values[level + 1] / item.values[level];
      this.save();
      this.announce('upgrade', item.name + ' · уровень ' + (level + 1 + (item.firstLevel || 0)));
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
      if (this.expeditionEnded) return;
      const { xp, bestDepth, muted, controlMode } = this.profile;
      const lost = xp + this.pendingXp;
      this.player.lives = 0;
      this.player.air = 0;
      this.player.boostCharge = 0;
      this.shieldPulse = 0;
      this.sprint = false;
      this.expeditionEnded = true;
      Object.assign(this, expeditionFrom({ bestDepth, muted, controlMode }));
      this.haul = [];
      this.defeated = [];
      this.pendingXp = 0;
      this.save();
      this.announce('death');
      this.end({ cause, lost });
    }

    damage(amount, source, cue = 'damage') {
      const p = this.player;
      if (p.invulnerable > 0) return;
      p.lives = Math.max(0, p.lives - amount);
      p.invulnerable = 1.35;
      this.impact = .65;
      this.announce(cue, source);
      if (p.lives === 0) this.finish(source);
    }

    move(body, dx, dy, radius) {
      if (W.fits(body.x + dx, body.y, radius)) body.x += dx;
      else if ('vx' in body) body.vx = 0;
      if (W.fits(body.x, body.y + dy, radius)) body.y += dy;
      else if ('vy' in body) body.vy = 0;
    }

    aim(x, y) {
      return Math.hypot(x, y) > .15 ? Math.atan2(y, x) : this.player.angle;
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
      const angle = this.aim(x, y);
      this.shots.push({ x: p.x + Math.cos(angle) * 12, y: p.y + Math.sin(angle) * 12,
        angle, ttl: .45 + weapon * .08, damage: weapon });
      this.cooldown = .76 - weapon * .1;
      this.announce('shot');
    }

    swingKnife(x, y) {
      if (this.atSurface || this.knifeCooldown > 0) return;
      const p = this.player;
      const angle = this.aim(x, y);
      this.knifeCooldown = .46;
      const reach = this.knifeReach;
      this.knifeSlash = { angle, reach, remaining: knifeDuration };
      this.announce('knife');

      const aimX = Math.cos(angle);
      const aimY = Math.sin(angle);
      const arcCos = Math.cos(knifeArc);
      let target;
      let nearest = Infinity;
      for (const predator of this.predators) {
        if (predator.dead) continue;
        const dx = predator.x - p.x;
        const dy = predator.y - p.y;
        const range = Math.hypot(dx, dy);
        if (range >= nearest || range > reach + W.predatorTypes[predator.type].size * .55
          || dx * aimX + dy * aimY < range * arcCos
          || !W.lineClear(p.x, p.y, predator.x, predator.y)) continue;
        target = predator;
        nearest = range;
      }
      if (target) this.hitPredator(target, this.value('knife'), target.x, target.y);
    }

    hitPredator(predator, amount, x, y) {
      predator.hp -= amount;
      predator.stagger = .22;
      this.spark(x, y, '#f6bf88', 9);
      if (predator.hp > 0) return;
      const info = W.predatorTypes[predator.type];
      predator.dead = true;
      this.defeated.push(predator.id);
      this.pendingXp += info.xp;
      this.announce('kill', info.name + ' · ' + info.xp + ' ОП к зачислению');
    }

    bankRewards() {
      this.shots = [];
      this.knifeSlash = null;
      const treasureCount = this.profile.haul.length;
      if (this.pendingXp > 0) {
        this.profile.xp += this.pendingXp;
        for (const id of this.haul) {
          if (!this.profile.haul.includes(id)) this.profile.haul.push(id);
          if (W.renewsAt(this.treasures[id].y)) this.profile.treasureRecovery[id] = this.now + treasureDelay;
        }
        for (const id of this.defeated) {
          if (!this.profile.gonePredators.includes(id)) this.profile.gonePredators.push(id);
          if (W.renewsAt(this.layout.predators[id].y)) this.profile.predatorRecovery[id] = this.now + predatorDelay;
        }
        this.announce('bank', '+' + this.pendingXp + ' ОП зачислено');
        this.spark(this.player.x, 2, '#dcfc93', 22);
        this.haul = [];
        this.defeated = [];
        this.pendingXp = 0;
        if (treasureCount < this.treasures.length && this.profile.haul.length === this.treasures.length) {
          this.announce('milestone', 'Все сокровища найдены!');
        }
      }
      this.save();
    }

    step(dt, controls) {
      if (this.expeditionEnded) return;
      this.now = Date.now();
      this.phase += dt;
      const p = this.player;
      const { x, y, boost, attack, knife } = controls;
      const norm = Math.max(1, Math.hypot(x, y));
      const ux = x / norm;
      let uy = y / norm;
      const underwater = !this.atSurface;
      if (!underwater && uy > .25) {
        if (this.breathTime === 0) this.announce('inhale');
        this.breathTime += dt;
        if (this.breathTime < breathDuration) {
          uy = 0;
          p.vy = Math.min(0, p.vy);
        }
      } else if (this.breathTime > 0) {
        if (!underwater) this.announce('breath-cancel');
        this.breathTime = 0;
      }
      const steering = Math.hypot(ux, uy);
      const boostFraction = this.updateBoost(dt, underwater && boost && steering > .1);
      const speed = this.value('speed') * (1 + .86 * boostFraction);
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      this.impact = Math.max(0, this.impact - dt);
      this.shieldPulse = Math.max(0, this.shieldPulse - dt);
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.knifeCooldown = Math.max(0, this.knifeCooldown - dt);
      if (this.knifeSlash) {
        this.knifeSlash.remaining -= dt;
        if (this.knifeSlash.remaining <= 0) this.knifeSlash = null;
      }

      const blend = 1 - Math.exp(-dt * (steering > .05 ? 8 : 6));
      p.vx = W.mix(p.vx, ux * speed, blend);
      p.vy = W.mix(p.vy, uy * speed, blend);
      if (steering > .13) {
        const target = Math.atan2(uy, ux);
        const delta = Math.atan2(Math.sin(target - p.angle), Math.cos(target - p.angle));
        p.angle += delta * Math.min(1, dt * 13);
      }
      if (Math.abs(ux) > .12) p.face = Math.sign(ux);

      const oldX = p.x;
      const oldY = p.y;
      this.move(p, p.vx * dt, p.vy * dt, 11);
      p.y = Math.max(-13, p.y);
      if (p.y === -13 && p.vy < 0) p.vy = 0;
      if (this.atSurface) {
        if (underwater) {
          this.announce('surface');
          this.spark(p.x, 0, '#b6eee4', 16, 87);
          this.bankRewards();
        }
        p.air = Math.min(this.value('air'), p.air + 7.4 * dt);
        this.airNotice = false;
      } else {
        if (!underwater) {
          this.announce('dive-in');
          this.spark(p.x, 1, '#b6eee4', 19, 95);
          this.strokeDistance = 0;
        }
        p.air = Math.max(0, p.air - (1 + .61 * boostFraction) * dt);
        this.profile.bestDepth = Math.max(this.meters, this.profile.bestDepth);
        if (p.air === 0) {
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
        this.strokeDistance += Math.hypot(p.x - oldX, p.y - oldY);
        if (this.strokeDistance >= (this.sprint ? 102 : 124)) {
          this.strokeDistance = 0;
          this.announce(this.sprint ? 'boost-swim' : 'swim');
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
        for (const item of this.treasures) {
          if (Math.hypot(item.x - p.x, item.y - p.y) > 27 || !this.treasureAvailable(item)
            || !W.lineClear(p.x, p.y, item.x, item.y)) continue;
          const info = W.treasureTypes[item.type];
          this.haul.push(item.id);
          this.pendingXp += info.xp;
          this.spark(item.x, item.y, info.color, 15);
          this.announce('find', info.name + ' · ' + info.xp + ' ОП к зачислению', info.color);
        }
      }

      for (const mine of this.mines) {
        if (!mine.live) continue;
        const distance = Math.hypot(mine.x - p.x, mine.y - p.y);
        mine.fuse = distance < 91 ? mine.fuse + dt : 0;
        if (distance < 31 && W.lineClear(mine.x, mine.y, p.x, p.y)) {
          mine.live = false;
          this.spark(mine.x, mine.y, '#fcb17b', 36, 220);
          this.announce('mine');
          this.damage(2, 'Взрыв мины', 'mine-hit');
          if (!p.lives) return;
        }
      }
      if (attack) this.shoot(ux, uy);
      if (knife) this.swingKnife(ux, uy);
      this.recoverPredators();
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

    updateElectricAttack(predator, info, dt) {
      const p = this.player;
      const electric = info.electric;
      const inRange = !this.atSurface && Math.hypot(p.x - predator.x, p.y - predator.y) <= electric.radius
        && W.lineClear(predator.x, predator.y, p.x, p.y);
      predator.discharge = Math.max(0, predator.discharge - dt);
      predator.zapCooldown = Math.max(0, predator.zapCooldown - dt);
      if (predator.charge > 0) {
        predator.charge -= dt;
        if (predator.charge > 0) return;
        predator.charge = 0;
        predator.discharge = .38;
        predator.zapCooldown = 2.45;
        this.spark(predator.x, predator.y, '#b2e7ff', 20, 150);
        this.announce('electric');
        if (inRange) {
          if (this.value('insulation') >= electric.level) {
            this.shieldPulse = shieldDuration;
            this.announce('shield', 'Костюм поглотил разряд');
          } else this.damage(info.damage, info.name + ' · разряд ' + electric.level + ' ур.', 'electric-hit');
        }
      } else if (predator.chasing && inRange && predator.zapCooldown === 0) {
        predator.charge = .65;
        this.announce('electric-charge');
      }
    }

    updatePredators(dt) {
      const p = this.player;
      for (const predator of this.predators) {
        if (predator.dead || Math.abs(p.x - predator.x) > 720 || Math.abs(p.y - predator.y) > 660) continue;
        const info = W.predatorTypes[predator.type];
        const range = Math.hypot(p.x - predator.x, p.y - predator.y);
        predator.chasing = !this.atSurface && range < info.range && W.lineClear(predator.x, predator.y, p.x, p.y)
          && Math.hypot(p.x - predator.homeX, p.y - predator.homeY) < info.range * (info.electric ? 1.12 : 1.7);
        predator.stagger = Math.max(0, predator.stagger - dt);
        const targetX = predator.chasing ? p.x : predator.homeX + Math.sin(this.phase * .73 + predator.phase) * 64;
        const targetY = predator.chasing ? p.y : predator.homeY + Math.cos(this.phase * .57 + predator.phase) * 30;
        const angle = Math.atan2(targetY - predator.y, targetX - predator.x);
        if (Math.abs(targetX - predator.x) > 5) predator.face = Math.sign(targetX - predator.x);
        let speed = predator.stagger > 0 ? -40 : (predator.chasing ? info.chase : info.patrol);
        if (predator.charge > 0) speed *= .12;
        const step = Math.min(Math.abs(speed) * dt, Math.hypot(targetX - predator.x, targetY - predator.y)) * Math.sign(speed);
        const oldX = predator.x;
        const oldY = predator.y;
        this.move(predator, Math.cos(angle) * step, Math.sin(angle) * step, Math.min(17, info.size * .62));
        if (range < 280 && predator.y > 2) {
          predator.strokeDistance += Math.hypot(predator.x - oldX, predator.y - oldY);
          if (predator.strokeDistance >= 93) {
            predator.strokeDistance = 0;
            const proximity = 1 - range / 280;
            const pan = W.clamp((predator.x - p.x) / 230, -.9, .9);
            this.announce('predator-swim', null, null, {
              volume: proximity * (predator.chasing ? 1 : .65), pan,
            });
          }
        }
        if (info.electric) {
          this.updateElectricAttack(predator, info, dt);
        } else if (predator.chasing && range < 10 + info.size * .67) {
          this.damage(info.damage, info.name, 'bite');
          predator.stagger = .55;
        }
        if (!p.lives) return;
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
          this.hitPredator(predator, shot.damage, shot.x, shot.y);
          break;
        }
      }
      this.shots = this.shots.filter(shot => shot.ttl > 0);
    }
  }

  window.DepthSimulation = { Dive, upgrades, knifeArc, knifeDuration, mineKitCost, shieldDuration };
})();
