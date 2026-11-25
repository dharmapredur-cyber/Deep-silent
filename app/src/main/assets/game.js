(() => {
  'use strict';

  const W = window.DepthWorld;
  const { Dive, upgrades } = window.DepthSimulation;
  const byId = id => document.getElementById(id);
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
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14m6-12v14"/>',
    gear: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 5v4m8 1v4m-5 1v4" stroke-width="3"/>',
    pause: '<path d="M9 5v14m6-14v14" stroke-width="2.3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    move: '<path d="M12 2v5m-2-3 2-2 2 2m-2 18v-5m-2 3 2 2 2-2M2 12h5m-3-2-2 2 2 2m18-2h-5m3-2 2 2-2 2"/>',
    pin: '<path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    bag: '<path d="M7 8h10l3 10c.3 1.1-.4 2-1.5 2h-13c-1.1 0-1.8-.9-1.5-2zM9 8V6a3 3 0 0 1 6 0v2"/>',
  };
  const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';

  let audio;
  let ambience;
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
  const hold = { boost: false, attack: false };
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

  function unlockAudio() {
    if (dive.profile.muted) return;
    try {
      if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        audio = new Context();
        const wash = audio.createBufferSource();
        const buffer = audio.createBuffer(1, audio.sampleRate * 4, audio.sampleRate);
        const data = buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < data.length; i++) {
          previous = (previous + (Math.random() * 2 - 1) * .015) / 1.015;
          data[i] = previous * Math.min(1, i / 1400, (data.length - i) / 1400);
        }
        const low = audio.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = 690;
        ambience = audio.createGain();
        ambience.gain.value = 0;
        wash.buffer = buffer;
        wash.loop = true;
        wash.connect(low).connect(ambience).connect(audio.destination);
        wash.start();
      }
      void audio.resume().catch(() => {});
      updateAmbience();
    } catch { /* Audio is optional on WebViews without the Web Audio API. */ }
  }
  function updateAmbience() {
    if (!audio || !ambience) return;
    const volume = started && !panelType && !dive.profile.muted && !document.hidden ? .28 : 0;
    ambience.gain.setTargetAtTime(volume, audio.currentTime, .12);
  }
  function tone(kind) {
    if (!audio || dive.profile.muted) return;
    const cues = {
      find: [510, 786, .20], bank: [392, 698, .39], damage: [138, 42, .27],
      warning: [275, 222, .29], shot: [190, 82, .10], kill: [452, 612, .23],
      upgrade: [390, 620, .24], zone: [280, 410, .44], milestone: [550, 880, .49],
    };
    const cue = cues[kind];
    if (!cue) return;
    const [from, to, duration] = cue;
    const start = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = kind === 'damage' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration * .77);
    gain.gain.setValueAtTime(.001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'warning' ? .105 : .12, start + .024);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
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
    if (!dive.profile.muted) unlockAudio();
    updateAmbience();
    updateSoundButtons();
  }

  function announce(kind, message, color) {
    tone(kind);
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
    unlockAudio();
    updateHud();
  }

  function coverStats() {
    const stats = byId('cover-status');
    const count = dive.profile.haul.length;
    stats.hidden = count === 0;
    stats.textContent = count + ' / ' + W.treasures.length + ' сокровищ поднято';
  }

  function updateHud() {
    const p = dive.player;
    const maximum = dive.value('air');
    const current = Math.ceil(p.air);
    const lives = dive.value('life');
    const low = p.air < 7;
    const ready = dive.atSurface && upgrades.some(upgrade => {
      const cost = upgrade.costs[dive.profile.levels[upgrade.id]];
      return cost !== undefined && dive.profile.xp >= cost;
    });
    byId('air-fill').style.transform = 'scaleX(' + Math.max(0, p.air / maximum) + ')';
    byId('stamina').style.transform = 'scaleX(' + p.stamina + ')';
    byId('edge-signal').style.opacity = Math.max(dive.impact * .70, low ? .14 + Math.sin(dive.phase * 6) * .055 : 0);
    const key = [current, maximum, dive.meters, dive.profile.xp, p.lives, lives, dive.activeZone.id, dive.haulXp, ready, dive.atSurface, low, dive.value('weapon')].join(',');
    if (previousUi === key) return;
    previousUi = key;

    byId('air-text').textContent = current + ' / ' + maximum + ' с';
    byId('air-meter').setAttribute('aria-valuenow', current);
    byId('air-meter').setAttribute('aria-valuemax', maximum);
    byId('air-meter').closest('.oxygen').classList.toggle('low', low);
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
    byId('bag-text').textContent = 'Добыча ' + dive.haulXp + ' ОП';
    byId('bag').classList.toggle('loaded', dive.haulXp > 0);
    byId('shop').classList.toggle('ready', ready);
    byId('attack').classList.toggle('locked', dive.value('weapon') === 0);
    let tip = '';
    if (dive.atSurface) {
      if (current < maximum) tip = 'На поверхности · кислород восстанавливается';
      else if (ready) tip = 'Доступно улучшение снаряжения';
      else if (dive.profile.haul.length === 0) tip = touchMode ? 'Джойстик вниз, чтобы нырнуть' : 'S или ↓, чтобы нырнуть';
    } else if (dive.haulXp > 0) tip = 'Всплыви, чтобы получить ОП';
    byId('tip').textContent = tip;
  }

  function showPanel(type, payload) {
    if (!panelType) previousFocus = document.activeElement;
    panelType = type;
    if (type === 'end' && payload) lastResult = payload;
    resetControls();
    updateAmbience();
    panel.classList.toggle('map-panel', type === 'map');
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
  }

  function renderPanel() {
    const title = byId('panel-title');
    const kicker = byId('panel-kicker');
    kicker.textContent = '';
    if (panelType === 'guide') {
      title.textContent = 'Как играть';
      panelContent.innerHTML = '<p>Собирай находки и возвращайся на поверхность, чтобы получить очки опыта (ОП). Кислород восстанавливается постепенно. Рывок помогает уйти от хищников, но расходует больше воздуха.</p>'
        + '<div class="guide-list">' + [
          ['Плавание', '<kbd>W A S D</kbd><kbd>↑ ← ↓ →</kbd>'],
          ['Рывок', '<kbd>Shift</kbd>'],
          ['Гарпун', '<kbd>Space</kbd>'],
          ['Карта и снаряжение', '<kbd>M</kbd><kbd>E</kbd>'],
        ].map(([label, keys]) => '<div class="guide-line"><span>' + label + '</span><span class="guide-keys">' + keys + '</span></div>').join('') + '</div>'
        + '<p>На сенсорном экране плыви джойстиком слева. Гарпун продаётся на поверхности. Чтобы прицелиться, направь джойстик в сторону хищника.</p>'
        + '<div class="panel-actions"><button class="primary" data-action="' + (started ? 'pause' : 'start') + '">' + (started ? 'Назад в меню паузы' : 'Погрузиться') + '</button></div>';
    } else if (panelType === 'pause') {
      title.textContent = 'Пауза';
      panelContent.innerHTML = '<p>Поднято сокровищ <b>' + dive.profile.haul.length + ' из ' + W.treasures.length
        + '</b> · рекорд глубины <b>' + dive.profile.bestDepth + ' м</b></p>'
        + '<div class="panel-actions"><button class="primary" data-action="resume">Продолжить</button><button class="subtle" data-action="guide">Как играть</button>'
        + '<button class="icon-button" data-sound></button><button class="subtle" data-action="home">Главное меню</button></div>';
      updateSoundButtons();
    } else if (panelType === 'shop') {
      title.textContent = 'Снаряжение';
      kicker.textContent = dive.profile.xp + ' ОП доступно';
      panelContent.innerHTML = '<p>' + (dive.atSurface ? 'Выбери улучшение перед следующим погружением.' : 'Покупки доступны после всплытия.') + '</p>'
        + '<div class="shop-list">' + upgrades.map(item => {
          const level = dive.profile.levels[item.id];
          const cost = item.costs[level];
          const maxed = cost === undefined;
          const disabled = maxed || !dive.atSurface || dive.profile.xp < cost;
          const air = item.id === 'air' && !maxed ? ' · ' + item.values[level + 1] + ' с' : '';
          return '<article class="shop-row"><span class="shop-symbol">' + icon(item.icon) + '</span><div><h3>' + item.name
            + '</h3><p>' + item.copy + air + '</p><div class="levels" aria-label="Уровень ' + level + ' из ' + item.costs.length + '">'
            + item.costs.map((_, i) => '<i class="' + (i < level ? 'filled' : '') + '"></i>').join('')
            + '</div><button type="button" data-buy="' + item.id + '" ' + (disabled ? 'disabled' : '') + '>'
            + (maxed ? 'Максимум' : (item.id === 'weapon' && !level ? 'Купить · ' : '') + cost + ' ОП') + '</button></div></article>';
        }).join('') + '</div>';
    } else if (panelType === 'map') {
      title.textContent = 'Карта океана';
      kicker.textContent = dive.activeZone.name + ' · ' + dive.meters + ' м';
      panelContent.innerHTML = '<canvas class="map-frame" id="map-canvas" aria-label="Карта океана с положением дайвера и сокровищами"></canvas><div class="map-legend">'
        + [{ plural: 'Ты здесь', color: '#e1f9a2' }, ...W.treasureTypes].map(item => '<span><i style="background:' + item.color + '"></i>' + item.plural + '</span>').join('') + '</div>';
      renderer.drawMap(byId('map-canvas'), dive);
    } else if (panelType === 'end') {
      title.textContent = 'Погружение окончено';
      kicker.textContent = lastResult.cause;
      const lost = lastResult.lost ? 'Добыча на ' + lastResult.lost + ' ОП осталась под водой. ' : '';
      panelContent.innerHTML = '<p>' + lost + (lastResult.lives ? 'Осталось жизней · ' + lastResult.lives : 'Жизни закончились. Заработанные ОП и улучшения сохранены.') + '</p>'
        + '<div class="panel-actions"><button class="primary" data-action="respawn">' + (lastResult.lives ? 'Вернуться на поверхность' : 'Новая экспедиция') + '</button></div>';
    }
  }

  function resetControls() {
    pressed.clear();
    stick.pointer = null;
    stick.x = stick.y = 0;
    byId('knob').style.transform = '';
    hold.boost = hold.attack = false;
    byId('boost').classList.remove('pressed');
    byId('attack').classList.remove('pressed');
  }

  function action(name) {
    if (name === 'resume') hidePanel();
    else if (name === 'start') start();
    else if (name === 'respawn') {
      dive.respawn();
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

  const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'];
  const keyOn = (...codes) => codes.some(code => pressed.has(code));
  function controls() {
    const x = Number(keyOn('KeyD', 'ArrowRight')) - Number(keyOn('KeyA', 'ArrowLeft'));
    const y = Number(keyOn('KeyS', 'ArrowDown')) - Number(keyOn('KeyW', 'ArrowUp'));
    return { x: stick.x || x, y: stick.y || y,
      boost: hold.boost || keyOn('ShiftLeft', 'ShiftRight'), attack: hold.attack || keyOn('Space') };
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
  for (const id of ['boost', 'attack']) {
    const button = byId(id);
    let pointer;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (hold[id]) return;
      pointer = event.pointerId;
      button.setPointerCapture(pointer);
      hold[id] = true;
      button.classList.add('pressed');
      if (id === 'attack') {
        const { x, y } = controls();
        dive.shoot(x, y);
      }
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
    }
    if (!event.repeat && event.code === 'KeyM') showPanel('map');
    if (!event.repeat && event.code === 'KeyE') showPanel('shop');
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
    updateAmbience();
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-sound')) toggleSound();
    else if (button.dataset.action) action(button.dataset.action);
    else if (button.dataset.buy) {
      if (dive.buy(button.dataset.buy)) {
        renderPanel();
        updateHud();
        const updated = panel.querySelector('[data-buy="' + button.dataset.buy + '"]');
        if (updated.disabled) panel.focus();
        else updated.focus();
      }
    }
  });
  for (const [id, type] of [['guide', 'guide'], ['map', 'map'], ['shop', 'shop'], ['pause', 'pause']]) {
    byId(id).addEventListener('click', () => showPanel(type));
  }
  byId('start').addEventListener('click', start);
  byId('close').addEventListener('click', hidePanel);
  modal.addEventListener('click', event => { if (event.target === modal && panelType !== 'end') hidePanel(); });

  updateSoundButtons();
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
