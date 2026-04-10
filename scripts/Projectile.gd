extends Node2D

var target: Node2D
var damage: int            = 0
var move_speed: float      = 220.0
var splash_radius: float   = 0.0
var proj_color: Color      = Color(1.0, 0.9, 0.2)
var status_type: int       = 0
var status_duration: float = 0.0
var proj_shape: int        = 0  # 0=circle 1=diamond 2=line 3=star

func init(t: Node2D, dmg: int, spd: float, splash: float,
		  s_type: int = 0, s_dur: float = 0.0, shape: int = 0) -> void:
	target          = t
	damage          = dmg
	move_speed      = spd
	splash_radius   = splash
	status_type     = s_type
	status_duration = s_dur
	proj_shape      = shape

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
	match proj_shape:
		0:  # circle — Archer, Double, Sniper, Laser
			draw_circle(Vector2.ZERO, 5, proj_color)
			draw_arc(Vector2.ZERO, 5, 0, TAU, 12, Color(0, 0, 0, 0.4), 1.0)
		1:  # diamond — Rapid, Storm
			var pts := PackedVector2Array([Vector2(0,-7),Vector2(5,0),Vector2(0,7),Vector2(-5,0)])
			draw_colored_polygon(pts, proj_color)
		2:  # elongated capsule — Mortar (slow, big)
			draw_circle(Vector2.ZERO, 8, proj_color)
			draw_arc(Vector2.ZERO, 8, 0, TAU, 16, Color(0,0,0,0.5), 2.0)
		3:  # star burst — Nuke
			for i in 6:
				var a := (TAU / 6.0) * i
				draw_line(Vector2(cos(a), sin(a)) * 3, Vector2(cos(a), sin(a)) * 9,
					proj_color, 2.0)
			draw_circle(Vector2.ZERO, 4, proj_color)
