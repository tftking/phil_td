extends Node2D

@onready var grid: Node2D              = $Grid
@onready var wave_manager: Node        = $WaveManager
@onready var card_hand: Node           = $CardHand
@onready var tower_placer: Node        = $TowerPlacer
@onready var hud: CanvasLayer          = $HUD
@onready var card_hand_ui: CanvasLayer = $CardHandUI

var _hovered_tower: Node = null

func _ready() -> void:
	await get_tree().process_frame

	# Connect signals before waiting for game_started so HUD is wired
	tower_placer.init(grid)
	GameManager.wave_cleared.connect(_on_wave_cleared)
	GameManager.wave_started.connect(func(w): hud.show_wave_announcement(w))
	GameManager.run_over.connect(_on_run_over)
	tower_placer.placement_done.connect(func(): hud.hide_placing_label())
	tower_placer.placement_cancelled.connect(func(): hud.hide_placing_label())
	wave_manager.progress_updated.connect(func(rem, tot): hud.update_wave_progress(rem, tot))

	card_hand.reset_for_wave()

	# Wait for player to press Start on the start screen
	await GameManager.game_started

	# Rebuild grid for selected map (user may have changed it on start screen)
	grid.rebuild_for_map(GameManager.selected_map)
	wave_manager.init(grid.world_path)

	await get_tree().create_timer(0.35).timeout
	_start_next_wave()

func _start_next_wave() -> void:
	GameManager.start_wave()
	# Passive income from wave 2 onward
	if GameManager.wave_number > 1:
		var income := 20 + GameManager.wave_number * 5
		GameManager.add_gold(income)
		hud.show_income_popup(income)
	wave_manager.start_wave(_generate_wave(GameManager.wave_number))

func _on_wave_cleared(wave_num: int) -> void:
	card_hand.reset_for_wave()
	await hud.run_countdown(wave_num, GameManager.wave_kills)
	if GameManager.state != "over":
		_start_next_wave()

func _on_run_over() -> void:
	pass

# ---------------------------------------------------------------------------
# Wave generation  — swap body for Gemini call later
# ---------------------------------------------------------------------------
func _generate_wave(wave_num: int) -> Array:
	var d    := GameManager.diff()
	var base_hp:    int   = int((70 + wave_num * 28) * d.hp)
	var base_spd:   float = (58.0 + wave_num * 4.5) * d.spd
	var base_delay: float = max(0.22, 1.0 - wave_num * 0.06)
	var reward:     int   = int((8 + wave_num) * d.reward)
	var data: Array       = []

	for _i in (5 + wave_num * 2):
		data.append({delay=base_delay, health=base_hp, speed=base_spd, reward=reward})

	if wave_num >= 3:
		for _i in clampi(wave_num - 2, 1, 8):
			data.append({delay=base_delay * 0.4, health=int(base_hp * 0.45),
				speed=base_spd * 2.0, reward=reward + 4, color=Color(1.0, 0.55, 0.08)})

	if wave_num >= 5:
		for _i in clampi((wave_num - 4) / 2, 1, 6):
			data.append({delay=base_delay * 1.8, health=int(base_hp * 2.8),
				speed=base_spd * 0.65, reward=reward * 2, color=Color(0.45, 0.50, 0.80)})

	if wave_num % 5 == 0:
		data.append({delay=0.5, health=base_hp * 9, speed=base_spd * 0.42,
			reward=reward * 6, color=Color(0.75, 0.08, 0.85), is_boss=true})

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

	if event is InputEventMouseMotion:
		var mpos: Vector2  = get_global_mouse_position()
		var cell: Vector2i = grid.world_to_cell(mpos)
		if tower_placer.is_placing:
			grid.set_hover(cell)
		else:
			var tower = grid.tower_slots.get(cell)
			if tower != _hovered_tower:
				if is_instance_valid(_hovered_tower):
					_hovered_tower.set_highlighted(false)
				_hovered_tower = tower if (tower != null and is_instance_valid(tower)) else null
				if _hovered_tower:
					_hovered_tower.set_highlighted(true)
					hud.show_tower_info(_hovered_tower)
				else:
					hud.clear_tower_info()

	if event.is_action_pressed("ui_cancel"):
		tower_placer.cancel()

func _try_sell_tower(cell: Vector2i) -> void:
	var tower = grid.tower_slots.get(cell)
	if tower == null or not is_instance_valid(tower): return
	if _hovered_tower == tower:
		_hovered_tower = null
	var gold_back: int = tower.sell_value
	GameManager.add_gold(gold_back)
	grid.remove_tower(cell)
	tower.queue_free()
	hud.show_sell_feedback(gold_back)
	hud.clear_tower_info()
