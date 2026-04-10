extends Node2D

@export var max_health: int    = 100
@export var move_speed: float  = 80.0
@export var gold_reward: int   = 10
@export var enemy_color: Color = Color(0.85, 0.18, 0.18)

var health: int      = 0
var world_path: Array = []
var path_index: int  = 1
var is_boss: bool    = false

var _flash_timer: float = 0.0
const FLASH_DUR: float  = 0.10

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
	# Flash decay
	if _flash_timer > 0.0:
		_flash_timer -= delta
		if _flash_timer <= 0.0:
			modulate = Color.WHITE
			queue_redraw()
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
	# Hit flash
	_flash_timer = FLASH_DUR
	modulate     = Color(2.2, 0.25, 0.25)
	queue_redraw()
	if is_boss:
		GameManager.report_boss_health(health, max_health)
	if health <= 0:
		_die()

func _die() -> void:
	if is_boss:
		GameManager.report_boss_cleared()
	GameManager.add_gold(gold_reward)
	GameManager.add_kill()
	died.emit(self)
	queue_free()

func _draw() -> void:
	var radius: float = 18.0 if is_boss else 12.0
	draw_circle(Vector2.ZERO, radius, enemy_color)
	draw_arc(Vector2.ZERO, radius, 0, TAU, 20, Color(0, 0, 0, 0.5), 2.0)
	if is_boss:
		# Crown indicator
		draw_arc(Vector2.ZERO, radius + 4, 0, TAU, 24, Color(1.0, 0.85, 0.0, 0.8), 2.0)
	# HP bar
	var bw: float = (32.0 if is_boss else 28.0)
	var by: float = -(radius + 10.0)
	draw_rect(Rect2(-bw * 0.5, by, bw, 5), Color(0.15, 0.0, 0.0))
	var ratio: float    = float(health) / float(max_health)
	var bar_col: Color  = Color(0.1, 0.85, 0.1) if ratio > 0.5 else (Color(0.9, 0.7, 0.0) if ratio > 0.25 else Color(0.9, 0.1, 0.1))
	draw_rect(Rect2(-bw * 0.5, by, bw * ratio, 5), bar_col)
