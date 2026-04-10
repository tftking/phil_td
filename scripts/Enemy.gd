extends Node2D

enum Type { NORMAL, RUNNER, ARMORED, BOSS }

@export var max_health: int    = 100
@export var move_speed: float  = 80.0
@export var gold_reward: int   = 10
@export var enemy_color: Color = Color(0.85, 0.18, 0.18)
@export var enemy_type: int    = Type.NORMAL

var health: int       = 0
var world_path: Array = []
var path_index: int   = 1
var is_boss: bool     = false

var _flash_timer: float  = 0.0
const FLASH_DUR: float   = 0.10

signal died(enemy: Node2D)
signal reached_base(enemy: Node2D)

func _ready() -> void:
	health = max_health
	add_to_group("enemies")

func init(p: Array) -> void:
	world_path = p
	health     = max_health
	if world_path.size() > 0:
		global_position = world_path[0]
	path_index = 1

func _process(delta: float) -> void:
	if path_index >= world_path.size():
		reached_base.emit(self)
		queue_free()
		return
	_move_step(delta)
	if _flash_timer > 0.0:
		_flash_timer -= delta
		if _flash_timer <= 0.0:
			modulate = Color.WHITE
	queue_redraw()

func _move_step(delta: float) -> void:
	var target: Vector2 = world_path[path_index]
	var diff: Vector2   = target - global_position
	var dist: float     = diff.length()
	var step: float     = move_speed * delta
	if step >= dist:
		global_position = target
		path_index += 1
	else:
		global_position += diff.normalized() * step

func take_damage(amount: int) -> void:
	health = max(0, health - amount)
	_flash_timer = FLASH_DUR
	modulate     = Color(2.2, 0.25, 0.25)
	queue_redraw()
	var ft_scene := load("res://scenes/FloatText.tscn")
	if ft_scene:
		var ft = ft_scene.instantiate()
		get_tree().current_scene.add_child(ft)
		ft.global_position = global_position + Vector2(randf_range(-8, 8), -14)
		var col := Color(1.0, 0.4, 0.4) if not is_boss else Color(1.0, 0.6, 0.0)
		ft.init("-%d" % amount, col, 14 if not is_boss else 18)
	Audio.play_hit()
	if is_boss:
		GameManager.report_boss_health(health, max_health)
	if health <= 0:
		_die()

func _die() -> void:
	# Death burst
	var burst_scene := load("res://scenes/DeathBurst.tscn")
	if burst_scene:
		var burst = burst_scene.instantiate()
		get_tree().current_scene.add_child(burst)
		burst.global_position = global_position
		burst.init(enemy_color, is_boss)
	if is_boss:
		GameManager.report_boss_cleared()
		Audio.play_boss_dead()
		var ft_scene := load("res://scenes/FloatText.tscn")
		if ft_scene:
			var ft = ft_scene.instantiate()
			get_tree().current_scene.add_child(ft)
			ft.global_position = global_position + Vector2(0, -28)
			ft.init("+%d gold" % gold_reward, Color(1.0, 0.85, 0.22), 22)
	GameManager.add_gold(gold_reward)
	GameManager.add_kill()
	died.emit(self)
	queue_free()

func _draw() -> void:
	match enemy_type:
		Type.NORMAL:
			_draw_circle_enemy(12.0)
		Type.RUNNER:
			_draw_triangle_enemy(13.0)
		Type.ARMORED:
			_draw_diamond_enemy(13.0)
		Type.BOSS:
			_draw_boss_enemy(20.0)
	_draw_hp_bar()

func _draw_circle_enemy(r: float) -> void:
	draw_circle(Vector2.ZERO, r, enemy_color)
	draw_arc(Vector2.ZERO, r, 0, TAU, 20, Color(0, 0, 0, 0.5), 1.5)

func _draw_triangle_enemy(r: float) -> void:
	# Pointy triangle pointing in direction of travel
	var pts: PackedVector2Array = [
		Vector2(0, -r * 1.2),
		Vector2(r, r * 0.8),
		Vector2(-r, r * 0.8),
	]
	draw_colored_polygon(pts, enemy_color)
	draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[0]]),
		Color(0, 0, 0, 0.5), 1.5)

func _draw_diamond_enemy(r: float) -> void:
	var pts: PackedVector2Array = [
		Vector2(0, -r * 1.3),
		Vector2(r * 0.9, 0),
		Vector2(0,  r * 1.3),
		Vector2(-r * 0.9, 0),
	]
	draw_colored_polygon(pts, enemy_color)
	draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[0]]),
		Color(0, 0, 0, 0.5), 2.0)
	# Armor cross-hatch
	draw_line(Vector2(-r * 0.5, -r * 0.5), Vector2(r * 0.5,  r * 0.5),
		Color(0, 0, 0, 0.25), 1.0)
	draw_line(Vector2( r * 0.5, -r * 0.5), Vector2(-r * 0.5, r * 0.5),
		Color(0, 0, 0, 0.25), 1.0)

func _draw_boss_enemy(r: float) -> void:
	# Outer glow ring
	draw_arc(Vector2.ZERO, r + 5, 0, TAU, 32,
		Color(enemy_color.r, enemy_color.g, enemy_color.b, 0.35), 3.0)
	draw_circle(Vector2.ZERO, r, enemy_color)
	draw_arc(Vector2.ZERO, r, 0, TAU, 32, Color(0, 0, 0, 0.5), 2.5)
	# Crown spikes
	for i in 5:
		var a := (TAU / 5.0) * i - PI * 0.5
		var inner := Vector2(cos(a), sin(a)) * (r - 4)
		var outer := Vector2(cos(a), sin(a)) * (r + 9)
		draw_line(inner, outer, Color(1.0, 0.85, 0.15, 0.9), 2.5)

func _draw_hp_bar() -> void:
	var bw: float = 32.0 if is_boss else 26.0
	var r: float  = 20.0 if is_boss else 12.0
	var by: float = -(r + 10.0)
	draw_rect(Rect2(-bw * 0.5, by, bw, 4), Color(0.12, 0.0, 0.0))
	var ratio := float(health) / float(max_health)
	var col   := (Color(0.1, 0.85, 0.1) if ratio > 0.5
		else (Color(0.9, 0.7, 0.0) if ratio > 0.25
		else Color(0.9, 0.1, 0.1)))
	draw_rect(Rect2(-bw * 0.5, by, bw * ratio, 4), col)
