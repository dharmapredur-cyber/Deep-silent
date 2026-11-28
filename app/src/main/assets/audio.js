(() => {
  'use strict';

  const tones = {
    find: [510, 786, .20], bank: [392, 698, .39], damage: [138, 42, .27],
    warning: [275, 222, .29], shot: [190, 82, .10], kill: [452, 612, .23],
    upgrade: [390, 620, .24], zone: [280, 410, .44], milestone: [550, 880, .49],
    shield: [470, 760, .24], defuse: [670, 398, .19], 'electric-charge': [148, 326, .39],
  };

  class DiveAudio {
    constructor() {
      this.muted = false;
      this.active = false;
    }

    unlock() {
      if (this.muted) return;
      try {
        if (!this.context) {
          const Context = window.AudioContext || window.webkitAudioContext;
          if (!Context) return;
          this.initialize(new Context());
        }
        void this.context.resume().catch(() => {});
        this.applyMix();
      } catch { /* The game remains playable without Web Audio support. */ }
    }

    initialize(context) {
      this.context = context;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -13;
      compressor.ratio.value = 4;
      this.master = context.createGain();
      this.master.connect(compressor).connect(context.destination);
      this.recordings = {};
      for (const [name, encoded] of Object.entries(window.DepthRecordings)) {
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        void context.decodeAudioData(bytes.buffer)
          .then(buffer => { this.recordings[name] = buffer; })
          .catch(() => { /* Use a synthesized cue if this WebView cannot decode MP3. */ });
      }
      this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

      const wash = context.createBufferSource();
      wash.buffer = context.createBuffer(1, context.sampleRate * 5, context.sampleRate);
      const water = wash.buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < water.length; i++) {
        previous = (previous + samples[i % samples.length] * .019) / 1.019;
        water[i] = previous * Math.min(1, i / 2000, (water.length - i) / 2000);
      }
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      this.ambience = context.createGain();
      this.ambience.gain.value = 0;
      wash.loop = true;
      wash.connect(filter).connect(this.ambience).connect(this.master);
      wash.start();
    }

    mix(active, muted) {
      this.active = active;
      this.muted = muted;
      this.applyMix();
    }

    applyMix() {
      if (!this.ambience) return;
      const time = this.context.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : .9, time, .025);
      this.ambience.gain.setTargetAtTime(this.active ? .29 : 0, time, .12);
    }

    effectOutput(pan) {
      if (!pan || !this.context.createStereoPanner) return this.master;
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(this.master);
      setTimeout(() => panner.disconnect(), 1000);
      return panner;
    }

    noiseBurst(out, time, duration, from, to, volume, attack, type = 'bandpass', resonance = .8) {
      const c = this.context;
      const source = c.createBufferSource();
      source.buffer = this.noise;
      const filter = c.createBiquadFilter();
      filter.type = type;
      filter.Q.value = resonance;
      filter.frequency.setValueAtTime(from, time);
      filter.frequency.exponentialRampToValueAtTime(to, time + duration);
      const envelope = c.createGain();
      envelope.gain.setValueAtTime(.0001, time);
      envelope.gain.exponentialRampToValueAtTime(volume, time + attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
      source.connect(filter).connect(envelope).connect(out);
      source.start(time, Math.random() * .9);
      source.stop(time + duration);
    }

    note(out, time, duration, from, to, volume, type = 'sine') {
      const c = this.context;
      const oscillator = c.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, time);
      oscillator.frequency.exponentialRampToValueAtTime(to, time + duration * .8);
      const envelope = c.createGain();
      envelope.gain.setValueAtTime(.0001, time);
      envelope.gain.exponentialRampToValueAtTime(volume, time + Math.min(.02, duration * .18));
      envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
      oscillator.connect(envelope).connect(out);
      oscillator.start(time);
      oscillator.stop(time + duration);
    }

    splash(out, time, volume, frequency) {
      this.noiseBurst(out, time, .26, frequency * 1.65, frequency * .54, volume, .019);
      this.noiseBurst(out, time + .036, .22, frequency * .68, frequency * .32, volume * .58, .027, 'lowpass');
      for (let i = 0; i < 3; i++) {
        const pitch = frequency * (.4 + Math.random() * .36);
        this.note(out, time + .023 + i * .038, .069, pitch, pitch * 1.55, volume * .092);
      }
    }

    breath(out, time, inhale) {
      if (inhale) {
        this.noiseBurst(out, time, .34, 620, 1770, .36 * .70, .17, 'bandpass', 1.1);
        this.noiseBurst(out, time + .041, .255, 950, 2600, .14 * .70, .13, 'highpass');
      } else {
        this.noiseBurst(out, time, .57, 1450, 580, .40, .057, 'bandpass', .85);
        this.noiseBurst(out, time + .013, .44, 420, 240, .23, .042, 'lowpass');
      }
    }

    playRecording(name, out, at, volume) {
      const buffer = this.recordings[name];
      if (!buffer) return false;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain).connect(out);
      source.start(at);
      if (name !== 'mine') {
        this.breathSource = source;
        source.onended = () => {
          if (this.breathSource === source) this.breathSource = null;
        };
      }
      return true;
    }

    stopBreath() {
      if (!this.breathSource) return;
      this.breathSource.stop();
      this.breathSource = null;
    }

    scream(out, time) {
      const duration = .78;
      const c = this.context;
      const voice = c.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(176, time);
      voice.frequency.exponentialRampToValueAtTime(284, time + .14);
      voice.frequency.exponentialRampToValueAtTime(212, time + .39);
      voice.frequency.exponentialRampToValueAtTime(125, time + duration);
      const envelope = c.createGain();
      envelope.gain.setValueAtTime(.0001, time);
      envelope.gain.exponentialRampToValueAtTime(.44, time + .063);
      envelope.gain.exponentialRampToValueAtTime(.25, time + .29);
      envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
      envelope.connect(out);
      for (const [from, to, resonance] of [[755, 570, 2.1], [1310, 1010, 2.8], [2520, 1840, 4]]) {
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = resonance;
        filter.frequency.setValueAtTime(from, time);
        filter.frequency.exponentialRampToValueAtTime(to, time + duration);
        voice.connect(filter).connect(envelope);
      }
      this.noiseBurst(out, time + .01, .66, 1850, 710, .21, .062);
      voice.start(time);
      voice.stop(time + duration);
    }

    play(kind, { volume = 1, pan = 0 } = {}) {
      if (this.muted || !this.master || this.context.state !== 'running' || volume < .025) return;
      const time = this.context.currentTime;
      const out = this.effectOutput(pan);

      if (kind === 'inhale') {
        this.stopBreath();
        if (!this.playRecording('inhale', out, time, .89 * .70)) this.breath(out, time, true);
      } else if (kind === 'breath-cancel') {
        this.stopBreath();
      } else if (kind === 'dive-in') {
        this.splash(out, time, .54, 1250);
      } else if (kind === 'surface') {
        this.splash(out, time, .43, 1470);
        this.stopBreath();
        if (!this.playRecording('surface', out, time + .10, .82)) this.breath(out, time + .10, false);
      } else if (kind === 'swim' || kind === 'boost-swim' || kind === 'predator-swim') {
        const gain = { swim: .20, 'boost-swim': .31, 'predator-swim': .26 }[kind];
        this.splash(out, time, gain * volume, 530 + Math.random() * 180);
      } else if (kind === 'mine') {
        if (this.playRecording('mine', out, time, .61)) return;
        this.noiseBurst(out, time, .83, 510, 82, .84, .012, 'lowpass');
        this.noiseBurst(out, time + .014, .31, 2250, 290, .58, .011);
        this.note(out, time, .72, 100, 34, .50, 'triangle');
        this.splash(out, time + .060, .46, 700);
      } else if (kind === 'electric') {
        this.noiseBurst(out, time, .34, 2300, 560, .53, .011);
        this.note(out, time, .28, 275, 85, .18, 'triangle');
      } else if (kind === 'knife') {
        this.noiseBurst(out, time, .17, 2550, 720, .26, .02);
        this.note(out, time + .016, .09, 530, 320, .056);
      } else if (kind === 'bite') {
        this.noiseBurst(out, time, .16, 2650, 460, .51, .016);
        this.noiseBurst(out, time + .025, .14, 570, 240, .38, .01, 'lowpass');
        this.note(out, time + .01, .16, 122, 52, .19, 'triangle');
      } else if (kind === 'death') {
        this.stopBreath();
        this.scream(out, time + .045);
      } else if (tones[kind]) {
        const [from, to, duration] = tones[kind];
        this.note(out, time, duration, from, to, .115, kind === 'damage' ? 'triangle' : 'sine');
      }
    }
  }

  window.DepthAudio = DiveAudio;
})();
