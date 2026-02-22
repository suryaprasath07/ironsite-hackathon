import json
import io
import csv
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import anthropic
import os

load_dotenv()

ANTHROPIC_API = os.getenv("ANTHROPIC_API")

app = Flask(__name__, static_folder=".")
CORS(app)

ANTHROPIC_MODEL = "claude-opus-4-20250514"


def anthropic_client():
    return anthropic.Anthropic(api_key=ANTHROPIC_API)


def build_user_content(text: str, image: dict | None) -> list:
    content = []
    if image and image.get("data"):
        media_type = image.get("type", "image/png")
        if not media_type.startswith("image/"):
            media_type = "image/png"
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": image["data"],
            },
        })
    content.append({"type": "text", "text": text})
    return content


def claude_json(system: str, user_content: list, max_tokens: int = 1600) -> dict:
    client   = anthropic_client()
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    raw   = response.content[0].text
    clean = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(clean)


def claude_text(system: str, user_content: list, max_tokens: int = 600) -> str:
    client   = anthropic_client()
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text


# ── /parse-schedule ───────────────────────────────────────────────────────────
@app.route("/parse-schedule", methods=["POST"])
def parse_schedule():
    body     = request.json
    schedule = body.get("schedule", "")

    prompt = (
        "Parse this construction schedule into a JSON array. "
        'Each element: {"week":N,"activity":"...","trades":"...","materials":"..."}\n\n'
        f"Schedule:\n{schedule}\n\nRespond ONLY with valid JSON array."
    )

    try:
        weeks = claude_json(
            system="Respond only with valid JSON array. No markdown, no explanation.",
            user_content=[{"type": "text", "text": prompt}],
            max_tokens=800,
        )
        return jsonify({"weeks": weeks})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── helpers ───────────────────────────────────────────────────────────────────



# ── /generate-layout ─────────────────────────────────────────────────────────
@app.route("/generate-layout", methods=["POST"])
def generate_layout():
    body     = request.json
    week     = body.get("week", 1)
    week_ctx = body.get("weekContext", {})
    schedule = body.get("schedule", "")
    image    = body.get("image")

    has_image = bool(image and image.get("data"))
    sched_ctx = f"\n\nFULL PROJECT SCHEDULE:\n{schedule}" if schedule else ""

    prompt = f"""You are SpatialFlow, a construction site spatial logistics AI.

CURRENT WEEK: {week}
WEEK ACTIVITY: {week_ctx.get("activity", "Construction work")}
TRADES ON SITE: {week_ctx.get("trades", "Various trades")}
MATERIALS NEEDED: {week_ctx.get("materials", "Standard materials")}
{sched_ctx}

{"I have provided the actual site plan image. Analyse the real layout — identify existing structures, boundaries, entry/exit points, and fixed elements. Your recommendations must be for TEMPORARY positioning on top of this actual plan." if has_image else "No site plan image provided — base recommendations on standard construction site logistics."}

IMPORTANT: You are NOT redesigning the site. You are recommending where to place TEMPORARY items this week:
- Temporary material staging zones
- Temporary worker access paths
- Equipment positioning
- Delivery routes

Generate a JSON response (ONLY JSON, no markdown):
{{
  "siteObservations": "2-3 sentences about what you see in the site plan and key spatial constraints",
  "materialZones": [
    {{
      "name": "Zone name",
      "type": "material|equipment|storage|delivery",
      "location": "Specific location description referencing actual site features",
      "contents": "What goes here this week",
      "reason": "Why this location is optimal",
      "tempDuration": "e.g. This week only / Weeks 3-5"
    }}
  ],
  "workerPaths": [
    {{
      "label": "PATH A",
      "name": "Descriptive name",
      "nodes": ["Entry point", "Via landmark", "Work zone"],
      "workers": 12,
      "distanceFt": 150,
      "avoids": "What hazard or conflict this path avoids"
    }}
  ],
  "deliverySequence": [
    {{
      "order": 1,
      "material": "Material name",
      "volume": "Quantity",
      "stagingZone": "Where it goes",
      "day": "Mon AM",
      "note": "Logistics note"
    }}
  ],
  "materialsTable": [
    {{"material": "Name", "volume": "High|Med|Low", "zone": "Staging zone name"}}
  ],
  "optimizationNote": "Key spatial insight — what the biggest efficiency gain is this week"
}}"""

    try:
        data = claude_json(
            system="You are SpatialFlow. Respond ONLY with valid JSON. No markdown, no explanation.",
            user_content=build_user_content(prompt, image),
            max_tokens=1800,
        )

        return jsonify(data)

    except json.JSONDecodeError as e:
        return jsonify({"error": f"Claude returned invalid JSON: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── /query ────────────────────────────────────────────────────────────────────
@app.route("/query", methods=["POST"])
def query():
    body     = request.json
    question = body.get("question", "")
    week     = body.get("week", 1)
    week_ctx = body.get("weekContext", {})
    schedule = body.get("schedule", "")
    image    = body.get("image")

    prompt = f"""Week {week}: {week_ctx.get("activity", "Construction")} | Trades: {week_ctx.get("trades", "various")} | Materials: {week_ctx.get("materials", "standard")}
Schedule excerpt:
{schedule}

Question: "{question}"

Answer with specific, actionable spatial logistics recommendations for the TEMPORARY positioning of materials, paths, or equipment. Use ▸ bullets. Start with a CAPS headline. Under 200 words."""

    try:
        answer = claude_text(
            system="You are SpatialFlow, a construction logistics AI. Precise, actionable answers. ▸ bullets. Temp zone recommendations only.",
            user_content=build_user_content(prompt, image),
            max_tokens=600,
        )
        return jsonify({"answer": answer})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── /replan ───────────────────────────────────────────────────────────────────
@app.route("/replan", methods=["POST"])
def replan():
    body       = request.json
    disruption = body.get("disruption", "")
    delay_type = body.get("delayType", "other")
    week       = body.get("week", 1)
    schedule   = body.get("schedule", "")

    prompt = f"""You are SpatialFlow, a construction logistics AI.

DISRUPTION TYPE: {delay_type.upper()}
DISRUPTION: {disruption}
CURRENT WEEK: {week}

ORIGINAL SCHEDULE:
{schedule}

Generate a REVISED SCHEDULE that ensures ZERO idle days. Pull forward any work that can run in parallel. Reorder dependencies. Use buffer time productively.

Respond ONLY with valid JSON (no markdown):
{{
  "summary": "One sentence: what changed and how many days recovered",
  "daysLost": 5,
  "daysRecovered": 3,
  "netImpact": 2,
  "weeks": [
    {{
      "week": 1,
      "activity": "Activity name",
      "trades": "Trades on site",
      "materials": "Key materials",
      "status": "ON_TRACK|MOVED|DELAYED|PARALLEL|NEW",
      "change": "What changed vs original (empty string if unchanged)",
      "note": "Brief logistics note"
    }}
  ]
}}

Status codes:
- ON_TRACK: unchanged from original
- MOVED: rescheduled to a different week
- DELAYED: pushed back due to disruption
- PARALLEL: new parallel work added to recover time
- NEW: buffer task added"""

    try:
        data = claude_json(
            system="Respond ONLY with valid JSON. No markdown, no explanation.",
            user_content=[{"type": "text", "text": prompt}],
            max_tokens=2200,
        )
        return jsonify(data)
    except json.JSONDecodeError as e:
        return jsonify({"error": f"Claude returned invalid JSON: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Static files ─────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print("  SpatialFlow — Local AI Server")
    print("  Keys loaded from .env (ANTHROPIC_API)")
    print("=" * 55)
    print(f"  ANTHROPIC_API: {'set' if ANTHROPIC_API else 'MISSING'}")
    print("=" * 55)
    print("  Open: http://localhost:8765")
    print("  Ctrl+C to stop")
    print("=" * 55)
    app.run(host="0.0.0.0", port=8765, debug=False)