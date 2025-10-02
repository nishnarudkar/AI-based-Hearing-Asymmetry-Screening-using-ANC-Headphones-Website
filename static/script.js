// static/script.js
let currentScreen = 'login';
const testFrequencies = [4000, 2000, 1000, 500, 250]; // order used for plot
let userId = null;

// UI helpers
function showScreen(screenId) {
    document.querySelectorAll('#main-frame > div').forEach(div => div.classList.add('hidden'));
    document.getElementById(screenId + '-screen').classList.remove('hidden');
    currentScreen = screenId;
}

// Play a tone from the server and return a Promise that resolves after the sound finishes (duration param)
function playServerTone(params) {
    const url = new URL('/tone', window.location);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v.toString()));
    return new Promise((resolve) => {
        const audio = new Audio(url);
        // If the server returns proper WAV with right length, onended will fire
        audio.onended = () => resolve();
        // Fallback timeout in case onended doesn't fire (network/browser oddities)
        const fallbackMs = (parseFloat(params.duration || 0.35) * 1000) + 150;
        let fallback = setTimeout(() => {
            try { audio.pause(); } catch (e) {}
            resolve();
        }, fallbackMs);

        audio.play().then(() => {
            // If onended happens, resolve will be called; clear fallback
            audio.onended = () => { clearTimeout(fallback); resolve(); };
        }).catch(err => {
            // Autoplay or other error: still resolve after fallback
            clearTimeout(fallback);
            setTimeout(() => resolve(), fallbackMs);
        });
    });
}

async function playTestTone(freq, channel, levelDb) {
    // Map dB HL to amplitude relative to a 40 dB reference:
    // amplitude = 10^((levelDb - reference)/20); reference = 40 dB HL -> amplitude 1 at 40 dB HL
    const amplitude = Math.pow(10, (levelDb - 40) / 20);
    const duration = 0.35;
    await playServerTone({ freq: freq, duration: duration, volume: amplitude, channel: channel });
}

// Quick left/right channel test
function playChannelTest(channel) {
    const status = document.getElementById('channel-status');
    status.textContent = `Playing in ${channel.toUpperCase()} ear 🔊`;
    status.style.color = channel === 'left' ? '#3498db' : '#e74c3c';
    playServerTone({ freq: 1000, duration: 0.7, volume: 0.6, channel: channel })
        .then(() => setTimeout(() => status.textContent = '', 400));
}

// Event listeners and navigation
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('name').value,
        surname: document.getElementById('surname').value,
        age_group: document.querySelector('input[name="age_group"]:checked')?.value || null,
        gender: document.querySelector('input[name="gender"]:checked')?.value || null
    };
    const response = await fetch('/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
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
document.getElementById('play-tone-btn').addEventListener('click', () => playServerTone({ freq: 1000, duration: 1.0, volume: 1.0, channel: 'both' }));
document.getElementById('volume-set-btn').addEventListener('click', () => showScreen('instructions'));
document.getElementById('back-device-btn').addEventListener('click', () => showScreen('device-check'));
document.getElementById('start-test-btn').addEventListener('click', startHearingTest);
document.getElementById('back-calibration-btn').addEventListener('click', () => showScreen('calibration'));
document.getElementById('try-again-btn').addEventListener('click', restartTest);
document.getElementById('exit-btn').addEventListener('click', () => location.reload());

document.getElementById('yes-btn').addEventListener('click', () => submitResponse(true));
document.getElementById('no-btn').addEventListener('click', () => submitResponse(false));

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (confirm('Sure you want to exit?')) showScreen('welcome');
    } else if (event.key === ' ' && currentScreen === 'welcome') {
        showScreen('consent');
    }
});

// Start hearing test
async function startHearingTest() {
    showScreen('testing');
    const response = await fetch('/start_test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    });
    const data = await response.json();
    if (data.error) {
        alert(data.error);
        return;
    }
    await runTest(data);
}

async function runTest(testData) {
    document.getElementById('progress-bar').value = testData.progress;
    document.getElementById('progress-label').textContent = `${Math.round(testData.progress)}%`;
    document.getElementById('ear-label').textContent = `${testData.ear === 'left' ? '👂 Left Ear' : '👂 Right Ear'}`;
    document.getElementById('status-label').textContent = `Testing ${testData.freq} Hz`;
    document.getElementById('test-info').textContent = `Test ${testData.test_number}/${testData.total_tests} ⚡`;

    document.getElementById('response-status').textContent = 'Playing tone...';
    document.getElementById('yes-btn').disabled = true;
    document.getElementById('no-btn').disabled = true;

    await playTestTone(testData.freq, testData.ear, testData.level);

    document.getElementById('response-status').textContent =
        `Freq: ${testData.freq} Hz | Level: ${testData.level} dB HL — Did you hear it?`;
    document.getElementById('yes-btn').disabled = false;
    document.getElementById('no-btn').disabled = false;
}

async function submitResponse(heard) {
    document.getElementById('yes-btn').disabled = true;
    document.getElementById('no-btn').disabled = true;

    const response = await fetch('/submit_response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, heard: heard })
    });
    const result = await response.json();
    if (result.error) {
        alert(result.error);
        return;
    }

    const nextTest = await fetch(`/next_test?user_id=${userId}`);
    const testData = await nextTest.json();
    if (testData.error) {
        alert(testData.error);
        return;
    }

    if (testData.completed) {
        showResultsScreen(testData);
    } else {
        setTimeout(() => runTest(testData), 150);
    }
}

// Analysis + results UI
async function showResultsScreen(data) {
    showScreen('results');

    const thresholds = data.thresholds;
    const leftAvg = data.left_avg;
    const rightAvg = data.right_avg;
    const maxDiff = data.max_diff;

    const asymmetryDetected = maxDiff >= 20;
    document.getElementById('status-text').textContent = asymmetryDetected ? `⚠️ Asymmetry detected (max difference ${maxDiff.toFixed(1)} dB)` : `✅ No major asymmetry (max difference ${maxDiff.toFixed(1)} dB)`;
    document.getElementById('status-text').style.color = asymmetryDetected ? '#e74c3c' : '#27ae60';
    document.getElementById('recommendation').textContent = asymmetryDetected ? 'Recommendation: Consult an audiologist for follow-up.' : 'This is a demo — if you have concerns, consult a professional.';

    // Fill numeric results table
    const tbody = document.querySelector('#results-table tbody');
    tbody.innerHTML = '';
    testFrequencies.forEach(freq => {
        const left = thresholds.left[freq] !== undefined ? thresholds.left[freq] : '-';
        const right = thresholds.right[freq] !== undefined ? thresholds.right[freq] : '-';
        const diff = (left !== '-' && right !== '-') ? Math.abs(left - right).toFixed(1) : '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${freq}</td><td>${left}</td><td>${right}</td><td>${diff}</td>`;
        tbody.appendChild(tr);
    });

    // Plot audiogram with Chart.js
    const ctx = document.getElementById('audiogram-chart').getContext('2d');
    // Destroy existing chart if any (safe-guard)
    if (window.__audiogramChart) {
        window.__audiogramChart.destroy();
    }
    window.__audiogramChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: testFrequencies,
            datasets: [
                {
                    label: 'Left Ear',
                    data: testFrequencies.map(f => thresholds.left[f] !== undefined ? thresholds.left[f] : null),
                    borderColor: '#3498db',
                    backgroundColor: '#3498db',
                    spanGaps: true,
                    tension: 0.2,
                    pointRadius: 6
                },
                {
                    label: 'Right Ear',
                    data: testFrequencies.map(f => thresholds.right[f] !== undefined ? thresholds.right[f] : null),
                    borderColor: '#e74c3c',
                    backgroundColor: '#e74c3c',
                    spanGaps: true,
                    tension: 0.2,
                    pointRadius: 6
                }
            ]
        },
        options: {
            plugins: { legend: { position: 'top' } },
            scales: {
                x: {
                    type: 'logarithmic',
                    title: { display: true, text: 'Frequency (Hz)' },
                    ticks: {
                        callback: function(val, index, ticks) {
                            // label ticks with numeric frequencies
                            return Number(val).toFixed(0);
                        }
                    }
                },
                y: {
                    reverse: true,
                    title: { display: true, text: 'Threshold (dB HL)' },
                    min: -10,
                    max: 40
                }
            }
        }
    });

    // Save aggregated results to server
    await fetch('/save_results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            left_avg: leftAvg,
            right_avg: rightAvg,
            dissimilarity: Math.abs(leftAvg - rightAvg)
        })
    });
}

function restartTest() {
    userId = null;
    showScreen('login');
}

// Initial screen
showScreen('login');