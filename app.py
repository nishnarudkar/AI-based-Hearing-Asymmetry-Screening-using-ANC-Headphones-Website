# app.py - Flask backend
import sqlite3
import numpy as np
from scipy.io.wavfile import write
from io import BytesIO
from flask import Flask, render_template, request, jsonify, send_file

app = Flask(__name__)

def init_db():
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        surname TEXT,
        age_group TEXT,
        gender TEXT,
        headphones_correct BOOLEAN,
        anc_mode TEXT,
        left_avg REAL,
        right_avg REAL,
        dissimilarity REAL
    )''')
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tone')
def generate_tone():
    freq = int(request.args.get('freq', 1000))
    duration = float(request.args.get('duration', 0.3))
    volume = float(request.args.get('volume', 1.0))
    channel = request.args.get('channel', 'both')

    sample_rate = 44100
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    note = np.sin(2 * np.pi * freq * t) * volume

    if channel == 'both':
        audio = np.column_stack((note, note))
    elif channel == 'left':
        silence = np.zeros_like(note)
        audio = np.column_stack((note, silence))
    else:  # right
        silence = np.zeros_like(note)
        audio = np.column_stack((silence, note))

    # Normalize to 16-bit range
    if np.max(np.abs(audio)) > 0:
        audio = audio / np.max(np.abs(audio)) * 32767 * 0.8
    audio = audio.astype(np.int16)

    bio = BytesIO()
    write(bio, sample_rate, audio)
    bio.seek(0)

    return send_file(
        BytesIO(bio.getvalue()),
        mimetype='audio/wav',
        as_attachment=False,
        download_name='tone.wav'
    )

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('''INSERT INTO users (
        name, surname, age_group, gender, headphones_correct, anc_mode
    ) VALUES (?, ?, ?, ?, ?, ?)''', (
        data['name'], data['surname'], data['age_group'], data['gender'],
        data['headphones_correct'], data['anc_mode']
    ))
    user_id = c.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'user_id': user_id})

@app.route('/save_results', methods=['POST'])
def save_results():
    data = request.json
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('''UPDATE users SET
        left_avg = ?, right_avg = ?, dissimilarity = ?
        WHERE id = ?''', (
        data['left_avg'], data['right_avg'], data['dissimilarity'], data['user_id']
    ))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True)