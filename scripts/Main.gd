extends Node2D

@onready var grid: Node2D              = $Grid
@onready var wave_manager: Node        = $WaveManager
@onready var card_hand: Node           = $CardHand
@onready var tower_placer: Node        = $TowerPlacer
@onready var hud: CanvasLayer          = $HUD
@onready var card_hand_ui: CanvasLayer = $CardHandUI
@onready var camera: Camera2D          = $Camera2D

var _hovered_tower: Node   = null
var _paused: bool          = false
var _shake_timer: float    = 0.0
const SHAKE_DUR: float     = 0.45
const SHAKE_STRENGTH: float = 7.0

func _ready() -> void:
	await get_tree().process_frame
	tower_placer.init(grid)
	GameManager.wave_cleared.connect(_on_wave_cleared)
	GameManager.wave_started.connect(func(w): hud.show_wave_announcement(w))
	GameManager.run_over.connect(_on_run_over)
	GameManager.run_won.connect(_on_run_won)
	GameManager.boss_cleared.connect(_on_boss_cleared)
	tower_placer.placement_done.connect(func():
		Audio.play_place()
		hud.hide_placing_label())
	tower_placer.placement_cancelled.connect(func(): hud.hide_placing_label())
	wave_manager.progress_updated.connect(func(rem, tot): hud.update_wave_progress(rem, tot))
	GeminiWave.wave_ready.connect(_on_wave_ready)
	card_hand.hand_evaluated.connect(_on_hand_evaluated_main)
	card_hand.reset_for_wave()
	await GameManager.game_started
	grid.rebuild_for_map(GameManager.selected_map)
	wave_manager.init(grid.world_path)
	await get_tree().create_timer(0.35).timeout
	_start_next_wave()

func _start_next_wave() -> void:
	GameManager.start_wave()
	if GameManager.wave_number > 1:
		var income := 20 + GameManager.wave_number * 5
		GameManager.add_gold(income)
		hud.show_income_popup(income)
	# Roll a modifier every 3 waves starting wave 4
	var mod: Dictionary = {}
	if GameManager.wave_number >= 4 and GameManager.wave_number % 3 == 1:
		mod = GameManager.roll_modifier()
		hud.show_modifier_banner(mod)
	GeminiWave.generate(GameManager.wave_number, _generate_wave_fallback)

func _on_wave_ready(wave_data: Array) -> void:
	var mod := GameManager.active_modifier
	var data := wave_data.duplicate(true)
	# Apply modifier to wave data
	match mod.get("id", "none"):
		"swarm":
			var extra := data.duplicate()
			extra.shuffle()
			data += extra.slice(0, data.size() / 2)
		"fast":
			for e in data: e.speed = float(e.get("speed", 65.0)) * 1.4
		"armored":
			for e in data: e.health = int(float(e.get("health", 100)) * 1.6)
		"goldless":
			for e in data: e.reward = 0
	for e in data:
		if e.get("is_boss", false):
			Audio.play_boss_spawn()
			break
	wave_manager.start_wave(data)

func _on_hand_evaluated_main(rank: int, _cards: Array) -> void:
	if rank == 0:
		GameManager.apply_high_card_penalty()
		hud.show_penalty_popup()

func _on_wave_cleared(wave_num: int) -> void:
	Audio.play_wave_clear()
	card_hand.reset_for_wave()
	if GameManager.state != "over":
		await hud.run_countdown(wave_num, GameManager.wave_kills)
	if GameManager.state != "over" and GameManager.state != "won":
		_start_next_wave()

func _on_run_over() -> void:
	pass

func _on_run_won() -> void:
	hud.show_victory_screen()

func _on_boss_cleared() -> void:
	_start_shake()

func _start_shake() -> void:
	_shake_timer = SHAKE_DUR

func _process(delta: float) -> void:
	if _shake_timer > 0.0:
		_shake_timer -= delta
		var t      := _shake_timer / SHAKE_DUR
		camera.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * SHAKE_STRENGTH * t
	else:
		camera.offset = Vector2.ZERO

func _generate_wave_fallback(wave_num: int) -> Array:
	var d            := GameManager.diff()
	var base_hp:    int   = int((70 + wave_num * 28) * d.hp)
	var base_spd:   float = (58.0 + wave_num * 4.5) * d.spd
	var base_delay: float = max(0.22, 1.0 - wave_num * 0.06)
	var reward:     int   = int((8 + wave_num) * d.reward)
	var data: Array       = []

	for _i in (5 + wave_num * 2):
		data.append({delay=base_delay, health=base_hp, speed=base_spd,
			reward=reward, color=Color(0.85, 0.18, 0.18), enemy_type=0})

	if wave_num >= 3:
		for _i in clampi(wave_num - 2, 1, 8):
			data.append({delay=base_delay * 0.4, health=int(base_hp * 0.45),
				speed=base_spd * 2.0, reward=reward + 4,
				color=Color(1.0, 0.55, 0.08), enemy_type=1})

	if wave_num >= 5:
		for _i in clampi((wave_num - 4) / 2, 1, 6):
			data.append({delay=base_delay * 1.8, health=int(base_hp * 2.8),
				speed=base_spd * 0.65, reward=reward * 2,
				color=Color(0.45, 0.50, 0.80), enemy_type=2})

	if wave_num % 5 == 0:
		data.append({delay=0.5, health=base_hp * 9, speed=base_spd * 0.42,
			reward=reward * 6, color=Color(0.75, 0.08, 0.85), is_boss=true})

	data.shuffle()
	return data

func _input(event: InputEvent) -> void:
	if GameManager.state == "over" or GameManager.state == "won": return

	if event.is_action_pressed("ui_cancel"):
		if tower_placer.is_placing:
			tower_placer.cancel()
		else:
			_toggle_pause()
		return

	if _paused: return

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
				_hovered_tower = (tower if (tower != null and is_instance_valid(tower)) else null)
				if _hovered_tower:
					_hovered_tower.set_highlighted(true)
					hud.show_tower_info(_hovered_tower)
				else:
					hud.clear_tower_info()

	if event.is_action_pressed("ui_cancel"):
		tower_placer.cancel()

func _toggle_pause() -> void:
	_paused = not _paused
	get_tree().paused = _paused
	hud.show_pause_screen(_paused)

func _try_sell_tower(cell: Vector2i) -> void:
	var tower = grid.tower_slots.get(cell)
	if tower == null or not is_instance_valid(tower): return
	if _hovered_tower == tower: _hovered_tower = null
	Audio.play_sell()
	GameManager.add_gold(tower.sell_value)
	grid.remove_tower(cell)
	tower.queue_free()
	hud.show_sell_feedback(tower.sell_value)
	hud.clear_tower_info()
