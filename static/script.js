// static/script.js
let currentScreen = 'login';
const testFrequencies = [4000, 2000, 1000, 500, 250];
const thresholds = { left: {}, right: {} };
let currentTest = null;
let testSequence = [];
let currentTestIndex = 0;
let totalTests = 0;
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
async function playServerTone(params) {
    const url = new URL('/tone', window.location);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v.toString()));
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
}

async function playChannelTest(channel) {
    const status = document.getElementById('channel-status');
    status.textContent = `Playing in ${channel.toUpperCase()} ear 🔊`;
    status.style.color = channel === 'left' ? '#3498db' : '#e74c3c';
    await playServerTone({freq: 1000, duration: 0.7, volume: 0.5, channel: channel});
    setTimeout(() => status.textContent = '', 1000);
}

async function playReferenceTone() {
    await playServerTone({freq: 1000, duration: 1.0, volume: 1.0, channel: 'both'});
}

async function playTestTone(freq, channel, levelDb) {
    const amplitude = Math.pow(10, levelDb / 20);
    await playServerTone({freq: freq, duration: 0.3, volume: amplitude, channel: channel});
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
        anc_mode: document.querySelector('input[name="anc_mode"]:checked')?.value || null
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
document.getElementById('play-tone-btn').addEventListener('click', playReferenceTone);
document.getElementById('volume-set-btn').addEventListener('click', () => showScreen('instructions'));
document.getElementById('back-device-btn').addEventListener('click', () => showScreen('device-check'));
document.getElementById('start-test-btn').addEventListener('click', startHearingTest);
document.getElementById('back-calibration-btn').addEventListener('click', () => showScreen('calibration'));
document.getElementById('try-again-btn').addEventListener('click', restartTest);
document.getElementById('exit-btn').addEventListener('click', () => location.reload());

document.getElementById('yes-btn').addEventListener('click', () => {
    if (currentTest) {
        currentTest.onResponse(true);
    }
});

document.getElementById('no-btn').addEventListener('click', () => {
    if (currentTest) {
        currentTest.onResponse(false);
    }
});

// Keyboard events
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
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
    currentTestIndex = 0;
    totalTests = testSequence.length;
    runNextThresholdTest();
}

function runNextThresholdTest() {
    if (currentTestIndex >= totalTests) {
        showResultsScreen();
        return;
    }
    const {freq, ear} = testSequence[currentTestIndex];
    document.getElementById('response-status').textContent = 'Listen carefully... 👂';
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
    runNextThresholdTest(); // proceed immediately to next AFTER response
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
        this.lastDirection = null;
        this.catchTrialProbability = 0.03;
        this.isCatchTrial = false;
        this.waitingForResponse = false;
        this.retryAttempts = 0;
    }

    start() {
        this.runTrial();
    }

    runTrial() {
        if (this.trialCount >= this.maxTrials) {
            this.completeTest();
            return;
        }
        this.trialCount++;
        this.isCatchTrial = Math.random() < this.catchTrialProbability;
        document.getElementById('response-status').textContent = 'Listen carefully... 👂';
        document.getElementById('yes-btn').disabled = true;
        document.getElementById('no-btn').disabled = true;
        this.presentStimulus();
    }

    async presentStimulus() {
        this.waitingForResponse = true;
        if (!this.isCatchTrial) {
            await playTestTone(this.frequency, this.ear, this.currentLevel);
        }
        document.getElementById('response-status').textContent = 'Click YES or NO';
        document.getElementById('yes-btn').disabled = false;
        document.getElementById('no-btn').disabled = false;
    }

    onResponse(heard) {
        if (!this.waitingForResponse) return;
        this.waitingForResponse = false;
        document.getElementById('yes-btn').disabled = true;
        document.getElementById('no-btn').disabled = true;

        const correctResponse = !this.isCatchTrial;
        this.responses.push({
            level: this.currentLevel,
            heard,
            catchTrial: this.isCatchTrial,
            correct: heard === correctResponse
        });

        const status = document.getElementById('response-status');

        if (this.isCatchTrial) {
            status.textContent = heard ? 'False alarm ❌' : 'Good! (No tone) 👍';
            status.style.color = heard ? '#e67e22' : '#27ae60';
            this.runTrial(); // next trial only after user clicked
            return;
        } else {
            if (heard) {
                status.textContent = 'Heard ✓';
                status.style.color = '#27ae60';
                onThresholdComplete(this.frequency, this.ear, this.currentLevel);
                return;
            } else {
                status.textContent = 'Not heard 🚫';
                status.style.color = '#7f8c8d';
            }
        }

        this.retryAttempts++;
        if (this.retryAttempts < 3) {
            status.textContent = `Retry ${this.retryAttempts}/2 - Listen carefully...`;
            status.style.color = '#f39c12';
            this.presentStimulus();
        } else {
            status.textContent = 'Not heard after retries 🚫';
            status.style.color = '#7f8c8d';
            this.updateLevel(false);
            this.runTrial();
        }
    }

    updateLevel(heard) {
        let newLevel;
        if (heard) {
            newLevel = this.currentLevel - this.stepSize;
            if (this.lastDirection === 'up') {
                this.reversals.push(this.currentLevel);
                if (this.reversals.length >= 1) this.stepSize = stepSizeSmall;
            }
            this.lastDirection = 'down';
        } else {
            newLevel = this.currentLevel + this.stepSize;
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
        `Asymmetry detected (max difference: ${maxDifference.toFixed(1)} dB). ⚠️\nConsult an audiologist.` :
        `No asymmetry detected (max: ${maxDifference.toFixed(1)} dB). ✅\nThis is a demo result.`;
    return { asymmetryDetected, maxDifference, recommendation };
}

// Show results
async function showResultsScreen() {
    showScreen('results');
    const analysis = analyzeAsymmetry();
    document.getElementById('status-text').textContent = analysis.asymmetryDetected ? '⚠️ Asymmetry Detected' : '✅ No Asymmetry';
    document.getElementById('status-text').style.color = analysis.asymmetryDetected ? '#e74c3c' : '#27ae60';
    document.getElementById('recommendation').textContent = analysis.recommendation;

    const leftValues = Object.values(thresholds.left);
    const rightValues = Object.values(thresholds.right);
    const leftAvg = leftValues.length > 0 ? leftValues.reduce((a, b) => a + b, 0) / leftValues.length : 0;
    const rightAvg = rightValues.length > 0 ? rightValues.reduce((a, b) => a + b, 0) / rightValues.length : 0;
    const dissimilarity = analysis.maxDifference;

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
