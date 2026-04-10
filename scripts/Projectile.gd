extends Node2D

var target: Node2D
var damage: int            = 0
var move_speed: float      = 220.0
var splash_radius: float   = 0.0
var proj_color: Color      = Color(1.0, 0.9, 0.2)
var status_type: int       = 0
var status_duration: float = 0.0

func init(t: Node2D, dmg: int, spd: float, splash: float,
		  s_type: int = 0, s_dur: float = 0.0) -> void:
	target          = t
	damage          = dmg
	move_speed      = spd
	splash_radius   = splash
	status_type     = s_type
	status_duration = s_dur

func _process(delta: float) -> void:
	if not is_instance_valid(target):
		queue_free()
		return
	var diff: Vector2 = target.global_position - global_position
	var dist: float   = diff.length()
	if dist <= move_speed * delta:
		global_position = target.global_position
		_on_hit()
	else:
		global_position += diff.normalized() * move_speed * delta
		queue_redraw()

func _on_hit() -> void:
	if splash_radius > 0.0:
		Audio.play_splash()
		for e in get_tree().get_nodes_in_group("enemies"):
			if is_instance_valid(e) and global_position.distance_to(e.global_position) <= splash_radius:
				e.take_damage(damage)
				if status_type > 0:
					e.apply_status(status_type, status_duration)
		var fx_scene = load("res://scenes/SplashEffect.tscn")
		if fx_scene:
			var fx = fx_scene.instantiate()
			get_tree().current_scene.add_child(fx)
			fx.global_position = global_position
			fx.init(splash_radius, proj_color)
	else:
		if is_instance_valid(target):
			target.take_damage(damage)
			if status_type > 0:
				target.apply_status(status_type, status_duration)
	queue_free()

func _draw() -> void:
	draw_circle(Vector2.ZERO, 5, proj_color)
	draw_arc(Vector2.ZERO, 5, 0, TAU, 12, Color(0, 0, 0, 0.4), 1.0)
