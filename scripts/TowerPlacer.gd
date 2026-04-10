extends Node

# Status effect IDs
const STATUS_NONE:   int = 0
const STATUS_SLOW:   int = 1
const STATUS_POISON: int = 2

# Index = CardHand.HandRank (0=HIGH_CARD, no entry)
# DPS targets: Archer~12, Double~22, Sniper~28, Rapid~30, Splash~16+AoE,
#              Mortar~24+AoE, Laser~55, Storm~38+AoE, Nuke~54+massive AoE
const CONFIGS: Array = [
	{},  # HIGH_CARD
	{label="Archer",  color=Color(0.35,0.60,0.95), damage=12,  rate=1.0,  range=120.0, splash=0.0,   speed=220.0, sell=20,  status=STATUS_NONE,   status_dur=0.0},
	{label="Double",  color=Color(0.35,0.80,0.50), damage=15,  rate=1.5,  range=115.0, splash=0.0,   speed=230.0, sell=30,  status=STATUS_NONE,   status_dur=0.0},
	{label="Sniper",  color=Color(0.68,0.28,0.88), damage=56,  rate=0.5,  range=250.0, splash=0.0,   speed=420.0, sell=40,  status=STATUS_NONE,   status_dur=0.0},
	{label="Rapid",   color=Color(0.95,0.78,0.18), damage=7,   rate=4.2,  range=100.0, splash=0.0,   speed=300.0, sell=35,  status=STATUS_SLOW,   status_dur=1.2},
	{label="Splash",  color=Color(0.18,0.72,0.88), damage=14,  rate=1.1,  range=148.0, splash=58.0,  speed=180.0, sell=55,  status=STATUS_POISON, status_dur=3.0},
	{label="Mortar",  color=Color(0.88,0.55,0.18), damage=40,  rate=0.6,  range=220.0, splash=85.0,  speed=160.0, sell=70,  status=STATUS_SLOW,   status_dur=2.0},
	{label="Laser",   color=Color(0.95,0.08,0.55), damage=55,  rate=1.0,  range=200.0, splash=0.0,   speed=460.0, sell=85,  status=STATUS_NONE,   status_dur=0.0},
	{label="Storm",   color=Color(0.48,0.08,0.95), damage=24,  rate=1.6,  range=168.0, splash=50.0,  speed=320.0, sell=90,  status=STATUS_SLOW,   status_dur=1.8},
	{label="Nuke",    color=Color(1.00,0.40,0.00), damage=180, rate=0.3,  range=300.0, splash=130.0, speed=155.0, sell=150, status=STATUS_POISON, status_dur=4.0},
]

# Suit bonus applied when a flush is played (index = suit 0-3)
# 0=clubs 1=diamonds 2=hearts 3=spades
const SUIT_BONUS_LABEL: Array = ["Clubs +splash","Diamonds +dmg","Hearts +rate","Spades +range"]
const SUIT_BONUS_MULT:  Array = [1.25, 1.20, 1.20, 1.20]
const SUIT_BONUS_FIELD: Array = ["splash_radius","damage","fire_rate","range_radius"]

var grid: Node
var tower_scene: PackedScene
var pending_rank: int  = -1
var pending_suit: int  = -1   # suit of flush hand, -1 if not a flush
var is_placing:   bool = false

signal placement_started(tower_label: String, suit_bonus: String)
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

func _on_hand_evaluated(rank: int, cards: Array) -> void:
	if rank == 0: return
	pending_rank = rank
	pending_suit = -1
	# Detect flush suit — all 5 cards same suit
	if rank == 5 or rank == 8 or rank == 9:  # FLUSH, STRAIGHT_FLUSH, ROYAL_FLUSH
		pending_suit = cards[0]["suit"]
		for c in cards:
			if c["suit"] != pending_suit:
				pending_suit = -1
				break
	is_placing        = true
	grid.placement_mode = true
	var bonus_lbl := SUIT_BONUS_LABEL[pending_suit] if pending_suit >= 0 else ""
	placement_started.emit(CONFIGS[rank]["label"], bonus_lbl)

func try_place(cell: Vector2i) -> void:
	if not is_placing or pending_rank <= 0: return
	if not grid.is_valid_cell(cell): return
	if grid.is_path_cell(cell): return

	var existing = grid.tower_slots.get(cell)
	var upgrading: bool = existing != null and is_instance_valid(existing)

	var old_priority: int = 0
	if upgrading:
		if pending_rank <= existing.hand_rank: return
		old_priority = existing.targeting_priority
		GameManager.add_gold(existing.sell_value / 2)
		GameManager.remove_tower()
		grid.remove_tower(cell)
		existing.queue_free()

	if tower_scene == null:
		cancel()
		return

	var cfg: Dictionary = CONFIGS[pending_rank].duplicate()
	var tower           = tower_scene.instantiate()
	tower.tower_label      = cfg["label"]
	tower.damage           = cfg["damage"]
	tower.fire_rate        = cfg["rate"]
	tower.range_radius     = cfg["range"]
	tower.tower_color      = cfg["color"]
	tower.splash_radius    = cfg["splash"]
	tower.projectile_speed = cfg["speed"]
	tower.sell_value       = cfg["sell"]
	tower.hand_rank        = pending_rank
	tower.status_type      = cfg["status"]
	tower.status_duration  = cfg["status_dur"]
	if upgrading:
		tower.targeting_priority = old_priority

	# Apply suit bonus
	if pending_suit >= 0:
		var field: String = SUIT_BONUS_FIELD[pending_suit]
		var mult: float   = SUIT_BONUS_MULT[pending_suit]
		tower.set(field, tower.get(field) * mult)
		tower.suit_bonus_label = SUIT_BONUS_LABEL[pending_suit]

	get_tree().current_scene.add_child(tower)
	tower.global_position = grid.cell_to_world(cell)
	grid.place_tower(cell, tower)
	GameManager.add_tower()

	cancel()
	placement_done.emit()

func cancel() -> void:
	pending_rank  = -1
	pending_suit  = -1
	is_placing    = false
	if grid:
		grid.placement_mode = false
		grid.set_hover(Vector2i(-1, -1))
	placement_cancelled.emit()
