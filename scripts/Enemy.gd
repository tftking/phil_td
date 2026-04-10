extends Node2D

@export var max_health: int = 100
@export var move_speed: float = 80.0
@export var gold_reward: int = 10
@export var enemy_color: Color = Color(0.85, 0.18, 0.18)

var health: int = 0
var world_path: Array = []
var path_index: int = 1

signal died(enemy: Node2D)
signal reached_base(enemy: Node2D)

func _ready() -> void:
	health = max_health
	add_to_group("enemies")

func init(p: Array) -> void:
	world_path = p
	health = max_health
	if world_path.size() > 0:
		global_position = world_path[0]
	path_index = 1

func _process(delta: float) -> void:
	if path_index >= world_path.size():
		reached_base.emit(self)
		queue_free()
		return
	_move_step(delta)
	queue_redraw()

func _move_step(delta: float) -> void:
	var target: Vector2 = world_path[path_index]
	var diff: Vector2 = target - global_position
	var dist: float = diff.length()
	var step: float = move_speed * delta
	if step >= dist:
		global_position = target
		path_index += 1
	else:
		global_position += diff.normalized() * step

func take_damage(amount: int) -> void:
	health = max(0, health - amount)
	queue_redraw()
	if health <= 0:
		_die()

func _die() -> void:
	GameManager.add_gold(gold_reward)
	GameManager.add_kill()
	died.emit(self)
	queue_free()

func _draw() -> void:
	draw_circle(Vector2.ZERO, 12, enemy_color)
	draw_arc(Vector2.ZERO, 12, 0, TAU, 20, Color(0, 0, 0, 0.5), 1.5)
	# HP bar
	var bar_w: float = 28.0
	draw_rect(Rect2(-bar_w * 0.5, -22, bar_w, 5), Color(0.15, 0.0, 0.0))
	var ratio: float = float(health) / float(max_health)
	var bar_col: Color = Color(0.1, 0.85, 0.1) if ratio > 0.5 else (Color(0.9, 0.7, 0.0) if ratio > 0.25 else Color(0.9, 0.1, 0.1))
	draw_rect(Rect2(-bar_w * 0.5, -22, bar_w * ratio, 5), bar_col)
