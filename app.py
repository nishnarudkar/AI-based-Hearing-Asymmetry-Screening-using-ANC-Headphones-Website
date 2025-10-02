# app.py - Flask backend
import sqlite3
import numpy as np
from scipy.io.wavfile import write
from io import BytesIO
from flask import Flask, render_template, request, jsonify, Response
import json

app = Flask(__name__)

def init_db():
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    
    # Create users table if it doesn't exist
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        surname TEXT,
        age_group TEXT,
        gender TEXT,
        left_avg REAL,
        right_avg REAL,
        dissimilarity REAL
    )''')
    
    # Check if test_state column exists and add it if not
    c.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in c.fetchall()]
    if 'test_state' not in columns:
        c.execute('ALTER TABLE users ADD COLUMN test_state TEXT')
    
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tone')
def generate_tone():
    """
    Generate a stereo WAV tone at the requested freq/duration/volume and return bytes.
    volume should be in the range 0..1 (we clamp to avoid clipping).
    channel: 'both', 'left', 'right'
    """
    try:
        freq = int(request.args.get('freq', 1000))
        duration = float(request.args.get('duration', 0.35))
        volume = float(request.args.get('volume', 1.0))
        channel = request.args.get('channel', 'both')
    except Exception:
        return ("Bad parameters", 400)

    sample_rate = 44100
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    # raw sine
    note = np.sin(2 * np.pi * freq * t) * volume

    if channel == 'both':
        audio = np.column_stack((note, note))
    elif channel == 'left':
        audio = np.column_stack((note, np.zeros_like(note)))
    else:  # 'right'
        audio = np.column_stack((np.zeros_like(note), note))

    # Prevent clipping: clamp to -1..1
    max_val = np.max(np.abs(audio))
    if max_val > 1.0:
        audio = audio / max_val

    # convert to 16-bit PCM
    audio_int16 = (audio * 32767 * 0.8).astype(np.int16)

    bio = BytesIO()
    write(bio, sample_rate, audio_int16)
    bio.seek(0)
    wav_bytes = bio.getvalue()
    return Response(wav_bytes, mimetype='audio/wav')

@app.route('/register', methods=['POST'])
def register():
    data = request.json or {}
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('''INSERT INTO users (
        name, surname, age_group, gender, test_state
    ) VALUES (?, ?, ?, ?, ?)''', (
        data.get('name'), data.get('surname'), data.get('age_group'), data.get('gender'), json.dumps({})
    ))
    user_id = c.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'user_id': user_id})

@app.route('/start_test', methods=['POST'])
def start_test():
    data = request.json or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400

    test_frequencies = [4000, 2000, 1000, 500, 250]
    test_sequence = []
    for freq in test_frequencies:
        for ear in ['left', 'right']:
            test_sequence.append({'freq': freq, 'ear': ear})

    test_state = {
        'thresholds': {'left': {}, 'right': {}},
        'test_sequence': test_sequence,
        'current_test_index': 0,
        'total_tests': len(test_sequence),
        'current_test': {
            'frequency': test_sequence[0]['freq'],
            'ear': test_sequence[0]['ear'],
            'current_level': 40,
            'responses': [],
            'trial_count': 0,
            'max_trials': 12
        }
    }

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('UPDATE users SET test_state = ? WHERE id = ?', (json.dumps(test_state), user_id))
    conn.commit()
    conn.close()

    return jsonify({
        'freq': test_state['current_test']['frequency'],
        'ear': test_state['current_test']['ear'],
        'level': test_state['current_test']['current_level'],
        'progress': 0,
        'test_number': 1,
        'total_tests': test_state['total_tests']
    })

@app.route('/next_test', methods=['GET'])
def next_test():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT test_state FROM users WHERE id = ?', (user_id,))
    result = c.fetchone()
    if not result:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    test_state = json.loads(result[0])
    current_test_index = test_state['current_test_index']
    total_tests = test_state['total_tests']

    if current_test_index >= total_tests:
        # Compute results and save
        left_values = list(test_state['thresholds']['left'].values())
        right_values = list(test_state['thresholds']['right'].values())
        left_avg = sum(left_values) / len(left_values) if left_values else 0
        right_avg = sum(right_values) / len(right_values) if right_values else 0
        max_diff = 0
        for freq in test_state['test_sequence']:
            freq_val = freq['freq']
            if freq_val in test_state['thresholds']['left'] and freq_val in test_state['thresholds']['right']:
                diff = abs(test_state['thresholds']['left'][freq_val] - test_state['thresholds']['right'][freq_val])
                max_diff = max(max_diff, diff)

        c.execute('UPDATE users SET left_avg = ?, right_avg = ?, dissimilarity = ? WHERE id = ?',
                  (left_avg, right_avg, abs(left_avg - right_avg), user_id))
        conn.commit()
        conn.close()

        return jsonify({
            'completed': True,
            'thresholds': test_state['thresholds'],
            'left_avg': left_avg,
            'right_avg': right_avg,
            'max_diff': max_diff
        })

    current_test = test_state['current_test']
    progress = (current_test_index / total_tests) * 100

    conn.close()
    return jsonify({
        'freq': current_test['frequency'],
        'ear': current_test['ear'],
        'level': current_test['current_level'],
        'progress': progress,
        'test_number': current_test_index + 1,
        'total_tests': total_tests
    })

@app.route('/submit_response', methods=['POST'])
def submit_response():
    data = request.json or {}
    user_id = data.get('user_id')
    heard = data.get('heard')
    if not user_id or heard is None:
        return jsonify({'error': 'User ID and response required'}), 400

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT test_state FROM users WHERE id = ?', (user_id,))
    result = c.fetchone()
    if not result:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    test_state = json.loads(result[0])
    current_test = test_state['current_test']
    current_test['responses'].append({'level': current_test['current_level'], 'heard': heard})
    current_test['trial_count'] += 1
    old_level = current_test['current_level']

    if heard:
        current_test['current_level'] = max(-10, current_test['current_level'] - 10)
    else:
        current_test['current_level'] = min(40, current_test['current_level'] + 5)

    if heard and current_test['current_level'] == old_level:
        # Heard at minimum level, complete this test
        threshold = compute_threshold(current_test['responses'])
        test_state['thresholds'][current_test['ear']][current_test['frequency']] = threshold
        test_state['current_test_index'] += 1

        if test_state['current_test_index'] < test_state['total_tests']:
            next_test_data = test_state['test_sequence'][test_state['current_test_index']]
            test_state['current_test'] = {
                'frequency': next_test_data['freq'],
                'ear': next_test_data['ear'],
                'current_level': 40,
                'responses': [],
                'trial_count': 0,
                'max_trials': 12
            }
    elif current_test['trial_count'] >= current_test['max_trials']:
        # Max trials reached, complete this test
        threshold = compute_threshold(current_test['responses'])
        test_state['thresholds'][current_test['ear']][current_test['frequency']] = threshold
        test_state['current_test_index'] += 1

        if test_state['current_test_index'] < test_state['total_tests']:
            next_test_data = test_state['test_sequence'][test_state['current_test_index']]
            test_state['current_test'] = {
                'frequency': next_test_data['freq'],
                'ear': next_test_data['ear'],
                'current_level': 40,
                'responses': [],
                'trial_count': 0,
                'max_trials': 12
            }
    else:
        # Continue with next trial
        pass

    c.execute('UPDATE users SET test_state = ? WHERE id = ?', (json.dumps(test_state), user_id))
    conn.commit()
    conn.close()

    return jsonify({'success': True})

def compute_threshold(responses):
    # Aggregate responses by level
    map = {}
    for r in responses:
        level = r['level']
        if level not in map:
            map[level] = {'yes': 0, 'total': 0}
        map[level]['total'] += 1
        if r['heard']:
            map[level]['yes'] += 1

    # Find the softest level (lowest dB) where >=50% heard
    levels = sorted([float(l) for l in map.keys()])
    threshold = levels[-1] if levels else 40  # Fallback to highest level or initial level

    candidate_levels = [l for l in levels if (map[l]['yes'] / map[l]['total']) >= 0.5]
    if candidate_levels:
        threshold = min(candidate_levels)
    else:
        heard_levels = [l for l in levels if map[l]['yes'] > 0]
        if heard_levels:
            threshold = min(heard_levels)

    return threshold

@app.route('/save_results', methods=['POST'])
def save_results():
    data = request.json or {}
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('''UPDATE users SET
        left_avg = ?, right_avg = ?, dissimilarity = ?
        WHERE id = ?''', (
        data.get('left_avg'), data.get('right_avg'), data.get('dissimilarity'), data.get('user_id')
    ))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/audiogram', methods=['GET'])
def get_audiogram():
    user_id = request.args.get('user_id')
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT left_avg, right_avg, dissimilarity FROM users WHERE id = ?', (user_id,))
    result = c.fetchone()
    conn.close()
    if result:
        return jsonify({
            'left_avg': result[0],
            'right_avg': result[1],
            'dissimilarity': result[2]
        })
    return jsonify({'error': 'User not found'}), 404

if __name__ == '__main__':
    app.run(debug=True)