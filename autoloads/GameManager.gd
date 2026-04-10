extends Node

signal gold_changed(amount: int)
signal lives_changed(amount: int)
signal wave_started(wave_number: int)
signal wave_cleared(wave_number: int)
signal run_over()
signal kill_registered()
signal boss_health_changed(hp: int, max_hp: int)
signal boss_cleared()
signal game_started()

const DIFFICULTIES: Array = [
	{name="Easy",   hp=0.65, spd=0.88, reward=1.40, lives=25},
	{name="Normal", hp=1.00, spd=1.00, reward=1.00, lives=20},
	{name="Hard",   hp=1.52, spd=1.28, reward=0.75, lives=12},
]

var gold: int         = 100
var lives: int        = 20
var wave_number: int  = 0
var kills: int        = 0
var wave_kills: int   = 0
var high_score: int   = 0
var state: String     = "idle"
var selected_map: int = 0
var difficulty: int   = 1

func _ready() -> void:
	lives = DIFFICULTIES[difficulty].lives
	_load_high_score()

func diff() -> Dictionary:
	return DIFFICULTIES[difficulty]

func add_gold(amount: int) -> void:
	gold += amount
	gold_changed.emit(gold)

func spend_gold(amount: int) -> bool:
	if gold < amount: return false
	gold -= amount
	gold_changed.emit(gold)
	return true

func add_kill() -> void:
	kills += 1
	wave_kills += 1
	kill_registered.emit()

func lose_life(amount: int = 1) -> void:
	lives -= amount
	lives_changed.emit(lives)
	if lives <= 0:
		state = "over"
		_save_high_score()
		run_over.emit()

func start_wave() -> void:
	wave_number += 1
	wave_kills = 0
	state = "wave"
	wave_started.emit(wave_number)

func clear_wave() -> void:
	state = "shop"
	wave_cleared.emit(wave_number)

func report_boss_health(hp: int, max_hp: int) -> void:
	boss_health_changed.emit(hp, max_hp)

func report_boss_cleared() -> void:
	boss_cleared.emit()

func reset() -> void:
	gold        = 100
	lives       = DIFFICULTIES[difficulty].lives
	wave_number = 0
	kills       = 0
	wave_kills  = 0
	state       = "idle"
	Engine.time_scale = 1.0

func _save_high_score() -> void:
	if wave_number > high_score:
		high_score = wave_number
		var cfg := ConfigFile.new()
		cfg.set_value("scores", "best_wave", high_score)
		cfg.save("user://save.cfg")

func _load_high_score() -> void:
	var cfg := ConfigFile.new()
	if cfg.load("user://save.cfg") == OK:
		high_score = cfg.get_value("scores", "best_wave", 0)
