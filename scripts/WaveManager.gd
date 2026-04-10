extends Node

@export var enemy_scene: PackedScene

var world_path: Array = []
var spawn_queue: Array = []
var alive_count: int = 0
var total_count: int = 0
var is_spawning: bool = false
var spawn_timer: Timer

signal all_dead()
signal progress_updated(remaining: int, total: int)

func _ready() -> void:
	spawn_timer = Timer.new()
	spawn_timer.one_shot = true
	spawn_timer.timeout.connect(_on_spawn_timeout)
	add_child(spawn_timer)

func init(path: Array) -> void:
	world_path = path

func start_wave(wave_data: Array) -> void:
	if enemy_scene == null:
		push_error("WaveManager: enemy_scene not assigned in inspector")
		return
	spawn_queue = wave_data.duplicate()
	alive_count = wave_data.size()
	total_count = alive_count
	is_spawning = true
	progress_updated.emit(alive_count, total_count)
	_spawn_next()

func _spawn_next() -> void:
	if spawn_queue.is_empty():
		is_spawning = false
		_check_done()
		return
	var entry: Dictionary = spawn_queue.pop_front()
	_do_spawn(entry)
	spawn_timer.wait_time = entry.get("delay", 1.0)
	spawn_timer.start()

func _on_spawn_timeout() -> void:
	_spawn_next()

func _do_spawn(entry: Dictionary) -> void:
	var e = enemy_scene.instantiate()
	if entry.has("health"): e.max_health = entry["health"]
	if entry.has("speed"):  e.move_speed  = entry["speed"]
	if entry.has("reward"): e.gold_reward = entry["reward"]
	if entry.has("color"):  e.enemy_color = entry["color"]
	get_tree().current_scene.add_child(e)
	e.init(world_path)
	e.died.connect(_on_enemy_done)
	e.reached_base.connect(_on_enemy_at_base)

func _on_enemy_done(_e: Node2D) -> void:
	alive_count -= 1
	progress_updated.emit(alive_count, total_count)
	_check_done()

func _on_enemy_at_base(_e: Node2D) -> void:
	GameManager.lose_life()
	alive_count -= 1
	progress_updated.emit(alive_count, total_count)
	_check_done()

func _check_done() -> void:
	if alive_count <= 0 and not is_spawning:
		all_dead.emit()
		GameManager.clear_wave()
