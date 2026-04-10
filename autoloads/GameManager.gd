extends Node

signal gold_changed(amount: int)
signal lives_changed(amount: int)
signal wave_started(wave_number: int)
signal wave_cleared(wave_number: int)
signal run_over()
signal run_won()
signal kill_registered()
signal boss_health_changed(hp: int, max_hp: int)
signal boss_cleared()
signal game_started()
signal modifier_rolled(modifier: Dictionary)
signal tower_count_changed(count: int)
signal score_changed(score: int)

const WIN_WAVE: int = 30

var score: int = 0

const DIFFICULTIES: Array = [
	{name="Easy",   hp=0.65, spd=0.88, reward=1.40, lives=25},
	{name="Normal", hp=1.00, spd=1.00, reward=1.00, lives=20},
	{name="Hard",   hp=1.52, spd=1.28, reward=0.75, lives=12},
]

const MODIFIERS: Array = [
	{id="swarm",    label="Swarm!",       desc="+50% more enemies",       color=Color(0.9,0.5,0.1)},
	{id="fast",     label="Speed surge",  desc="All enemies +40% faster", color=Color(0.3,0.9,0.9)},
	{id="armored",  label="Armored wave", desc="+60% enemy HP",           color=Color(0.5,0.5,0.9)},
	{id="goldless", label="Dry spell",    desc="Enemies drop no gold",    color=Color(0.8,0.2,0.2)},
	{id="none",     label="Clear skies",  desc="Standard wave",           color=Color(0.4,0.8,0.4)},
	{id="none",     label="Clear skies",  desc="Standard wave",           color=Color(0.4,0.8,0.4)},
]

var gold: int          = 100
var lives: int         = 20
var wave_number: int   = 0
var kills: int         = 0
var wave_kills: int    = 0
var high_score: int    = 0
var state: String      = "idle"
var selected_map: int  = 0
var difficulty: int    = 1
var active_modifier: Dictionary = {}
var volume_db: float   = 0.0
var fullscreen: bool   = false
var tower_count: int   = 0

# Run stats
var stat_hands_played:  int = 0
var stat_gold_earned:   int = 0
var stat_towers_placed: int = 0
var stat_high_cards:    int = 0
var perfect_streak:     int = 0   # consecutive waves with no leaks
var _leaked_this_wave:  bool = false

func _ready() -> void:
	lives = DIFFICULTIES[difficulty].lives
	_load_high_score()

func diff() -> Dictionary:
	return DIFFICULTIES[difficulty]

func roll_modifier() -> Dictionary:
	active_modifier = MODIFIERS[randi() % MODIFIERS.size()].duplicate()
	modifier_rolled.emit(active_modifier)
	return active_modifier

func apply_high_card_penalty() -> void:
	stat_high_cards += 1
	if gold >= 5:
		spend_gold(5)
	else:
		lose_life()

func add_gold(amount: int) -> void:
	gold += amount
	if amount > 0:
		stat_gold_earned += amount
	gold_changed.emit(gold)

func spend_gold(amount: int) -> bool:
	if gold < amount: return false
	gold -= amount
	gold_changed.emit(gold)
	return true

func add_kill() -> void:
	kills += 1
	wave_kills += 1
	# Score = kills weighted by wave number and difficulty
	var pts := wave_number * DIFFICULTIES[difficulty].hp
	score += int(pts)
	score_changed.emit(score)
	kill_registered.emit()

func lose_life(amount: int = 1) -> void:
	lives -= amount
	_leaked_this_wave = true
	lives_changed.emit(lives)
	if lives <= 0:
		state = "over"
		_save_high_score()
		run_over.emit()

func start_wave() -> void:
	wave_number += 1
	wave_kills   = 0
	_leaked_this_wave = false
	active_modifier = {}
	state = "wave"
	wave_started.emit(wave_number)

func clear_wave() -> void:
	if not _leaked_this_wave:
		perfect_streak += 1
	else:
		perfect_streak = 0
	state = "shop"
	wave_cleared.emit(wave_number)
	if wave_number >= WIN_WAVE:
		_save_high_score()
		run_won.emit()

func report_boss_health(hp: int, max_hp: int) -> void:
	boss_health_changed.emit(hp, max_hp)

func report_boss_cleared() -> void:
	boss_cleared.emit()

func add_tower() -> void:
	tower_count += 1
	stat_towers_placed += 1
	tower_count_changed.emit(tower_count)

func remove_tower() -> void:
	tower_count = max(0, tower_count - 1)
	tower_count_changed.emit(tower_count)

func record_hand_played() -> void:
	stat_hands_played += 1

func apply_volume(db: float) -> void:
	volume_db = db
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Master"), db)

func apply_fullscreen(on: bool) -> void:
	fullscreen = on
	DisplayServer.window_set_mode(
		DisplayServer.WINDOW_MODE_FULLSCREEN if on
		else DisplayServer.WINDOW_MODE_WINDOWED)

func reset() -> void:
	gold           = 100
	lives          = DIFFICULTIES[difficulty].lives
	wave_number    = 0
	kills          = 0
	wave_kills     = 0
	tower_count    = 0
	active_modifier = {}
	state          = "idle"
	perfect_streak     = 0
	_leaked_this_wave  = false
	stat_hands_played  = 0
	stat_gold_earned   = 0
	stat_towers_placed = 0
	stat_high_cards    = 0
	score              = 0
	Engine.time_scale  = 1.0

func _save_high_score() -> void:
	if wave_number > high_score:
		high_score = wave_number
	var cfg := ConfigFile.new()
	cfg.set_value("scores",   "best_wave",  high_score)
	cfg.set_value("scores",   "best_score", max(score, _load_best_score()))
	cfg.set_value("settings", "volume_db",  volume_db)
	cfg.set_value("settings", "fullscreen", fullscreen)
	cfg.save("user://save.cfg")

func _load_best_score() -> int:
	var cfg := ConfigFile.new()
	if cfg.load("user://save.cfg") == OK:
		return cfg.get_value("scores", "best_score", 0)
	return 0

func _load_high_score() -> void:
	var cfg := ConfigFile.new()
	if cfg.load("user://save.cfg") == OK:
		high_score  = cfg.get_value("scores",   "best_wave",  0)
		volume_db   = cfg.get_value("settings", "volume_db",  0.0)
		fullscreen  = cfg.get_value("settings", "fullscreen", false)
		apply_volume(volume_db)
		if fullscreen:
			apply_fullscreen(true)
