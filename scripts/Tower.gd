extends Node2D

var tower_label: String = "Tower"
var damage: int         = 10
var fire_rate: float    = 1.0
var range_radius: float = 120.0
var tower_color: Color  = Color(0.35, 0.60, 0.95)
var splash_radius: float = 0.0
var projectile_speed: float = 220.0
var sell_value: int     = 20
var hand_rank: int      = 0   # CardHand.HandRank value — used for upgrade logic

var target: Node2D = null
var fire_timer: float = 0.0
var fire_interval: float = 1.0
var aim_angle: float = -PI * 0.5
var projectile_scene: PackedScene = null

func _ready() -> void:
	fire_interval = 1.0 / max(fire_rate, 0.01)
	projectile_scene = load("res://scenes/Projectile.tscn")
	queue_redraw()

func _process(delta: float) -> void:
	fire_timer += delta
	_acquire_target()
	if is_instance_valid(target):
		var new_angle: float = (target.global_position - global_position).angle()
		if absf(new_angle - aim_angle) > 0.04:
			aim_angle = new_angle
			queue_redraw()
	if is_instance_valid(target) and fire_timer >= fire_interval:
		fire_timer = 0.0
		_fire()

func _acquire_target() -> void:
	if is_instance_valid(target):
		if global_position.distance_squared_to(target.global_position) <= range_radius * range_radius:
			return
	target = null
	var enemies := get_tree().get_nodes_in_group("enemies")
	var best_progress: int = -1
	for e in enemies:
		if not is_instance_valid(e): continue
		if global_position.distance_squared_to(e.global_position) <= range_radius * range_radius:
			if e.path_index > best_progress:
				best_progress = e.path_index
				target = e

func _fire() -> void:
	if not is_instance_valid(target): return
	if projectile_scene == null: return
	var proj = projectile_scene.instantiate()
	get_tree().current_scene.add_child(proj)
	proj.global_position = global_position
	proj.proj_color = tower_color.lightened(0.3)
	proj.init(target, damage, projectile_speed, splash_radius)

func _draw() -> void:
	# Range ring
	draw_arc(Vector2.ZERO, range_radius, 0, TAU, 64, Color(tower_color.r, tower_color.g, tower_color.b, 0.12), 1.0)
	# Base
	draw_circle(Vector2.ZERO, 16, tower_color)
	draw_arc(Vector2.ZERO, 16, 0, TAU, 24, Color(0, 0, 0, 0.5), 2.0)
	# Barrel
	var tip: Vector2 = Vector2(cos(aim_angle), sin(aim_angle)) * 22.0
	draw_line(Vector2.ZERO, tip, Color(0.08, 0.08, 0.08), 5.0, true)
	draw_line(Vector2.ZERO, tip * 0.85, tower_color.lightened(0.25), 3.0, true)
	# Name label below tower
	var f := ThemeDB.fallback_font
	var sw := f.get_string_size(tower_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
	draw_string(f, Vector2(-sw * 0.5, 30), tower_label,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.85))
