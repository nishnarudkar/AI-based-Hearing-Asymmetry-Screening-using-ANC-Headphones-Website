# AuroHear: Web-Based Hearing Asymmetry Screening Tool

**AuroHear** is a full-stack web application designed to perform a rapid, browser-based hearing screening to identify potential hearing asymmetry.

It guides a user through a pure-tone audiometry test, dynamically generates the audio tones, and provides an immediate, visualized report of their hearing thresholds.

*(You should add a GIF here of the application in use, from the welcome screen to the results chart. It's the best way to show recruiters what you built.)*

-----

## 🚀 Key Features

  * **Full-Stack Application:** Built with a Python **Flask** backend serving a dynamic HTML/CSS/JavaScript frontend.
  * **Algorithmic Test Procedure:** Implements a modified Hughson-Westlake audiometry algorithm directly in the backend to find the user's hearing threshold. The test level adapts based on user responses (down 10 dB if heard, up 5 dB if not heard).
  * **Dynamic Tone Generation:** A backend route (`/tone`) uses **Numpy** and **Scipy** to generate pure-tone sine wave audio on the fly. This allows for precise control over frequency, duration, volume, and stereo channel (left/right) for the test.
  * **Interactive UI:** A single-page application (SPA) experience built with vanilla JavaScript that guides the user through registration, consent, calibration, and the test itself.
  * **Data Persistence:** Uses a **Flask-SQLAlchemy** database to register users and save their demographic information and final test results, including averages and maximum dissimilarity.
  * **Data Visualization:** Automatically generates an interactive audiogram chart using **Chart.js** to visualize the user's left and right ear thresholds across all tested frequencies.
  * **Client-Side Report Generation:** Users can download their results as a PNG or PDF report, which is generated in the browser using **jsPDF** and the HTML canvas data.
  * **Deployment Ready:** Includes a `Procfile` for `gunicorn`, making it ready for deployment on platforms like Heroku or Render.

-----

## 🛠️ Technology Stack

| Area | Technology |
| :--- | :--- |
| **Backend** | Python, Flask, Flask-SQLAlchemy |
| **Data Science** | Numpy, Scipy (for audio generation) |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| **Data Viz** | Chart.js |
| **Database** | SQLite (default), PostgreSQL (production-ready) |
| **Deployment** | Gunicorn |

-----

## 🔧 How to Run Locally

### Prerequisites

  * Python 3.7+
  * `pip` (Python package installer)
  * A virtual environment tool (like `venv`)

### Installation & Setup

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/nishnarudkar/AuroHear--Web-Based-Hearing-Asymmetry-Screening-Tool.git
    cd AuroHear--Web-Based-Hearing-Asymmetry-Screening-Tool
    ```

2.  **Create and activate a virtual environment:**

    ```sh
    # For macOS/Linux
    python3 -m venv venv
    source venv/bin/activate

    # For Windows
    python -m venv venv
    .\venv\Scripts\activate
    ```

3.  **Install the required Python packages:**

    ```sh
    pip install -r requirements.txt
    ```

4.  **Create the local database:**
    This project uses a local SQLite database by default. Run the following Flask command to create the `users.db` file and set up the tables.

    ```sh
    flask create-db
    ```

    *You should see a message: "Database tables created successfully."*

5.  **Run the application:**

    ```sh
    flask run
    ```

    The application will be available at `http://127.0.0.1:5000` in your web browser.

-----

## ⚠️ Disclaimer

This project is an educational tool and a technical demonstration. **It is not a medical device and does not provide a medical diagnosis.** The results are for informational purposes only. Please consult a qualified audiologist or medical professional for any hearing concerns.
