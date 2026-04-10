extends Node2D

@onready var grid: Node2D         = $Grid
@onready var wave_manager: Node   = $WaveManager
@onready var card_hand: Node      = $CardHand
@onready var tower_placer: Node   = $TowerPlacer
@onready var hud: CanvasLayer     = $HUD
@onready var card_hand_ui: CanvasLayer = $CardHandUI

func _ready() -> void:
	await get_tree().process_frame
	tower_placer.init(grid)
	wave_manager.init(grid.world_path)

	GameManager.wave_cleared.connect(_on_wave_cleared)
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
	pass  # HUD shows game over

# Wave data generation — replace _generate_wave body with Gemini call later
func _generate_wave(wave_num: int) -> Array:
	var count: int    = 6 + wave_num * 3
	var delay: float  = max(0.22, 1.0 - wave_num * 0.06)
	var hp: int       = 70 + wave_num * 28
	var speed: float  = 58.0 + wave_num * 4.5
	var reward: int   = 8 + wave_num
	var data: Array   = []
	for i in count:
		data.append({"delay": delay, "health": hp, "speed": speed, "reward": reward})
	return data

func _input(event: InputEvent) -> void:
	if GameManager.state == "over": return

	if event is InputEventMouseButton and event.pressed:
		var mpos: Vector2 = get_global_mouse_position()
		var cell: Vector2i = grid.world_to_cell(mpos)
		if event.button_index == MOUSE_BUTTON_LEFT and tower_placer.is_placing:
			tower_placer.try_place(cell)
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			tower_placer.cancel()

	if event is InputEventMouseMotion and tower_placer.is_placing:
		var cell: Vector2i = grid.world_to_cell(get_global_mouse_position())
		grid.set_hover(cell)

	if event.is_action_pressed("ui_cancel"):
		tower_placer.cancel()
