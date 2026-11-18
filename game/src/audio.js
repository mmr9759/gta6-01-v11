// VELMARA audio: all sound is synthesized with WebAudio — engine hum, gunfire, sirens,
// pickups, UI blips and three radio stations with their own sequenced basslines.
(function () {
  'use strict';
  var V = window.VELMARA = window.VELMARA || {};

  V.Audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, sirenTimer: 0, muted: false, radioOn: true,
    station: 0, seqStep: 0, seqTimer: null, seqNext: 0, volume: 0.7,

    init: function () {
      if (this.ctx) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.32;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.9;
        this.sfxGain.connect(this.master);
        // Engine hum: two detuned oscillators through a lowpass.
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 55;
        var engineOsc2 = this.ctx.createOscillator();
        engineOsc2.type = 'square';
        engineOsc2.frequency.value = 28;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        var lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 420;
        this.engineOsc.connect(lp); engineOsc2.connect(lp);
        lp.connect(this.engineGain); this.engineGain.connect(this.sfxGain);
        this.engineOsc.start(); engineOsc2.start();
        this.engineOsc2 = engineOsc2;
        // Siren: alternating two-tone oscillator.
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenOsc.frequency.value = 700;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.sfxGain);
        this.sirenOsc.start();
      } catch (e) { this.ctx = null; }
    },

    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted: function (m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : this.volume;
    },

    /** Short synthesized blip. freq in Hz, dur seconds, type, gain, slideTo optional. */
    blip: function (freq, dur, type, gain, slideTo) {
      if (!this.ctx || this.muted) return;
      try {
        var o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
        g.gain.setValueAtTime(gain || 0.2, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        o.connect(g); g.connect(this.sfxGain);
        o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
      } catch (e) {}
    },

    /** Noise burst for gunshots, crashes and explosions. */
    noise: function (dur, gain, filterFreq) {
      if (!this.ctx || this.muted) return;
      try {
        var len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
        var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = this.ctx.createBufferSource();
        src.buffer = buf;
        var f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = filterFreq || 2400;
        var g = this.ctx.createGain();
        g.gain.value = gain || 0.4;
        src.connect(f); f.connect(g); g.connect(this.sfxGain);
        src.start();
      } catch (e) {}
    },

    shoot: function (kind) {
      if (kind === 'shotgun') { this.noise(0.28, 0.55, 1400); this.blip(120, 0.18, 'square', 0.25, 50); }
      else if (kind === 'rifle') { this.noise(0.22, 0.5, 3200); this.blip(220, 0.12, 'sawtooth', 0.2, 70); }
      else if (kind === 'smg') { this.noise(0.1, 0.35, 2800); }
      else { this.noise(0.14, 0.42, 2200); this.blip(180, 0.1, 'square', 0.22, 60); }
    },
    crash: function (hard) { this.noise(hard ? 0.35 : 0.18, hard ? 0.5 : 0.3, 900); this.blip(90, 0.2, 'sine', 0.3, 40); },
    pickup: function () { this.blip(880, 0.09, 'sine', 0.25); setTimeout(function () { V.Audio.blip(1318, 0.14, 'sine', 0.25); }, 90); },
    coin: function () { this.blip(1046, 0.08, 'triangle', 0.25); setTimeout(function () { V.Audio.blip(1568, 0.16, 'triangle', 0.25); }, 70); },
    missionDone: function () { var n = [523, 659, 784, 1046]; n.forEach(function (f, i) { setTimeout(function () { V.Audio.blip(f, 0.22, 'triangle', 0.3); }, i * 110); }); },
    missionFail: function () { this.blip(220, 0.4, 'sawtooth', 0.25, 110); },
    uiClick: function () { this.blip(660, 0.06, 'sine', 0.18); },
    phone: function () { this.blip(1200, 0.12, 'sine', 0.2); setTimeout(function () { V.Audio.blip(1200, 0.12, 'sine', 0.2); }, 180); },
    wantedUp: function () { this.blip(440, 0.15, 'square', 0.2, 880); },
    explosion: function () { this.noise(0.8, 0.7, 500); this.blip(60, 0.7, 'sine', 0.4, 30); },

    /** Engine pitch follows speed; siren wails while wanted >= 1. */
    updateEngine: function (speed01, wanted) {
      if (!this.ctx) return;
      var t = this.ctx.currentTime;
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.05, t, 0.1);
      if (this.engineOsc) this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
      if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(26 + speed01 * 60, t, 0.08);
      if (this.sirenOsc && this.sirenGain) {
        if (wanted > 0 && !this.muted) {
          this.sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
          var phase = (t % 0.9) < 0.45 ? 700 : 950;
          this.sirenOsc.frequency.setTargetAtTime(phase, t, 0.05);
        } else {
          this.sirenGain.gain.setTargetAtTime(0, t, 0.2);
        }
      }
    },

    midiToFreq: function (m) { return 440 * Math.pow(2, (m - 69) / 12); },

    /** One sequencer step of the current radio station: bass note + sparkle arp. */
    radioStep: function () {
      if (!this.ctx || this.muted || !this.radioOn) return;
      var st = V.RADIO[this.station];
      var step = this.seqStep;
      var bassNotes = [0, 0, 7, 0, 10, 0, 7, 5];
      var arpNotes = [12, 15, 19, 24, 19, 15, 12, 7];
      var root = st.root + 12;
      if (step % 2 === 0) {
        var bn = bassNotes[(step / 2) % 8];
        this.tone(this.midiToFreq(root + bn), 0.22, st.wave === 'sawtooth' ? 'sawtooth' : 'triangle', 0.16, this.musicGain);
      }
      if (step % 4 === 1) {
        var an = arpNotes[step % 8];
        this.tone(this.midiToFreq(root + 12 + an), 0.12, 'sine', 0.07, this.musicGain);
      }
      if (step % 16 === 0) this.tone(this.midiToFreq(root + 24), 0.5, 'sine', 0.05, this.musicGain);
      this.seqStep = (this.seqStep + 1) % 64;
    },

    tone: function (freq, dur, type, gain, dest) {
      try {
        var o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(gain || 0.15, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        o.connect(g); g.connect(dest || this.sfxGain);
        o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
      } catch (e) {}
    },

    startRadio: function () {
      if (this.seqTimer) return;
      var self = this;
      var tick = function () {
        if (!self.ctx) return;
        self.radioStep();
        var st = V.RADIO[self.station];
        self.seqTimer = setTimeout(tick, 60000 / st.bpm / 2);
      };
      var st0 = V.RADIO[this.station];
      this.seqTimer = setTimeout(tick, 60000 / st0.bpm / 2);
    },

    nextStation: function () {
      this.station = (this.station + 1) % V.RADIO.length;
      this.seqStep = 0;
      return V.RADIO[this.station];
    },

    stopRadio: function () {
      if (this.seqTimer) { clearTimeout(this.seqTimer); this.seqTimer = null; }
    }
  };
})();
