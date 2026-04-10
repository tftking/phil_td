extends Node2D

@onready var grid: Node2D              = $Grid
@onready var wave_manager: Node        = $WaveManager
@onready var card_hand: Node           = $CardHand
@onready var tower_placer: Node        = $TowerPlacer
@onready var hud: CanvasLayer          = $HUD
@onready var card_hand_ui: CanvasLayer = $CardHandUI

func _ready() -> void:
	await get_tree().process_frame
	tower_placer.init(grid)
	wave_manager.init(grid.world_path)

	GameManager.wave_cleared.connect(_on_wave_cleared)
	GameManager.wave_started.connect(func(w): hud.show_wave_announcement(w))
	GameManager.run_over.connect(_on_run_over)
	tower_placer.placement_done.connect(func(): hud.hide_placing_label())
	tower_placer.placement_cancelled.connect(func(): hud.hide_placing_label())

	card_hand.reset_for_wave()
	await get_tree().create_timer(0.5).timeout
	_start_next_wave()

func _start_next_wave() -> void:
	GameManager.start_wave()
	wave_manager.start_wave(_generate_wave(GameManager.wave_number))

func _on_wave_cleared(_wave_num: int) -> void:
	card_hand.reset_for_wave()
	await get_tree().create_timer(2.0).timeout
	if GameManager.state != "over":
		_start_next_wave()

func _on_run_over() -> void:
	pass

# ---------------------------------------------------------------------------
# Wave generation — replace body with Gemini HTTP call when ready
# ---------------------------------------------------------------------------
func _generate_wave(wave_num: int) -> Array:
	var base_hp:    int   = 70 + wave_num * 28
	var base_spd:   float = 58.0 + wave_num * 4.5
	var base_delay: float = max(0.22, 1.0 - wave_num * 0.06)
	var reward:     int   = 8 + wave_num
	var data: Array = []

	# Standard enemies
	for _i in (5 + wave_num * 2):
		data.append({delay=base_delay, health=base_hp, speed=base_spd, reward=reward})

	# Wave 3+: fast runners (orange)
	if wave_num >= 3:
		for _i in clampi(wave_num - 2, 1, 8):
			data.append({delay=base_delay * 0.4, health=int(base_hp * 0.45),
				speed=base_spd * 2.0, reward=reward + 4, color=Color(1.0, 0.55, 0.08)})

	# Wave 5+: armored (blue-grey)
	if wave_num >= 5:
		for _i in clampi((wave_num - 4) / 2, 1, 6):
			data.append({delay=base_delay * 1.8, health=int(base_hp * 2.8),
				speed=base_spd * 0.65, reward=reward * 2, color=Color(0.45, 0.50, 0.80)})

	# Every 5 waves: boss (purple)
	if wave_num % 5 == 0:
		data.append({delay=0.5, health=base_hp * 9, speed=base_spd * 0.42,
			reward=reward * 6, color=Color(0.75, 0.08, 0.85)})

	data.shuffle()
	return data

# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if GameManager.state == "over": return

	if event is InputEventMouseButton and event.pressed:
		var mpos: Vector2  = get_global_mouse_position()
		var cell: Vector2i = grid.world_to_cell(mpos)

		if event.button_index == MOUSE_BUTTON_LEFT:
			if tower_placer.is_placing:
				tower_placer.try_place(cell)

		elif event.button_index == MOUSE_BUTTON_RIGHT:
			if tower_placer.is_placing:
				tower_placer.cancel()
			else:
				_try_sell_tower(cell)

	if event is InputEventMouseMotion and tower_placer.is_placing:
		grid.set_hover(grid.world_to_cell(get_global_mouse_position()))

	if event.is_action_pressed("ui_cancel"):
		tower_placer.cancel()

func _try_sell_tower(cell: Vector2i) -> void:
	var tower = grid.tower_slots.get(cell)
	if tower == null or not is_instance_valid(tower): return
	var gold_back: int = tower.sell_value
	GameManager.add_gold(gold_back)
	grid.remove_tower(cell)
	tower.queue_free()
	hud.show_sell_feedback(gold_back)
