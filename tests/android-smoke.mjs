import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const packageName = 'com.silentdepth.game';
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 60_000 }).trim();

async function eventually(check, label) {
  const deadline = Date.now() + 25_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(350);
  }
  throw new Error(label, { cause: lastError });
}

adb('install', '-r', 'quiet-depth.apk');
adb('shell', 'wm', 'size', '480x960');
adb('shell', 'wm', 'density', '320');
const cutout = 'com.android.internal.display.cutout.emulation.tall';
if (adb('shell', 'cmd', 'overlay', 'list', 'android').includes(cutout)) {
  adb('shell', 'cmd', 'overlay', 'enable', cutout);
  console.log('Display cutout emulation enabled.');
}
adb('shell', 'am', 'start', '-W', '-n', packageName + '/.MainActivity');

const pid = await eventually(() => adb('shell', 'pidof', packageName), 'App did not start');
const port = adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
const tab = await eventually(async () => {
  const response = await fetch('http://127.0.0.1:' + port + '/json/list');
  return (await response.json()).find(page => page.url.endsWith('/android_asset/index.html'));
}, 'Android WebView debugger unavailable');

const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const responses = new Map();
socket.addEventListener('message', ({ data }) => {
  const reply = JSON.parse(data);
  responses.get(reply.id)?.(reply);
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      responses.delete(id);
      reject(new Error('Timed out waiting for ' + method));
    }, 10_000);
    responses.set(id, reply => {
      clearTimeout(timer);
      responses.delete(id);
      if (reply.error) reject(new Error(reply.error.message));
      else resolve(reply.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(result.description || exceptionDetails.text);
  return result.value;
}

try {
  await eventually(() => evaluate('window.DepthWorld && Boolean(window.AndroidEffects)'), 'Game scripts or native audio bridge missing');
  const native = await eventually(() => evaluate(`(() => {
    const bite = AndroidEffects.play('bite');
    const death = AndroidEffects.play('death');
    return bite && death;
  })()`), 'Android SoundPool did not start both recorded effects');
  assert(native);
  const muteWorks = await evaluate(`(() => {
    AndroidEffects.setMuted(true);
    const silent = !AndroidEffects.play('bite') && !AndroidEffects.play('death');
    AndroidEffects.setMuted(false);
    return silent && !AndroidEffects.play('unrecognized');
  })()`);
  assert(muteWorks);

  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window, 'DepthSimulation', { configurable: true, set(api) {
      const Dive = api.Dive;
      api.Dive = class extends Dive {
        constructor(announce, end) {
          super((kind, ...args) => {
            if (kind === 'bite' || kind === 'death') window.smokeCues.push(kind);
            announce(kind, ...args);
          }, end);
          window.smokeDive = this;
          window.smokeCues = [];
        }
      };
      Object.defineProperty(window, 'DepthSimulation', { value: api });
    } });
  ` });
  await send('Page.reload');
  await eventually(() => evaluate('Boolean(window.smokeDive)'), 'Reloaded game did not initialize');

  const menu = await evaluate(`(() => {
    const start = document.getElementById('start');
    const initialTop = start.getBoundingClientRect().top;
    document.getElementById('title').style.fontSize = '136px';
    document.querySelector('.cover-body p').style.fontSize = '32px';
    const rect = start.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2)?.closest('#start');
    return { width: innerWidth, height: innerHeight, initialTop, top: rect.top, bottom: rect.bottom, hit: Boolean(hit) };
  })()`);
  assert(menu.width > menu.height && menu.height <= 245, JSON.stringify(menu));
  assert.equal(menu.top, menu.initialTop);
  assert(menu.hit && menu.top >= 4 && menu.bottom <= menu.height - 4, JSON.stringify(menu));
  await evaluate("document.getElementById('start').click()");
  const cues = await evaluate(`(() => {
    const dive = window.smokeDive;
    Object.assign(dive.player, { x: 382, y: 140, lives: 2, invulnerable: 0 });
    for (const fish of dive.predators) fish.dead = true;
    const fish = dive.predators[0];
    Object.assign(fish, { x: 396, y: 140, homeX: 396, homeY: 140, type: 0, dead: false });
    dive.updatePredators(1/60);
    dive.player.invulnerable = 0;
    dive.updatePredators(1/60);
    return window.smokeCues;
  })()`);
  assert.deepEqual(cues, ['bite', 'bite', 'death']);
  assert.equal(await evaluate("document.getElementById('panel-title').textContent"), 'Дайвер погиб');
  console.log('Android accepted both SoundPool recordings and mute. Gameplay emitted both cues.');
  console.log('Start button is tappable in the Android WebView at', menu.width + '×' + menu.height);
} finally {
  socket.close();
  adb('forward', '--remove', 'tcp:' + port);
}
