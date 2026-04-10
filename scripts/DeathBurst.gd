extends Node2D

var _color: Color    = Color(0.85, 0.18, 0.18)
var _elapsed: float  = 0.0
var _particles: Array = []
const DURATION: float = 0.45
const COUNT: int      = 8

func init(col: Color, is_boss: bool) -> void:
	_color = col
	var speed_mult: float = 2.2 if is_boss else 1.0
	var size_mult:  float = 1.8 if is_boss else 1.0
	for i in COUNT:
		var angle  := (TAU / COUNT) * i + randf_range(-0.3, 0.3)
		var speed  := randf_range(38.0, 90.0) * speed_mult
		_particles.append({
			vel   = Vector2(cos(angle), sin(angle)) * speed,
			size  = randf_range(3.0, 7.0) * size_mult,
			phase = randf_range(0.0, 0.2),
		})

func _process(delta: float) -> void:
	_elapsed += delta
	if _elapsed >= DURATION:
		queue_free()
		return
	for p in _particles:
		p.vel *= 0.88
	modulate.a = 1.0 - (_elapsed / DURATION)
	queue_redraw()

func _draw() -> void:
	var t := _elapsed / DURATION
	for p in _particles:
		if _elapsed < p.phase: continue
		var age   := (_elapsed - p.phase) / DURATION
		var dist  := p.vel.length() * age * DURATION * 0.5
		var dir   := p.vel.normalized()
		var pos   := dir * dist * 60.0 * (1.0 - age)
		var sz    := p.size * (1.0 - age * 0.5)
		draw_circle(pos, sz, _color)
