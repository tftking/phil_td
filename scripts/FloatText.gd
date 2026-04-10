extends Node2D

var _text: String     = ""
var _color: Color     = Color.WHITE
var _elapsed: float   = 0.0
var _font_size: int   = 16
const DURATION: float = 0.85
const RISE: float     = 48.0

func init(text: String, col: Color = Color.WHITE, size: int = 16) -> void:
	_text      = text
	_color     = col
	_font_size = size

func _process(delta: float) -> void:
	_elapsed += delta
	position.y -= RISE * delta
	modulate.a  = 1.0 - (_elapsed / DURATION)
	queue_redraw()
	if _elapsed >= DURATION:
		queue_free()

func _draw() -> void:
	var f  := ThemeDB.fallback_font
	var sw := f.get_string_size(_text, HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size).x
	# Shadow
	draw_string(f, Vector2(-sw * 0.5 + 1, 1), _text,
		HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size, Color(0, 0, 0, 0.6))
	# Text
	draw_string(f, Vector2(-sw * 0.5, 0), _text,
		HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size, _color)
