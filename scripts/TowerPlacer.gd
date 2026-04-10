extends Node

# Index matches CardHand.HandRank enum (0 = HIGH_CARD, no placement)
const CONFIGS: Array = [
	{},  # HIGH_CARD
	{label="Archer",  color=Color(0.35, 0.60, 0.95), damage=10,  rate=1.0,  range=120.0, splash=0.0,   speed=220.0},
	{label="Double",  color=Color(0.35, 0.80, 0.50), damage=14,  rate=1.6,  range=115.0, splash=0.0,   speed=220.0},
	{label="Sniper",  color=Color(0.68, 0.28, 0.88), damage=45,  rate=0.45, range=240.0, splash=0.0,   speed=380.0},
	{label="Rapid",   color=Color(0.95, 0.78, 0.18), damage=8,   rate=3.8,  range=100.0, splash=0.0,   speed=290.0},
	{label="Splash",  color=Color(0.18, 0.72, 0.88), damage=16,  rate=0.85, range=148.0, splash=55.0,  speed=175.0},
	{label="Mortar",  color=Color(0.88, 0.55, 0.18), damage=55,  rate=0.38, range=215.0, splash=80.0,  speed=160.0},
	{label="Laser",   color=Color(0.95, 0.08, 0.55), damage=75,  rate=2.6,  range=195.0, splash=0.0,   speed=420.0},
	{label="Storm",   color=Color(0.48, 0.08, 0.95), damage=32,  rate=2.0,  range=165.0, splash=42.0,  speed=310.0},
	{label="Nuke",    color=Color(1.00, 0.40, 0.00), damage=300, rate=0.14, range=295.0, splash=120.0, speed=150.0},
]

var grid: Node
var tower_scene: PackedScene
var pending_rank: int = -1
var is_placing: bool = false

signal placement_started(tower_label: String)
signal placement_done()
signal placement_cancelled()

func _ready() -> void:
	tower_scene = load("res://scenes/Tower.tscn")
	call_deferred("_connect_card_hand")

func _connect_card_hand() -> void:
	var ch := get_node_or_null("/root/Main/CardHand")
	if ch:
		ch.hand_evaluated.connect(_on_hand_evaluated)

func init(g: Node) -> void:
	grid = g

func _on_hand_evaluated(rank: int, _cards: Array) -> void:
	if rank == 0:
		return
	pending_rank = rank
	is_placing = true
	grid.placement_mode = true
	placement_started.emit(CONFIGS[rank]["label"])

func try_place(cell: Vector2i) -> void:
	if not is_placing or pending_rank <= 0: return
	if not grid.can_place_tower(cell): return
	if tower_scene == null:
		push_error("TowerPlacer: tower_scene failed to load")
		cancel()
		return

	var cfg: Dictionary = CONFIGS[pending_rank]
	var tower = tower_scene.instantiate()
	tower.tower_label   = cfg["label"]
	tower.damage        = cfg["damage"]
	tower.fire_rate     = cfg["rate"]
	tower.range_radius  = cfg["range"]
	tower.tower_color   = cfg["color"]
	tower.splash_radius = cfg["splash"]
	tower.projectile_speed = cfg["speed"]

	get_tree().current_scene.add_child(tower)
	tower.global_position = grid.cell_to_world(cell)
	grid.place_tower(cell, tower)

	cancel()
	placement_done.emit()

func cancel() -> void:
	pending_rank = -1
	is_placing = false
	if grid:
		grid.placement_mode = false
		grid.set_hover(Vector2i(-1, -1))
	placement_cancelled.emit()
