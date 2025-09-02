# app.py - Flask backend
import sqlite3
from flask import Flask, render_template, request, jsonify

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
        noise_level INTEGER,
        ear_pain BOOLEAN,
        recent_cold BOOLEAN,
        hearing_history BOOLEAN,
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

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('''INSERT INTO users (
        name, surname, age_group, gender, headphones_correct, anc_mode, noise_level,
        ear_pain, recent_cold, hearing_history
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
        data['name'], data['surname'], data['age_group'], data['gender'],
        data['headphones_correct'], data['anc_mode'], data['noise_level'],
        data['ear_pain'], data['recent_cold'], data['hearing_history']
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