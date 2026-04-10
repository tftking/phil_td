extends Node

# ---------------------------------------------------------------------------
# GeminiWave autoload
# Calls Gemini 2.0 Flash to generate wave data as JSON.
# Falls back to procedural generation if API fails.
# Set your API key via Project > Project Settings > Globals or export var below.
# ---------------------------------------------------------------------------

@export var api_key: String = ""
var use_gemini: bool = false  # toggled from start screen

const API_URL: String = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

signal wave_ready(wave_data: Array)

var _http: HTTPRequest
var _fallback_callback: Callable
var _wave_num: int = 0
var _diff_hp: float  = 1.0
var _diff_spd: float = 1.0
var _diff_rew: float = 1.0

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.timeout = 6.0
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)

func generate(wave_num: int, fallback_fn: Callable) -> void:
	_wave_num          = wave_num
	_fallback_callback = fallback_fn
	var d              = GameManager.diff()
	_diff_hp           = d.hp
	_diff_spd          = d.spd
	_diff_rew          = d.reward

	if not use_gemini or api_key.is_empty():
		_emit_fallback()
		return

	var prompt := _build_prompt(wave_num)
	var body := JSON.stringify({
		"contents": [{"parts": [{"text": prompt}]}],
		"generationConfig": {"temperature": 0.9, "maxOutputTokens": 512}
	})
	var headers := [
		"Content-Type: application/json",
		"x-goog-api-key: " + api_key
	]
	var err := _http.request(API_URL, headers, HTTPClient.METHOD_POST, body)
	if err != OK:
		_emit_fallback()

func _build_prompt(wave_num: int) -> String:
	return """You are a tower defense wave designer.
Generate wave %d for a poker tower defense game.
Return ONLY a JSON array. No markdown, no explanation.
Each element is an enemy object with these fields:
  delay  (float, seconds between spawns, 0.2-1.5)
  health (int,   scaled to wave difficulty)
  speed  (float, pixels/second, 45-180)
  reward (int,   gold on death)
  color  (string, one of: "red" "orange" "blue" "purple" "green")
  is_boss (bool, only true for at most 1 enemy per wave, only on multiples of 5)

Guidelines:
- Wave %d should feel appropriately harder than earlier waves
- Total enemies: %d
- Mix enemy types for variety. Fast low-HP runners, slow tanks, normal troops.
- boss only on wave multiples of 5

Return only valid JSON. Example: [{"delay":0.8,"health":200,"speed":65,"reward":12,"color":"red","is_boss":false}]""" % [
		wave_num, wave_num,
		5 + wave_num * 2
	]

func _on_request_completed(_result: int, response_code: int,
		_headers: PackedStringArray, body: PackedByteArray) -> void:
	if response_code != 200:
		push_warning("GeminiWave: HTTP %d, using fallback" % response_code)
		_emit_fallback()
		return

	var json_str := body.get_string_from_utf8()
	var parsed   := JSON.parse_string(json_str)
	if parsed == null:
		_emit_fallback()
		return

	# Extract text from Gemini response envelope
	var text: String = ""
	var content = parsed.get("candidates", [])
	if content.size() > 0:
		text = content[0].get("content", {}).get("parts", [{}])[0].get("text", "")

	# Strip markdown fences if present
	text = text.strip_edges()
	if text.begins_with("```"):
		var lines := text.split("\n")
		var clean_lines: Array = []
		for ln in lines:
			if not ln.begins_with("```"):
				clean_lines.append(ln)
		text = "\n".join(clean_lines)

	var wave_json = JSON.parse_string(text)
	if wave_json == null or not wave_json is Array:
		push_warning("GeminiWave: bad JSON from API, using fallback\n" + text)
		_emit_fallback()
		return

	var wave_data: Array = []
	for entry in wave_json:
		if not entry is Dictionary: continue
		var col := _parse_color(entry.get("color", "red"))
		wave_data.append({
			delay   = float(entry.get("delay",  0.8)),
			health  = int(float(entry.get("health", 100)) * _diff_hp),
			speed   = float(entry.get("speed",  65.0)) * _diff_spd,
			reward  = int(float(entry.get("reward", 10)) * _diff_rew),
			color   = col,
			is_boss = bool(entry.get("is_boss", false))
		})

	if wave_data.is_empty():
		_emit_fallback()
		return

	wave_ready.emit(wave_data)

func _emit_fallback() -> void:
	var data: Array = _fallback_callback.call(_wave_num)
	wave_ready.emit(data)

func _parse_color(s: String) -> Color:
	match s:
		"orange":  return Color(1.0, 0.55, 0.08)
		"blue":    return Color(0.45, 0.50, 0.80)
		"purple":  return Color(0.75, 0.08, 0.85)
		"green":   return Color(0.15, 0.72, 0.20)
		_:         return Color(0.85, 0.18, 0.18)  # red default
