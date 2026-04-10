extends Node2D

var effect_color: Color  = Color(0.4, 0.8, 1.0, 0.8)
var max_radius: float    = 60.0
var _elapsed: float      = 0.0
const DURATION: float    = 0.30

func init(r: float, col: Color) -> void:
	max_radius   = r
	effect_color = col

func _process(delta: float) -> void:
	_elapsed += delta
	if _elapsed >= DURATION:
		queue_free()
		return
	modulate.a = 1.0 - (_elapsed / DURATION)
	queue_redraw()

func _draw() -> void:
	var t := _elapsed / DURATION
	var r := max_radius * t
	if r < 1.0: return
	draw_arc(Vector2.ZERO, r, 0, TAU, 36, effect_color, 2.5)
	draw_circle(Vector2.ZERO, r, Color(effect_color.r, effect_color.g, effect_color.b, 0.10))
