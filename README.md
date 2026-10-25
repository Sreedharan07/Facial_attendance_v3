# FaceID Attendance System v3 (Python 3.14 Compatible)

Uses **InsightFace + ONNX Runtime** — no TensorFlow, no dlib, no C++. Works on Python 3.14.

---

## Install

```bash
pip install flask insightface onnxruntime opencv-python numpy
```

---

## Setup & Run

1. Add face images to `known_faces/<Name>/1.jpg`
2. Run:

```bash
python app.py
```

3. Open: **http://127.0.0.1:5000**

First run downloads the InsightFace model automatically (~300MB, one time).

---

## Add Known Faces

```
known_faces/
  Arjun Mehta/
    1.jpg
  Priya Sharma/
    1.jpg
```

---

## Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Dashboard |
| `/video_feed` | GET | Live camera stream |
| `/start` | POST | Start recognition |
| `/stop` | POST | Stop recognition |
| `/attendance` | GET | Today's log |
| `/stats` | GET | Present/late counts |
| `/register` | POST | Register new face |
| `/rebuild` | POST | Rebuild embeddings |
| `/export` | GET | Download CSV |

---

## Tuning

- `THRESHOLD = 0.5` in app.py — increase to 0.6 for stricter matching
- Frame skip: every 5th frame — reduce to 3 for faster detection
