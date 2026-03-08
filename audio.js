let audioCtx = null;
let audioEnabled = false;
let ignoreVelocity = false;
const activeNotes = new Map(); // pitch → { oscillators, gainNode }

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    return audioCtx;
}

function midiToFreq(pitch) {
    return 440 * Math.pow(2, (pitch - 69) / 12);
}

function startNote(pitch, velocity) {
    if (!audioEnabled) return;

    // Re-trigger: stop existing note if any
    if (activeNotes.has(pitch)) {
        stopNote(pitch);
    }

    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const v = ignoreVelocity ? 1.0 : velocity;
    const totalGain = v * 0.3;

    const masterGain = ctx.createGain();
    // ADSR: attack 5ms, decay 300ms, sustain 0.3
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(totalGain, now + 0.005);
    masterGain.gain.linearRampToValueAtTime(totalGain * 0.3, now + 0.005 + 0.3);
    masterGain.connect(ctx.destination);

    const baseFreq = midiToFreq(pitch);
    const harmonics = [
        { freq: baseFreq,     gain: 1.0 },
        { freq: baseFreq * 2, gain: 0.5 },
        { freq: baseFreq * 3, gain: 0.25 },
    ];

    const oscillators = harmonics.map(({ freq, gain }) => {
        const oscGain = ctx.createGain();
        oscGain.gain.value = gain;
        oscGain.connect(masterGain);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(oscGain);
        osc.start(now);
        return { osc, oscGain };
    });

    activeNotes.set(pitch, { oscillators, gainNode: masterGain });
}

function stopNote(pitch) {
    if (!activeNotes.has(pitch)) return;

    const { oscillators, gainNode } = activeNotes.get(pitch);
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const releaseEnd = now + 0.5; // 500ms release

    gainNode.gain.cancelAndHoldAtTime(now);
    gainNode.gain.linearRampToValueAtTime(0, releaseEnd);

    oscillators.forEach(({ osc, oscGain }) => {
        osc.stop(releaseEnd);
        osc.onended = () => {
            osc.disconnect();
            oscGain.disconnect();
            gainNode.disconnect();
        };
    });
    activeNotes.delete(pitch);
}

function toggleAudio(cb) {
    audioEnabled = cb.checked;
    if (!audioEnabled) {
        // Stop all active notes immediately
        [...activeNotes.keys()].forEach(pitch => stopNote(pitch));
    }
}

function toggleIgnoreVelocity(cb) {
    ignoreVelocity = cb.checked;
}
