(() => {
  'use strict';

  const W = window.DepthWorld;
  const { Dive, upgrades, mineKitCost } = window.DepthSimulation;
  const byId = id => document.getElementById(id);
  const decimal = value => String(value).replace('.', ',');
  const seconds = value => decimal(value) + ' с';
  const icons = {
    depth: '<path d="m3 12 5-5 4 4 4-4 5 5M6 16l6 5 6-5"/><circle cx="12" cy="4" r="1" fill="currentColor" stroke="none"/>',
    down: '<path d="M12 4v15m-6-6 6 6 6-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.1a2.7 2.7 0 1 1 4.1 2.3c-1 .6-1.4.8-1.4 2"/><circle cx="12" cy="16.5" r=".85" fill="currentColor" stroke="none"/>',
    sound: '<path d="M11 5 6 9H3v6h3l5 4zM15 8a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14"/>',
    muted: '<path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6"/>',
    air: '<circle cx="9" cy="15" r="5"/><circle cx="17" cy="7" r="3.5"/><path d="M18 16h.01"/>',
    heart: '<path d="M12 20 4.8 13a4.5 4.5 0 0 1 6.4-6.3l.8.9.8-.9a4.5 4.5 0 0 1 6.4 6.3Z"/>',
    bolt: '<path d="m13.5 2-9 12H11l-1 8 9.5-12H13z"/>',
    spear: '<path d="m4 20 13-13m-4 0 7-3-3 7M4 15l5 5"/>',
    knife: '<path d="m4 20 5-5m-2-2 4 4m-1-3 2.5-6L21 3l-3 8.5L12 16"/>',
    shield: '<path d="M12 21c-3-1.6-7-4.3-7-8.7V6l7-3 7 3v6.3c0 4.4-4 7.1-7 8.7Z"/><path d="m13 7-3 5h4l-3 5"/>',
    kit: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V5h8v3M3 13h18m-11-2v4m4-4v4"/>',
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14m6-12v14"/>',
    gear: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 5v4m8 1v4m-5 1v4" stroke-width="3"/>',
    pause: '<path d="M9 5v14m6-14v14" stroke-width="2.3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    move: '<path d="M12 2v5m-2-3 2-2 2 2m-2 18v-5m-2 3 2 2 2-2M2 12h5m-3-2-2 2 2 2m18-2h-5m3-2 2 2-2 2"/>',
    tilt: '<rect x="6.5" y="3" width="11" height="18" rx="2" transform="rotate(-19 12 12)"/><path d="M3 8a9 9 0 0 1 1.7-3M20 16a9 9 0 0 1-1.8 3M12 17h1"/>',
    pin: '<path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    bag: '<path d="M7 8h10l3 10c.3 1.1-.4 2-1.5 2h-13c-1.1 0-1.8-.9-1.5-2zM9 8V6a3 3 0 0 1 6 0v2"/>',
  };
  const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';

  const audio = new window.DepthAudio();
  let started = false;
  let panelType = '';
  let previousFocus;
  let lastResult;
  let lastTime = 0;
  let simulationTime = 0;
  let previousUi = '';
  let previousHearts = '';
  const pressed = new Set();
  const stick = { x: 0, y: 0, pointer: null };
  const sensor = window.AndroidTilt;
  const tiltAvailable = Boolean(sensor?.isAvailable());
  const tilt = { origin: null, x: 0, y: 0, lastSample: 0 };
  const hold = { boost: false, attack: false, knife: false };
  const cover = byId('cover');
  const overlay = byId('overlay');
  const modal = byId('modal');
  const panel = byId('panel');
  const panelContent = byId('panel-content');
  const toastStack = byId('toasts');
  const canvas = byId('ocean');
  const renderer = new window.DepthRenderer(canvas);
  const dive = new Dive(announce, result => showPanel('end', result));
  const touchMode = navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
  if (touchMode) document.body.classList.add('touch-mode');
  for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = icon(element.dataset.icon);

  function inTiltMode() {
    return tiltAvailable && dive.profile.controlMode === 'tilt';
  }

  function calibrateTilt() {
    tilt.origin = null;
    tilt.x = tilt.y = 0;
    tilt.lastSample = 0;
  }

  function syncTilt() {
    const enabled = inTiltMode();
    document.body.classList.toggle('tilt-mode', enabled);
    byId('cover-input').textContent = enabled ? 'Плавание наклоном смартфона' : 'Джойстик для плавания';
    sensor?.setEnabled(enabled && started && !panelType && !document.hidden);
  }

  window.receiveDeviceTilt = (right, down, normal, rotation) => {
    if (!inTiltMode() || panelType || !started || document.hidden) return;
    if (![right, down, normal].every(Number.isFinite) || Math.hypot(right, down, normal) < 1) return;
    const roll = Math.atan2(right, Math.hypot(down, normal));
    const pitch = Math.atan2(down, normal);
    if (!tilt.origin || tilt.origin.rotation !== rotation) {
      calibrateTilt();
      tilt.origin = { roll, pitch, rotation };
    }
    const x = roll - tilt.origin.roll;
    const pitchChange = pitch - tilt.origin.pitch;
    const y = Math.atan2(Math.sin(pitchChange), Math.cos(pitchChange));
    const distance = Math.hypot(x, y);
    const strength = W.clamp((distance - .04) / .32, 0, 1);
    const scale = distance > 0 ? strength / distance : 0;
    tilt.x = strength ? W.mix(tilt.x, x * scale, .34) : 0;
    tilt.y = strength ? W.mix(tilt.y, y * scale, .34) : 0;
    tilt.lastSample = performance.now();
  };

  function updateAmbience() {
    audio.mix(started && !panelType, dive.profile.muted || document.hidden);
  }
  function updateSoundButtons() {
    document.querySelectorAll('[data-sound]').forEach(button => {
      button.innerHTML = icon(dive.profile.muted ? 'muted' : 'sound');
      button.setAttribute('aria-label', dive.profile.muted ? 'Включить звук' : 'Выключить звук');
      button.title = dive.profile.muted ? 'Включить звук' : 'Выключить звук';
    });
  }
  function toggleSound() {
    dive.profile.muted = !dive.profile.muted;
    dive.save();
    updateAmbience();
    if (!dive.profile.muted) audio.unlock();
    updateSoundButtons();
  }

  function announce(kind, message, color, sound) {
    audio.play(kind, sound);
    if (!message) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.kind = kind;
    toast.textContent = message;
    if (color) toast.style.color = color;
    while (toastStack.children.length >= 3) toastStack.firstElementChild.remove();
    toastStack.append(toast);
    setTimeout(() => toast.remove(), kind === 'warning' ? 3900 : 2750);
  }

  function start() {
    if (started) return;
    started = true;
    if (!dive.profile.foundZones.includes('bay')) dive.profile.foundZones.push('bay');
    dive.save();
    cover.hidden = true;
    overlay.hidden = false;
    cover.inert = true;
    renderer.snap(dive.player);
    hidePanel();
    audio.unlock();
    updateHud();
  }

  function coverStats() {
    const stats = byId('cover-status');
    const count = dive.profile.haul.length;
    stats.hidden = count === 0;
    stats.textContent = count + ' / ' + dive.treasures.length + ' сокровищ поднято';
  }

  function updateHud() {
    const p = dive.player;
    const maximum = dive.value('air');
    const current = Math.ceil(p.air);
    const lives = dive.value('life');
    const low = p.air < 7;
    const ready = dive.canBuyKit || upgrades.some(upgrade => dive.upgradeOffer(upgrade).canBuy);
    const nearMine = Boolean(dive.nearbyMine());
    const preparing = dive.atSurface && dive.breathTime > 0;
    const boostCapacity = dive.value('boostDuration');
    const boostRatio = W.clamp(p.boostCharge / boostCapacity, 0, 1);
    const boostSeconds = Math.min(boostCapacity, Math.ceil(p.boostCharge * 10) / 10);
    const boostWait = dive.boostDepleted ? Math.max(1, Math.ceil((1 - boostRatio) * dive.value('boostRecovery') - 1e-8)) : 0;
    byId('air-fill').style.transform = 'scaleX(' + Math.max(0, p.air / maximum) + ')';
    byId('boost-fill').style.transform = 'scaleX(' + boostRatio + ')';
    byId('boost-button-fill').style.transform = 'scaleX(' + boostRatio + ')';
    byId('edge-signal').style.opacity = Math.max(dive.impact * .70, low ? .14 + Math.sin(dive.phase * 6) * .055 : 0);
    const key = [
      current, maximum, dive.meters, dive.profile.xp, p.lives, lives, dive.activeZone.id,
      dive.pendingXp, ready, dive.atSurface, low, dive.value('weapon'), dive.profile.kits, nearMine, preparing,
      boostCapacity, boostSeconds, boostWait,
    ].join(',');
    if (previousUi === key) return;
    previousUi = key;

    byId('air-text').textContent = current + ' / ' + maximum + ' с';
    byId('air-meter').setAttribute('aria-valuenow', current);
    byId('air-meter').setAttribute('aria-valuemax', maximum);
    byId('air-meter').closest('.oxygen').classList.toggle('low', low);
    const boostText = boostWait ? '↻ ' + seconds(boostWait) : seconds(boostSeconds);
    const boostMeter = byId('boost-meter');
    byId('boost-text').textContent = boostText;
    byId('boost-gauge').classList.toggle('recharging', boostWait > 0);
    byId('boost').classList.toggle('recharging', boostWait > 0);
    boostMeter.setAttribute('aria-valuenow', boostSeconds);
    boostMeter.setAttribute('aria-valuemax', boostCapacity);
    boostMeter.setAttribute('aria-valuetext', boostWait ? 'Восстановление · ' + seconds(boostWait) : seconds(boostSeconds));
    byId('depth').innerHTML = dive.meters + ' <small>м</small>';
    byId('xp').innerHTML = dive.profile.xp + ' <small>ОП</small>';
    const heartKey = p.lives + '/' + lives;
    if (previousHearts !== heartKey) {
      previousHearts = heartKey;
      const hearts = byId('hearts');
      hearts.setAttribute('aria-label', 'Жизни ' + p.lives + ' из ' + lives);
      hearts.innerHTML = Array.from({ length: lives }, (_, i) =>
        '<span class="' + (i < p.lives ? '' : 'empty') + '">' + icon('heart') + '</span>').join('');
    }
    byId('zone').textContent = dive.activeZone.name;
    byId('bag-text').textContent = dive.pendingXp + ' ОП к зачислению';
    byId('bag').classList.toggle('loaded', dive.pendingXp > 0);
    byId('shop').classList.toggle('ready', ready);
    byId('attack').classList.toggle('locked', dive.value('weapon') === 0);
    byId('kit-count').textContent = dive.profile.kits;
    byId('defuse').classList.toggle('ready', nearMine && dive.profile.kits > 0);
    byId('defuse').setAttribute('aria-label', 'Обезвредить мину. Наборов ' + dive.profile.kits);
    let tip = '';
    if (dive.atSurface) {
      if (preparing) tip = 'Вдох перед нырком';
      else if (current < maximum) tip = 'На поверхности · кислород восстанавливается';
      else if (ready) tip = 'Доступно улучшение снаряжения';
      else if (dive.profile.haul.length === 0) {
        if (inTiltMode()) tip = 'Наклони смартфон вниз, чтобы нырнуть';
        else tip = touchMode ? 'Джойстик вниз, чтобы нырнуть' : 'S или ↓, чтобы нырнуть';
      }
    } else if (nearMine && dive.profile.kits > 0) tip = touchMode ? 'Нажми «Наборы», чтобы обезвредить мину' : 'Нажми R, чтобы обезвредить мину';
    else if (dive.pendingXp > 0) tip = 'Всплыви, чтобы получить ОП';
    byId('tip').textContent = tip;
  }

  function showPanel(type, payload) {
    if (!panelType) previousFocus = document.activeElement;
    panelType = type;
    if (type === 'end' && payload) lastResult = payload;
    resetControls();
    syncTilt();
    updateAmbience();
    panel.classList.toggle('map-panel', type === 'map');
    panel.classList.toggle('shop-panel', type === 'shop');
    byId('close').hidden = type === 'end';
    overlay.inert = true;
    cover.inert = true;
    modal.hidden = false;
    renderPanel();
    panel.scrollTop = 0;
    panel.focus();
  }

  function hidePanel() {
    const hadPanel = Boolean(panelType);
    panelType = '';
    modal.hidden = true;
    overlay.inert = !started;
    cover.inert = started;
    if (hadPanel && previousFocus && previousFocus.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus();
    updateAmbience();
    calibrateTilt();
    syncTilt();
    if (hadPanel && started) audio.unlock();
  }

  function updateShop() {
    byId('panel-kicker').textContent = dive.profile.xp + ' ОП доступно';
    for (const item of upgrades) {
      const row = panelContent.querySelector('[data-upgrade="' + item.id + '"]');
      const { level, cost, canBuy } = dive.upgradeOffer(item);
      const firstLevel = item.firstLevel || 0;
      row.querySelector('.shop-level').textContent = 'Уровень ' + (level + firstLevel) + ' из ' + (item.costs.length + firstLevel);
      row.querySelectorAll('.levels i').forEach((dot, i) => dot.classList.toggle('filled', i < level + firstLevel));
      const button = row.querySelector('button');
      button.disabled = !canBuy;
      const maxed = cost === undefined;
      const verb = ['weapon', 'insulation'].includes(item.id) && level === 0 ? 'Купить' : 'Улучшить';
      button.textContent = maxed ? 'Максимум' : verb + ' · ' + cost + ' ОП';
      button.setAttribute('aria-label', item.name + ' · ' + button.textContent);
      const shortfall = dive.atSurface && !maxed && !canBuy ? cost - dive.profile.xp : 0;
      row.querySelector('.shop-shortfall').textContent = shortfall ? 'Не хватает ' + shortfall + ' ОП' : '';
      const description = row.querySelector('.shop-description');
      if (item.id === 'air' && !maxed) description.textContent = 'Следующий запас · ' + item.values[level + 1] + ' с';
      else if (item.id === 'insulation' && !maxed) {
        description.textContent = 'Следующий уровень · защита от ' + ['малых', 'пятнистых', 'гигантских'][level] + ' скатов';
      } else if (item.id === 'knife') {
        const next = maxed ? level : level + 1;
        const reach = Math.round((item.reaches[next] / item.reaches[0] - 1) * 100);
        const damage = decimal(item.values[level]) + (maxed ? '' : ' → ' + decimal(item.values[next]));
        description.textContent = 'Урон ' + damage + ' · дальность +' + reach + '%';
      } else if (firstLevel) {
        description.textContent = item.copy + ' · ' + seconds(item.values[level])
          + (maxed ? '' : ' → ' + seconds(item.values[level + 1]));
      } else description.textContent = item.copy;
    }
    const kit = panelContent.querySelector('[data-upgrade="kit"]');
    kit.querySelector('.shop-level').textContent = 'В запасе · ' + dive.profile.kits;
    kit.querySelector('button').disabled = !dive.canBuyKit;
    const missing = mineKitCost - dive.profile.xp;
    kit.querySelector('.shop-shortfall').textContent = dive.atSurface && missing > 0 ? 'Не хватает ' + missing + ' ОП' : '';
  }

  function renderPanel() {
    const title = byId('panel-title');
    const kicker = byId('panel-kicker');
    kicker.textContent = '';
    if (panelType === 'guide') {
      title.textContent = 'Как играть';
      panelContent.innerHTML = '<p>Опыт за находки и побеждённых хищников начисляется после всплытия. На поверхности кислород восстанавливается постепенно. Рывок расходует воздух быстрее и заряжается, пока им не пользуешься.</p>'
        + '<div class="guide-list">' + [
          ['Плавание', '<kbd>W A S D</kbd><kbd>↑ ← ↓ →</kbd>'],
          ['Рывок', '<kbd>Shift</kbd>'],
          ['Гарпун', '<kbd>Space</kbd>'],
          ['Нож', '<kbd>F</kbd>'],
          ['Обезвредить мину', '<kbd>R</kbd>'],
          ['Карта и снаряжение', '<kbd>M</kbd><kbd>E</kbd>'],
        ].map(([label, keys]) => '<div class="guide-line"><span>' + label + '</span><span class="guide-keys">' + keys + '</span></div>').join('') + '</div>'
        + '<p>Нож есть с начала игры. На поверхности можно улучшить нож и купить гарпун. Для атаки повернись к хищнику движением дайвера.</p>'
        + '<p>Подплыви к мине и нажми «Наборы» или R. На одну мину уходит один набор. Чем крупнее электроскат, тем выше уровень защиты костюма нужен.</p>'
        + '<p>Гибель дайвера сбрасывает опыт, покупки и находки экспедиции.</p>'
        + '<div class="panel-actions"><button class="primary" data-action="' + (started ? 'pause' : 'start') + '">' + (started ? 'Назад в меню паузы' : 'Погрузиться') + '</button></div>';
    } else if (panelType === 'pause') {
      title.textContent = 'Пауза';
      panelContent.innerHTML = '<p>Поднято сокровищ <b>' + dive.profile.haul.length + ' из ' + dive.treasures.length
        + '</b> · рекорд глубины <b>' + dive.profile.bestDepth + ' м</b></p>'
        + '<div class="panel-actions"><button class="primary" data-action="resume">Продолжить</button><button class="subtle" data-action="guide">Как играть</button>'
        + '<button class="subtle" data-action="controls">Управление</button><button class="icon-button" data-sound></button>'
        + '<button class="subtle" data-action="home">Главное меню</button></div>';
      updateSoundButtons();
    } else if (panelType === 'controls') {
      title.textContent = 'Управление';
      const tiltSelected = inTiltMode();
      panelContent.innerHTML = '<div class="control-options">'
        + '<button type="button" class="icon-button" data-control-mode="stick" aria-pressed="' + !tiltSelected + '">' + icon('move') + 'Виртуальный стик</button>'
        + '<button type="button" class="icon-button" data-control-mode="tilt" aria-pressed="' + tiltSelected + '"' + (tiltAvailable ? '' : ' disabled')
        + '>' + icon('tilt') + 'Наклон смартфона</button></div>'
        + '<p>' + (tiltAvailable ? 'В режиме наклона держи смартфон удобно и нажми «Калибровка». Затем наклоняй его в сторону движения. Кнопки действий остаются на экране.'
          : 'Наклон доступен в Android-приложении на смартфоне с датчиком движения.') + '</p>'
        + '<div class="panel-actions">'
        + (tiltSelected && started ? '<button class="primary" data-action="calibrate">Калибровка</button>' : '')
        + '<button class="subtle" data-action="resume">Готово</button></div>';
    } else if (panelType === 'shop') {
      title.textContent = 'Снаряжение';
      panelContent.innerHTML = (dive.atSurface ? '' : '<p>Покупки доступны после всплытия.</p>')
        + '<div class="shop-list">' + upgrades.map(item =>
          '<article class="shop-row" data-upgrade="' + item.id + '"><span class="shop-symbol">' + icon(item.icon)
          + '</span><div class="shop-details"><h3>' + item.name + '</h3><p class="shop-description"></p>'
          + '<div class="shop-progress"><span class="shop-level"></span><div class="levels" aria-hidden="true">'
          + '<i></i>'.repeat(item.costs.length + (item.firstLevel || 0)) + '</div></div><div class="shop-purchase"><button type="button" data-buy="'
          + item.id + '"></button><span class="shop-shortfall"></span></div></div></article>'
        ).join('') + '<article class="shop-row" data-upgrade="kit"><span class="shop-symbol">' + icon('kit')
        + '</span><div class="shop-details"><h3>Набор для мин</h3><p>Обезвреживает одну мину.</p>'
        + '<div class="shop-progress"><span class="shop-level"></span></div><div class="shop-purchase">'
        + '<button type="button" data-buy="kit" aria-label="Купить набор для мин">Купить · ' + mineKitCost
        + ' ОП</button><span class="shop-shortfall"></span></div></div></article></div>';
      updateShop();
    } else if (panelType === 'map') {
      title.textContent = 'Карта океана';
      kicker.textContent = dive.activeZone.name + ' · ' + dive.meters + ' м';
      panelContent.innerHTML = '<canvas class="map-frame" id="map-canvas" aria-label="Карта океана с положением дайвера и сокровищами"></canvas><div class="map-legend">'
        + [{ plural: 'Ты здесь', color: '#e1f9a2' }, ...W.treasureTypes, { plural: 'Электроскаты', color: '#7c9ebc' }]
          .map(item => '<span><i style="background:' + item.color + '"></i>' + item.plural + '</span>').join('') + '</div>';
      renderer.drawMap(byId('map-canvas'), dive);
    } else if (panelType === 'end') {
      title.textContent = 'Дайвер погиб';
      kicker.textContent = lastResult.cause;
      const lost = lastResult.lost ? 'Потеряно ' + lastResult.lost + ' ОП. ' : '';
      panelContent.innerHTML = '<p>' + lost + 'Опыт, покупки и находки экспедиции сброшены. Рекорд глубины сохранён.</p>'
        + '<div class="panel-actions"><button class="primary" data-action="respawn">Новая экспедиция</button></div>';
    }
  }

  function resetControls() {
    pressed.clear();
    stick.pointer = null;
    stick.x = stick.y = 0;
    calibrateTilt();
    byId('knob').style.transform = '';
    for (const id of Object.keys(hold)) {
      hold[id] = false;
      byId(id).classList.remove('pressed');
    }
  }

  function action(name) {
    if (name === 'resume') hidePanel();
    else if (name === 'start') start();
    else if (name === 'calibrate') {
      if (panelType === 'controls') hidePanel();
      calibrateTilt();
      announce('calibrate', 'Держи смартфон в нейтральном положении');
    }
    else if (name === 'respawn') {
      dive.respawn();
      toastStack.replaceChildren();
      renderer.snap(dive.player);
      updateHud();
      hidePanel();
    } else if (name === 'home') {
      dive.save();
      started = false;
      overlay.hidden = true;
      cover.hidden = false;
      coverStats();
      byId('start').lastElementChild.textContent = 'Продолжить';
      hidePanel();
      updateAmbience();
      byId('start').focus();
    } else showPanel(name);
  }

  function goBack() {
    if (panelType === 'end') return true;
    if (panelType) hidePanel();
    else if (started) showPanel('pause');
    else return false;
    return true;
  }

  const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyF'];
  const keyOn = (...codes) => codes.some(code => pressed.has(code));
  function controls() {
    const x = Number(keyOn('KeyD', 'ArrowRight')) - Number(keyOn('KeyA', 'ArrowLeft'));
    const y = Number(keyOn('KeyS', 'ArrowDown')) - Number(keyOn('KeyW', 'ArrowUp'));
    const tiltActive = inTiltMode();
    const movement = tiltActive ? tilt : stick;
    const hasMotion = !tiltActive || performance.now() - tilt.lastSample < 550;
    return { x: x || (hasMotion ? movement.x : 0), y: y || (hasMotion ? movement.y : 0),
      boost: hold.boost || keyOn('ShiftLeft', 'ShiftRight'),
      attack: hold.attack || keyOn('Space'), knife: hold.knife || keyOn('KeyF') };
  }

  function useWeapon(id) {
    const { x, y } = controls();
    if (id === 'knife') dive.swingKnife(x, y);
    else dive.shoot(x, y);
  }
  const joystick = byId('joystick');
  function moveStick(event) {
    if (event.pointerId !== stick.pointer) return;
    const bounds = joystick.getBoundingClientRect();
    const max = bounds.width * .34;
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const r = Math.hypot(dx, dy);
    const factor = 1 / Math.max(max, r);
    stick.x = dx * factor;
    stick.y = dy * factor;
    byId('knob').style.transform = 'translate(' + stick.x * max + 'px,' + stick.y * max + 'px)';
  }
  joystick.addEventListener('pointerdown', event => {
    if (stick.pointer !== null) return;
    event.preventDefault();
    stick.pointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    moveStick(event);
  });
  joystick.addEventListener('pointermove', moveStick);
  function releaseStick(event) {
    if (event.pointerId !== stick.pointer) return;
    stick.pointer = null;
    stick.x = stick.y = 0;
    byId('knob').style.transform = '';
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(event, releaseStick);
  for (const id of Object.keys(hold)) {
    const button = byId(id);
    let pointer;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (hold[id]) return;
      pointer = event.pointerId;
      button.setPointerCapture(pointer);
      hold[id] = true;
      button.classList.add('pressed');
      if (id !== 'boost') useWeapon(id);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => {
      if (event.pointerId !== pointer) return;
      hold[id] = false;
      button.classList.remove('pressed');
    });
  }

  document.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!event.repeat) goBack();
      return;
    }
    if (panelType) {
      if (event.code === 'Tab') {
        const buttons = [...panel.querySelectorAll('button:not(:disabled):not([hidden])')];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault();
          if (last) last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          if (first) first.focus();
        }
      }
      return;
    }
    if (!started) return;
    if (movementKeys.includes(event.code)) {
      event.preventDefault();
      pressed.add(event.code);
      if (!event.repeat && event.code === 'KeyF') useWeapon('knife');
      if (!event.repeat && event.code === 'Space') useWeapon('attack');
    }
    if (!event.repeat && event.code === 'KeyM') showPanel('map');
    if (!event.repeat && event.code === 'KeyE') showPanel('shop');
    if (!event.repeat && event.code === 'KeyR') dive.defuseMine();
  });
  document.addEventListener('keyup', event => pressed.delete(event.code));
  window.addEventListener('blur', resetControls);
  window.addEventListener('resize', () => {
    renderer.resize();
    if (started) renderer.draw(dive, 0);
  });
  window.pauseDive = () => { if (started && !panelType) showPanel('pause'); };
  window.gameBack = goBack;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetControls();
      window.pauseDive();
    }
    syncTilt();
    updateAmbience();
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-sound')) toggleSound();
    else if (panelType === 'controls' && button.dataset.controlMode) {
      const mode = button.dataset.controlMode;
      if (mode === 'tilt' && !tiltAvailable) return;
      dive.profile.controlMode = mode;
      calibrateTilt();
      dive.save();
      syncTilt();
      renderPanel();
      panelContent.querySelector('[data-control-mode="' + mode + '"]').focus();
    }
    else if (button.dataset.action) action(button.dataset.action);
    else if (panelType === 'shop' && button.dataset.buy) {
      if (button.dataset.buy === 'kit' ? dive.buyKit() : dive.buy(button.dataset.buy)) {
        updateShop();
        updateHud();
        if (button.disabled && document.activeElement === button) panel.focus({ preventScroll: true });
      }
    }
  });
  for (const [id, type] of [['guide', 'guide'], ['map', 'map'], ['shop', 'shop'], ['pause', 'pause']]) {
    byId(id).addEventListener('click', () => showPanel(type));
  }
  byId('start').addEventListener('click', start);
  byId('defuse').addEventListener('click', () => { if (started && !panelType) dive.defuseMine(); });
  byId('close').addEventListener('click', hidePanel);
  modal.addEventListener('click', event => { if (event.target === modal && panelType !== 'end') hidePanel(); });

  updateSoundButtons();
  syncTilt();
  coverStats();

  function frame(time) {
    const dt = Math.min(.1, (time - (lastTime || time)) / 1000);
    lastTime = time;
    if (started && !panelType) {
      simulationTime += dt;
      const step = 1 / 60;
      const input = controls();
      while (simulationTime >= step && !panelType) {
        dive.step(step, input);
        simulationTime -= step;
      }
      renderer.draw(dive, dt);
      updateHud();
    } else simulationTime = 0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
