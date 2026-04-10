extends Node2D

var tower_label: String     = "Tower"
var damage: int             = 10
var fire_rate: float        = 1.0
var range_radius: float     = 120.0
var tower_color: Color      = Color(0.35, 0.60, 0.95)
var splash_radius: float    = 0.0
var projectile_speed: float = 220.0
var sell_value: int         = 20
var hand_rank: int          = 0
var status_type: int        = 0
var status_duration: float  = 0.0
var suit_bonus_label: String = ""
var is_highlighted: bool    = false

# 0=First (furthest along path) 1=Last (closest to spawn) 2=Strongest (most HP)
var targeting_priority: int = 0
const PRIORITY_LABELS: Array = ["First", "Last", "Strong"]

var _recoil: float = 0.0
const RECOIL_AMT: float = 5.0
const RECOIL_SPEED: float = 18.0

var target: Node2D         = null
var fire_timer: float      = 0.0
var fire_interval: float   = 1.0
var aim_angle: float       = -PI * 0.5
var projectile_scene: PackedScene = null

func dps() -> float:
	return damage * fire_rate

func _ready() -> void:
	fire_interval   = 1.0 / max(fire_rate, 0.01)
	projectile_scene = load("res://scenes/Projectile.tscn")
	queue_redraw()

func set_highlighted(v: bool) -> void:
	if is_highlighted != v:
		is_highlighted = v
		queue_redraw()

func _process(delta: float) -> void:
	_recoil = move_toward(_recoil, 0.0, RECOIL_SPEED * delta)
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

func cycle_priority() -> void:
	targeting_priority = (targeting_priority + 1) % 3
	queue_redraw()

func _acquire_target() -> void:
	if is_instance_valid(target):
		if global_position.distance_squared_to(target.global_position) <= range_radius * range_radius:
			return
	target = null
	var enemies := get_tree().get_nodes_in_group("enemies")
	var best_val: float = -INF if targeting_priority != 1 else INF
	for e in enemies:
		if not is_instance_valid(e): continue
		if global_position.distance_squared_to(e.global_position) > range_radius * range_radius:
			continue
		var val: float
		match targeting_priority:
			0: val = float(e.path_index)           # First — highest progress
			1: val = -float(e.path_index)          # Last — lowest progress
			2: val = float(e.health)               # Strongest — most HP
			_: val = float(e.path_index)
		if val > best_val:
			best_val = val
			target = e

func _fire() -> void:
	if not is_instance_valid(target): return
	if projectile_scene == null: return
	Audio.play_shoot()
	_recoil = RECOIL_AMT
	queue_redraw()
	var proj = projectile_scene.instantiate()
	get_tree().current_scene.add_child(proj)
	proj.global_position = global_position
	proj.proj_color      = tower_color.lightened(0.3)
	# Shape: 0=circle 1=diamond 2=mortar 3=star
	var shape: int = 0
	match hand_rank:
		4, 8:    shape = 1  # Rapid, Storm → diamond
		6:       shape = 2  # Mortar → big blob
		9:       shape = 3  # Nuke → starburst
	proj.init(target, damage, projectile_speed, splash_radius,
		status_type, status_duration, shape)

func _draw() -> void:
	var ring_alpha: float = 0.45 if is_highlighted else 0.12
	var ring_width: float = 1.5  if is_highlighted else 1.0
	draw_arc(Vector2.ZERO, range_radius, 0, TAU, 64,
		Color(tower_color.r, tower_color.g, tower_color.b, ring_alpha), ring_width)
	if is_highlighted:
		draw_circle(Vector2.ZERO, range_radius,
			Color(tower_color.r, tower_color.g, tower_color.b, 0.06))
	draw_circle(Vector2.ZERO, 16, tower_color)
	draw_arc(Vector2.ZERO, 16, 0, TAU, 24, Color(0, 0, 0, 0.5), 2.0)
	var dir := Vector2(cos(aim_angle), sin(aim_angle))
	var barrel_origin := -dir * _recoil
	var tip: Vector2   = barrel_origin + dir * 22.0
	draw_line(barrel_origin, tip, Color(0.08, 0.08, 0.08), 5.0, true)
	draw_line(barrel_origin, barrel_origin + dir * 18.0, tower_color.lightened(0.25), 3.0, true)
	# Status dot
	if status_type == 1:
		draw_circle(Vector2(12, -12), 4, Color(0.3, 0.6, 1.0, 0.9))
	elif status_type == 2:
		draw_circle(Vector2(12, -12), 4, Color(0.2, 0.85, 0.2, 0.9))
	# Priority label (tiny, top-left of tower)
	var f  := ThemeDB.fallback_font
	var pl := PRIORITY_LABELS[targeting_priority]
	draw_string(f, Vector2(-23, -20), pl, HORIZONTAL_ALIGNMENT_LEFT, -1, 9,
		Color(1.0, 1.0, 1.0, 0.60))
	var sw := f.get_string_size(tower_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
	draw_string(f, Vector2(-sw * 0.5, 30), tower_label,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.85))
