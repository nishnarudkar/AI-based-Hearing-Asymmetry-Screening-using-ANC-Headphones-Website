// static/script.js
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let currentScreen = 'login';
const testFrequencies = [1000, 2000];
let referenceLevel = 0.1;
const thresholds = { left: {}, right: {} };
let currentTest = null;
let testSequence = [];
let currentTestIndex = 0;
let totalTests = 0;
const reversalsTarget = 2;
const stepSizeLarge = 20;
const stepSizeSmall = 10;
let userId = null;

// Show/hide screens
function showScreen(screenId) {
    document.querySelectorAll('#main-frame > div').forEach(div => div.classList.add('hidden'));
    document.getElementById(screenId + '-screen').classList.remove('hidden');
    currentScreen = screenId;
}

// Audio functions
function playTone(freq, duration, volume, channel) { // channel 'left' or 'right' or 'both'
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;

    let panner;
    if (channel === 'both') {
        panner = new StereoPannerNode(audioCtx, { pan: 0 });
    } else {
        panner = new StereoPannerNode(audioCtx, { pan: channel === 'left' ? -1 : 1 });
    }

    oscillator.connect(panner);
    panner.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    setTimeout(() => oscillator.stop(), duration * 1000);
}

function playChannelTest(channel) {
    const status = document.getElementById('channel-status');
    status.textContent = `Playing in ${channel.toUpperCase()} ear 🔊`;
    status.style.color = channel === 'left' ? '#3498db' : '#e74c3c';
    playTone(1000, 0.7, 0.3, channel);
    setTimeout(() => status.textContent = '', 1000);
}

function playReferenceTone() {
    playTone(1000, 1.0, referenceLevel, 'both');
}

function playTestTone(freq, channel, levelDb) {
    const amplitude = referenceLevel * Math.pow(10, levelDb / 20);
    playTone(freq, 0.3, amplitude, channel);
}

// Pulse animation
function pulseResponseArea() {
    const frame = document.getElementById('response-frame');
    const colors = ['#ecf0f1', '#dfe6e9'];
    let i = 0;
    const interval = setInterval(() => {
        if (currentScreen !== 'testing') {
            clearInterval(interval);
            return;
        }
        frame.style.backgroundColor = colors[i % 2];
        i++;
    }, 1000);
}

// Event listeners
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('name').value,
        surname: document.getElementById('surname').value,
        age_group: document.querySelector('input[name="age_group"]:checked')?.value || null,
        gender: document.querySelector('input[name="gender"]:checked')?.value || null,
        headphones_correct: document.getElementById('headphones_correct').checked,
        anc_mode: document.querySelector('input[name="anc_mode"]:checked')?.value || null,
        noise_level: parseInt(document.querySelector('input[name="noise_level"]:checked')?.value) || null,
        ear_pain: document.getElementById('ear_pain').checked,
        recent_cold: document.getElementById('recent_cold').checked,
        hearing_history: document.getElementById('hearing_history').checked
    };
    const response = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    userId = result.user_id;
    showScreen('welcome');
});

document.getElementById('start-btn').addEventListener('click', () => showScreen('consent'));
document.getElementById('agree-btn').addEventListener('click', () => showScreen('device-check'));
document.getElementById('back-welcome-btn').addEventListener('click', () => showScreen('welcome'));
document.getElementById('left-ear-btn').addEventListener('click', () => playChannelTest('left'));
document.getElementById('right-ear-btn').addEventListener('click', () => playChannelTest('right'));
document.getElementById('headphones-ready-btn').addEventListener('click', () => showScreen('calibration'));
document.getElementById('back-consent-btn').addEventListener('click', () => showScreen('consent'));
document.getElementById('volume-slider').addEventListener('input', (e) => {
    referenceLevel = e.target.value / 100 * 0.3;
});
document.getElementById('play-tone-btn').addEventListener('click', playReferenceTone);
document.getElementById('volume-set-btn').addEventListener('click', () => showScreen('instructions'));
document.getElementById('back-device-btn').addEventListener('click', () => showScreen('device-check'));
document.getElementById('start-test-btn').addEventListener('click', startHearingTest);
document.getElementById('back-calibration-btn').addEventListener('click', () => showScreen('calibration'));
document.getElementById('try-again-btn').addEventListener('click', restartTest);
document.getElementById('exit-btn').addEventListener('click', () => location.reload());

// Keyboard events
document.addEventListener('keydown', (event) => {
    if (event.key === ' ' && currentTest && currentScreen === 'testing') {
        event.preventDefault();
        currentTest.onResponse(true);
    } else if (event.key === 'Escape') {
        if (confirm('Sure you want to exit?')) {
            showScreen('welcome');
        }
    }
});

// Start hearing test
function startHearingTest() {
    showScreen('testing');
    thresholds.left = {};
    thresholds.right = {};
    testSequence = [];
    testFrequencies.forEach(freq => {
        ['left', 'right'].forEach(ear => testSequence.push({freq, ear}));
    });
    testSequence = testSequence.sort(() => Math.random() - 0.5);
    currentTestIndex = 0;
    totalTests = testSequence.length;
    pulseResponseArea();
    setTimeout(runNextThresholdTest, 500);
}

function runNextThresholdTest() {
    if (currentTestIndex >= totalTests) {
        showResultsScreen();
        return;
    }
    const {freq, ear} = testSequence[currentTestIndex];
    document.getElementById('response-status').textContent = 'Listen carefully... 👂';
    document.getElementById('response-status').classList.add('secondary-text');
    const progress = (currentTestIndex / totalTests) * 100;
    document.getElementById('progress-bar').value = progress;
    document.getElementById('progress-label').textContent = `${Math.round(progress)}%`;
    const earColor = ear === 'left' ? '#3498db' : '#e74c3c';
    const earSymbol = ear === 'left' ? '👂 Left' : '👂 Right';
    document.getElementById('ear-label').textContent = `${earSymbol} Ear`;
    document.getElementById('ear-label').style.color = earColor;
    document.getElementById('status-label').textContent = `Frequency: ${freq} Hz 🎵`;
    document.getElementById('test-info').textContent = `Test ${currentTestIndex + 1}/${totalTests} ⚡`;
    currentTest = new AdaptiveThresholdTest(freq, ear);
    currentTest.start();
}

function onThresholdComplete(freq, ear, threshold) {
    thresholds[ear][freq] = threshold;
    currentTestIndex++;
    setTimeout(runNextThresholdTest, 500);
}

// AdaptiveThresholdTest class
class AdaptiveThresholdTest {
    constructor(frequency, ear) {
        this.frequency = frequency;
        this.ear = ear;
        this.currentLevel = -10;
        this.stepSize = stepSizeLarge;
        this.reversals = [];
        this.responses = [];
        this.trialCount = 0;
        this.maxTrials = 10;
        this.consecutiveHeard = 0;
        this.lastDirection = null;
        this.catchTrialProbability = 0.03;
        this.isCatchTrial = false;
        this.waitingForResponse = false;
        this.responseTimer = null;
    }

    start() {
        this.runTrial();
    }

    runTrial() {
        if (this.trialCount >= this.maxTrials || this.reversals.length >= reversalsTarget) {
            this.completeTest();
            return;
        }
        this.trialCount++;
        this.isCatchTrial = Math.random() < this.catchTrialProbability;
        document.getElementById('response-status').textContent = 'Listen carefully... 👂';
        document.getElementById('response-status').classList.add('secondary-text');
        const delay = Math.random() * 0.7 + 0.3;
        setTimeout(() => this.presentStimulus(), delay * 1000);
    }

    presentStimulus() {
        this.waitingForResponse = true;
        if (!this.isCatchTrial) {
            playTestTone(this.frequency, this.ear, this.currentLevel);
        }
        this.responseTimer = setTimeout(() => this.onNoResponse(), 1000);
    }

    onResponse(heard) {
        if (!this.waitingForResponse) return;
        this.waitingForResponse = false;
        if (this.responseTimer) clearTimeout(this.responseTimer);
        const correctResponse = !this.isCatchTrial;
        this.responses.push({
            level: this.currentLevel,
            heard,
            catchTrial: this.isCatchTrial,
            correct: heard === correctResponse
        });
        const status = document.getElementById('response-status');
        if (this.isCatchTrial) {
            if (!heard) {
                status.textContent = 'Good! (No tone) 👍';
                status.style.color = '#27ae60';
            } else {
                status.textContent = 'False alarm ❌';
                status.style.color = '#e67e22';
            }
        } else {
            if (heard) {
                status.textContent = 'Heard ✓';
                status.style.color = '#27ae60';
            } else {
                status.textContent = 'Not heard 🚫';
                status.style.color = '#7f8c8d';
            }
        }
        if (!this.isCatchTrial) this.updateLevel(heard);
        setTimeout(() => this.runTrial(), 300);
    }

    onNoResponse() {
        if (this.waitingForResponse) this.onResponse(false);
    }

    updateLevel(heard) {
        let newLevel;
        if (heard) {
            this.consecutiveHeard++;
            if (this.consecutiveHeard >= 2) {
                newLevel = this.currentLevel - this.stepSize;
                this.consecutiveHeard = 0;
                if (this.lastDirection === 'up') {
                    this.reversals.push(this.currentLevel);
                    if (this.reversals.length >= 1) this.stepSize = stepSizeSmall;
                }
                this.lastDirection = 'down';
            } else {
                return;
            }
        } else {
            newLevel = this.currentLevel + this.stepSize;
            this.consecutiveHeard = 0;
            if (this.lastDirection === 'down') {
                this.reversals.push(this.currentLevel);
                if (this.reversals.length >= 1) this.stepSize = stepSizeSmall;
            }
            this.lastDirection = 'up';
        }
        this.currentLevel = Math.max(-60, Math.min(0, newLevel));
    }

    completeTest() {
        const validResponses = this.responses.filter(r => !r.catchTrial);
        let threshold;
        if (this.reversals.length >= 2) {
            threshold = this.reversals.slice(-2).reduce((a, b) => a + b, 0) / 2;
        } else {
            const thresholdLevels = [];
            for (let i = 1; i < validResponses.length; i++) {
                if (validResponses[i].heard !== validResponses[i-1].heard) {
                    thresholdLevels.push(validResponses[i].level);
                }
            }
            threshold = thresholdLevels.length > 0 ? thresholdLevels.reduce((a, b) => a + b, 0) / thresholdLevels.length : 0;
        }
        onThresholdComplete(this.frequency, this.ear, threshold);
    }
}

// Analyze asymmetry
function analyzeAsymmetry() {
    let asymmetryDetected = false;
    let maxDifference = 0;
    const differences = {};
    testFrequencies.forEach(freq => {
        if (thresholds.left[freq] !== undefined && thresholds.right[freq] !== undefined) {
            const diff = Math.abs(thresholds.left[freq] - thresholds.right[freq]);
            differences[freq] = diff;
            maxDifference = Math.max(maxDifference, diff);
            if (diff >= 20) asymmetryDetected = true;
        }
    });
    const recommendation = asymmetryDetected ?
        `Asymmetry detected (max difference: ${maxDifference.toFixed(1)} dB). ⚠️\nConsult an audiologist for evaluation.\nThis is a demo, not a diagnosis.` :
        `No asymmetry detected (max: ${maxDifference.toFixed(1)} dB). ✅\nHearing seems balanced.\nThis is a demo result.`;
    return { asymmetryDetected, maxDifference, recommendation };
}

// Show results
async function showResultsScreen() {
    showScreen('results');
    const analysis = analyzeAsymmetry();
    document.getElementById('status-text').textContent = analysis.asymmetryDetected ? '⚠️ Asymmetry Detected' : '✅ No Asymmetry';
    document.getElementById('status-text').style.color = analysis.asymmetryDetected ? '#e74c3c' : '#27ae60';
    document.getElementById('recommendation').textContent = analysis.recommendation;

    // Compute averages
    const leftValues = Object.values(thresholds.left);
    const rightValues = Object.values(thresholds.right);
    const leftAvg = leftValues.reduce((a, b) => a + b, 0) / leftValues.length;
    const rightAvg = rightValues.reduce((a, b) => a + b, 0) / rightValues.length;
    const dissimilarity = analysis.maxDifference;

    // Send to backend
    await fetch('/save_results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            left_avg: leftAvg,
            right_avg: rightAvg,
            dissimilarity: dissimilarity
        })
    });

    // Create chart
    const ctx = document.getElementById('audiogram-chart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: testFrequencies,
            datasets: [{
                label: 'Left Ear 👂',
                data: testFrequencies.map(f => thresholds.left[f] || 0),
                borderColor: '#3498db',
                backgroundColor: '#3498db',
            }, {
                label: 'Right Ear 👂',
                data: testFrequencies.map(f => thresholds.right[f] || 0),
                borderColor: '#e74c3c',
                backgroundColor: '#e74c3c',
            }]
        },
        options: {
            scales: {
                x: { type: 'logarithmic', title: { display: true, text: 'Frequency (Hz)' } },
                y: { reverse: true, title: { display: true, text: 'Threshold (dB)' } }
            }
        }
    });
}

// Restart test
function restartTest() {
    thresholds.left = {};
    thresholds.right = {};
    currentTest = null;
    showScreen('welcome');
}

// Initial screen
showScreen('login');