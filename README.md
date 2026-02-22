# ⬡ SpatialFlow — Construction Logistics AI

SpatialFlow is an AI-powered construction site logistics tool that reads your site plan image and project schedule to recommend optimal temporary zone placements, worker paths, for each week of your project. It uses Claude (Anthropic) to analyse the real layout of your site and generate structured spatial decisions, not redesigns, but week-by-week temporary positioning of materials, equipment, and people. When a disruption hits in delivery or work , it instantly replans the entire schedule to eliminate idle days.

---

## What It Does

| Feature | Description |
|---------|-------------|
| **Zone Layout** | Recommends where to place temporary material staging zones, equipment, and storage based on your site plan and current week's activity |
| **Worker Paths** | Generates optimised temporary access routes with worker counts, distances, and hazard avoidance notes |
| **AI Query** | Answers freeform spatial questions about the current week crane positions, pre-staging, path conflicts |
| **Disruption Replanning** | Takes a disruption description and generates a revised full schedule with zero idle days, marking every week as ON_TRACK / MOVED / DELAYED / PARALLEL / NEW |

---

## Approach & Process

### The Problem

Construction sites lose significant time and money through poor spatial planning, materials staged too far from the work zone, worker paths cutting through active crane swings, deliveries arriving out of sequence. Most tools treat scheduling and spatial logistics as completely separate concerns. SpatialFlow treats them as one problem.

### Architecture

The app is a Flask backend + vanilla JS frontend. No framework, no build step. Three files do everything: `server.py`, `app.js`, `index.html`.

**Backend (`server.py`)**

All intelligence lives in four Flask endpoints. Each one constructs a precise prompt, calls Claude via the Anthropic SDK, and returns structured JSON. Claude is never asked to generate UI or explain itself but only to return valid JSON arrays or short text answers.

- `/parse-schedule` — Takes raw schedule text in any format and returns a structured JSON array of weeks with `activity` and `materials` fields. This powers the week slider in the UI.
- `/generate-layout` — The core endpoint. Sends the current week context, full schedule, and optionally the site plan image to Claude. Returns zone recommendations, worker paths, materials table and a key spatial insight. If an image is provided, Claude references actual structural features in its recommendations rather than generic directions.
- `/query` — Answers a freeform spatial question using the current week context, schedule excerpt. Returns bullet-pointed text under 200 words.
- `/replan` — Takes a disruption description and the original schedule. Returns a fully revised schedule with day impact metrics and per-week status codes.

**Frontend (`app.js`)**

The frontend is intentionally stateless, it holds only the uploaded image (base64), the CSV/schedule text, the parsed weeks array, and the current week number. Every action sends a payload to the server and renders the response. No local AI calls, no API keys in the browser.

Schedule text flows in two ways: typed or pasted directly into the textarea, or uploaded as a CSV/TXT file which is read as plain text and populated into the textarea. Both paths feed into `getScheduleText()` as a single source of truth for all server calls.

The week slider updates in real time from `parsedWeeks` — the structured array returned by `/parse-schedule`. If parsing hasn't completed yet, the slider falls back to raw line-by-line text from the schedule textarea.

### Key Design Decisions

- **Vision grounding** — When a floor plan image is provided, the layout prompt explicitly instructs Claude that it is reading a real site plan and must reference actual structural features. This dramatically improves the specificity of zone placement recommendations versus text-only prompts.
- **Temporary-only framing** — Every layout prompt tells Claude it is not redesigning the site but only recommending where to place temporary items this week. This prevents Claude from suggesting structural changes and keeps every recommendation immediately actionable.
- **Background schedule parsing** — `parseSchedule()` fires after `generateLayout()` starts (not awaited), so the week slider populates as soon as parsing completes without blocking the main layout call.

### Research Findings

- Claude with a site plan image produces significantly accurate zone placement. With an image it outputs things like "stage rebar adjacent to the north boundary wall, clear of the existing drainage channel."
- Telling Claude the current week number and materials needed *before* the full schedule produces better recommendations than burying that context inside a long schedule block. Prompt order matters.
- The `/parse-schedule` endpoint is robust across inconsistent formats — Claude handles bullet lists, numbered lists, CSV rows, and free-text paragraphs and always returns a clean JSON array.

---

## Project Structure

```
spatialflow/
├── server.py       # Flask backend — all Claude calls, 4 API routes
├── app.js          # Frontend logic — state, rendering, server calls
├── index.html      # UI structure — panels, tabs, inputs
├── styles.css      # All styling
├── .env            # API key (never commit this)
└── README.md
```

---

## Requirements

- Python 3.10+
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup & Run

### 1. Clone the repo

```bash
git clone https://github.com/your-username/spatialflow.git
cd spatialflow
```

### 2. Install dependencies

```bash
pip install flask flask-cors python-dotenv anthropic
```

### 3. Create your `.env` file

```bash
touch .env
```

Add your Anthropic key:

```
ANTHROPIC_API=sk-ant-...
```

### 4. Start the server

```bash
python server.py
```

### 5. Open the app

Open the index.html in browser.

---

## Usage

1. **Upload your site plan** — drag and drop or click to browse (PNG or JPG)
2. **Add your schedule** — upload a CSV/TXT file or paste it directly into the text box
   - Any format works: `Week 1: excavation, trades: civil, materials: fencing` or a CSV with columns
3. **Set the current week** using the slider
4. Click **Generate Layout Plan**
   - Zone recommendations appear in the **Zone Layout** tab
   - Worker paths populate the **Worker Paths** tab
5. **Ask a question** — type into the Ask SpatialFlow panel or use a preset, then click Optimize
6. **Report a disruption** — describe it, select the type, and click Generate Revised Schedule

---

## API Endpoints

| Method | Endpoint | Key Inputs | Output |
|--------|----------|------------|--------|
| POST | `/parse-schedule` | `schedule` (string) | `{ weeks: [...] }` |
| POST | `/generate-layout` | `week`, `weekContext`, `schedule`, `image?` | zones, paths, delivery, materials |
| POST | `/query` | `question`, `week`, `weekContext`, `schedule`, `image?` | `{ answer: string }` |
| POST | `/replan` | `disruption`, `delayType`, `week`, `schedule` | revised weeks with status codes |

---
