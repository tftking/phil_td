extends CanvasLayer

const HAND_NAMES: Array = [
	"High card", "Pair", "Two pair", "Three of a kind",
	"Straight", "Flush", "Full house",
	"Four of a kind", "Straight flush", "Royal flush"
]
const GUIDE: Array = [
	["Pair",          "Archer",  Color(0.35, 0.60, 0.95)],
	["Two pair",      "Double",  Color(0.35, 0.80, 0.50)],
	["Three of kind", "Sniper",  Color(0.68, 0.28, 0.88)],
	["Straight",      "Rapid",   Color(0.95, 0.78, 0.18)],
	["Flush",         "Splash",  Color(0.18, 0.72, 0.88)],
	["Full house",    "Mortar",  Color(0.88, 0.55, 0.18)],
	["Four of kind",  "Laser",   Color(0.95, 0.08, 0.55)],
	["Str. flush",    "Storm",   Color(0.48, 0.08, 0.95)],
	["Royal flush",   "Nuke",    Color(1.00, 0.40, 0.00)],
]
const MAP_NAMES: Array   = ["Valley", "Gauntlet", "Maze"]
const DIFF_NAMES: Array  = ["Easy",   "Normal",   "Hard"]
const DIFF_DESCS: Array  = [
	"0.65x HP  •  25 lives",
	"1.0x HP  •  20 lives",
	"1.52x HP  •  12 lives"
]

# Top bar
var lives_label:  Label
var gold_label:   Label
var wave_label:   Label
var kills_label:  Label
var status_label: Label
var speed_btn:    Button
var speed_val:    float = 1.0

# Boss bar
var boss_bar_panel: ColorRect
var boss_bar:       ProgressBar

# Bottom bar
var rank_label:          Label
var placing_label:       Label
var discard_count_label: Label
var play_btn:    Button
var discard_btn: Button

# Right panel
var enemy_bar:         ProgressBar
var enemy_count_label: Label
var tower_name_lbl:    Label
var tower_dmg_lbl:     Label
var tower_rate_lbl:    Label
var tower_range_lbl:   Label
var tower_splash_lbl:  Label
var tower_sell_lbl:    Label

# Overlays
var wave_announce_label: Label
var countdown_label:     Label
var sell_popup_label:    Label
var income_popup_label:  Label
var penalty_popup_label: Label
var modifier_banner:     ColorRect
var modifier_title_lbl:  Label
var modifier_desc_lbl:   Label
var game_over_panel:     ColorRect
var victory_panel:       ColorRect
var start_screen:        ColorRect
var pause_panel:         ColorRect

# Start-screen selection
var map_btns:  Array = []
var diff_btns: Array = []
var sel_map:   int   = 0
var sel_diff:  int   = 1

func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build_top_bar()
	_build_boss_bar()
	_build_right_panel()
	_build_bottom_bar()
	_build_overlays()
	_build_start_screen()
	_connect_gm_signals()
	call_deferred("_connect_card_hand")

# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------
func _build_top_bar() -> void:
	var bar := ColorRect.new()
	bar.color = Color(0.04, 0.04, 0.04, 0.84)
	bar.position = Vector2(0, 0)
	bar.size = Vector2(1280, 38)
	add_child(bar)
	lives_label  = _lbl("Lives: %d" % GameManager.lives, Vector2(12, 9))
	gold_label   = _lbl("Gold: 100",  Vector2(165, 9))
	wave_label   = _lbl("Wave: 0",    Vector2(318, 9))
	kills_label  = _lbl("Kills: 0",   Vector2(468, 9))
	var tl := _lbl("Towers: 0", Vector2(590, 9))
	tl.name = "TowersLabel"
	status_label = _lbl("",           Vector2(720, 9))
	status_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.25))
	speed_btn = _btn("2x", Vector2(900, 3), Vector2(54, 30))
	speed_btn.pressed.connect(_on_speed_toggle)

func _build_boss_bar() -> void:
	boss_bar_panel = ColorRect.new()
	boss_bar_panel.color = Color(0.10, 0.02, 0.12, 0.92)
	boss_bar_panel.position = Vector2(270, 40)
	boss_bar_panel.size = Vector2(418, 28)
	boss_bar_panel.visible = false
	add_child(boss_bar_panel)
	var bl := _lbl("BOSS", Vector2(278, 46), 12)
	bl.add_theme_color_override("font_color", Color(0.9, 0.4, 1.0))
	boss_bar = ProgressBar.new()
	boss_bar.position = Vector2(322, 46)
	boss_bar.size = Vector2(358, 16)
	boss_bar.max_value = 1
	boss_bar.value = 1
	add_child(boss_bar)

func _build_right_panel() -> void:
	var panel := ColorRect.new()
	panel.color = Color(0.055, 0.055, 0.055, 0.90)
	panel.position = Vector2(963, 40)
	panel.size = Vector2(315, 438)
	add_child(panel)
	var px: float = 978.0
	_lbl("Wave progress", Vector2(px, 54), 13).add_theme_color_override("font_color", Color(0.50, 0.50, 0.50))
	enemy_bar = ProgressBar.new()
	enemy_bar.position = Vector2(px, 72)
	enemy_bar.size = Vector2(285, 18)
	enemy_bar.max_value = 1
	enemy_bar.value = 0
	add_child(enemy_bar)
	enemy_count_label = _lbl("Waiting…", Vector2(px, 96), 12)
	enemy_count_label.add_theme_color_override("font_color", Color(0.62, 0.62, 0.62))
	_sep(px, 116, 285)
	_lbl("Tower info", Vector2(px, 126), 13).add_theme_color_override("font_color", Color(0.50, 0.50, 0.50))
	_lbl("Hover=inspect  Right-click=sell  Mid=target", Vector2(px, 144), 10).add_theme_color_override("font_color", Color(0.36, 0.36, 0.36))
	tower_name_lbl   = _lbl("—",  Vector2(px, 163), 17)
	tower_dmg_lbl    = _lbl("",   Vector2(px, 186), 12)
	tower_rate_lbl   = _lbl("",   Vector2(px + 148, 186), 12)
	tower_range_lbl  = _lbl("",   Vector2(px, 203), 12)
	tower_splash_lbl = _lbl("",   Vector2(px + 148, 203), 12)
	tower_sell_lbl   = _lbl("",   Vector2(px, 220), 12)
	for l in [tower_dmg_lbl, tower_rate_lbl, tower_range_lbl, tower_splash_lbl, tower_sell_lbl]:
		l.add_theme_color_override("font_color", Color(0.68, 0.68, 0.68))
	_sep(px, 240, 285)
	_lbl("Hand → Tower", Vector2(px, 250), 12).add_theme_color_override("font_color", Color(0.50, 0.50, 0.50))
	for i in GUIDE.size():
		var row: Array = GUIDE[i]
		var gl := _lbl("%-16s %s" % [row[0], row[1]], Vector2(px, 265 + i * 17), 11)
		gl.add_theme_color_override("font_color", row[2].lightened(0.2))

	var sep2_y: float = 265.0 + GUIDE.size() * 17.0 + 4.0
	_sep(px, sep2_y, 285)
	_lbl("♥+rate  ♦+dmg  ♠+range  ♣+splash  (flush bonus)", Vector2(px, sep2_y + 8), 10).add_theme_color_override("font_color", Color(0.48,0.48,0.48))
	_lbl("Blue tint=slow   Green tint=poison", Vector2(px, sep2_y + 22), 10).add_theme_color_override("font_color", Color(0.45,0.45,0.45))

func _build_bottom_bar() -> void:
	var bar := ColorRect.new()
	bar.color = Color(0.04, 0.04, 0.04, 0.84)
	bar.position = Vector2(0, 480)
	bar.size = Vector2(1280, 240)
	add_child(bar)
	rank_label = _lbl("Select 5 cards", Vector2(30, 492), 22)
	rank_label.add_theme_color_override("font_color", Color(0.68, 0.68, 0.68))
	placing_label = _lbl("", Vector2(30, 528), 15)
	placing_label.add_theme_color_override("font_color", Color(0.22, 1.0, 0.38))
	placing_label.visible = false
	_lbl("Yellow=upgrade  •  Right-click=sell  •  Mid=cycle target  •  1-8 select cards  •  Space=play  •  D=discard", Vector2(30, 556), 11).add_theme_color_override("font_color", Color(0.38, 0.38, 0.38))
	discard_count_label = _lbl("Discards: 3", Vector2(1040, 492))
	play_btn = _btn("Play Hand", Vector2(1055, 518), Vector2(155, 44))
	play_btn.pressed.connect(_on_play_pressed)
	play_btn.disabled = true
	discard_btn = _btn("Discard", Vector2(1055, 572), Vector2(155, 44))
	discard_btn.pressed.connect(_on_discard_pressed)

func _build_overlays() -> void:
	wave_announce_label = _lbl("", Vector2(380, 185), 62)
	wave_announce_label.add_theme_color_override("font_color", Color(1.0, 0.88, 0.28))
	wave_announce_label.modulate.a = 0.0

	countdown_label = _lbl("", Vector2(380, 160), 32)
	countdown_label.add_theme_color_override("font_color", Color(0.88, 0.88, 0.88))
	countdown_label.visible = false
	countdown_label.autowrap_mode = TextServer.AUTOWRAP_WORD

	sell_popup_label = _lbl("", Vector2(590, 320), 22)
	sell_popup_label.add_theme_color_override("font_color", Color(0.22, 1.0, 0.38))
	sell_popup_label.modulate.a = 0.0

	income_popup_label = _lbl("", Vector2(590, 280), 18)
	income_popup_label.add_theme_color_override("font_color", Color(1.0, 0.88, 0.28))
	income_popup_label.modulate.a = 0.0

	penalty_popup_label = _lbl("", Vector2(530, 240), 18)
	penalty_popup_label.add_theme_color_override("font_color", Color(0.95, 0.25, 0.25))
	penalty_popup_label.modulate.a = 0.0

	# Wave modifier banner
	modifier_banner = ColorRect.new()
	modifier_banner.color = Color(0.06, 0.06, 0.06, 0.88)
	modifier_banner.position = Vector2(280, 68)
	modifier_banner.size = Vector2(400, 52)
	modifier_banner.visible = false
	add_child(modifier_banner)
	modifier_title_lbl = Label.new()
	modifier_title_lbl.position = Vector2(290, 74)
	modifier_title_lbl.add_theme_font_size_override("font_size", 20)
	modifier_title_lbl.add_theme_color_override("font_color", Color.WHITE)
	add_child(modifier_title_lbl)
	modifier_desc_lbl = Label.new()
	modifier_desc_lbl.position = Vector2(290, 97)
	modifier_desc_lbl.add_theme_font_size_override("font_size", 13)
	modifier_desc_lbl.add_theme_color_override("font_color", Color(0.72, 0.72, 0.72))
	add_child(modifier_desc_lbl)

	game_over_panel = ColorRect.new()
	game_over_panel.color = Color(0, 0, 0, 0.80)
	game_over_panel.position = Vector2.ZERO
	game_over_panel.size = Vector2(1280, 720)
	game_over_panel.visible = false
	add_child(game_over_panel)
	var go_lbl := Label.new()
	go_lbl.text = "GAME OVER"
	go_lbl.position = Vector2(418, 228)
	go_lbl.add_theme_font_size_override("font_size", 72)
	go_lbl.add_theme_color_override("font_color", Color(0.95, 0.15, 0.15))
	game_over_panel.add_child(go_lbl)
	var stats_lbl := Label.new()
	stats_lbl.name = "StatsLabel"
	stats_lbl.position = Vector2(418, 330)
	stats_lbl.add_theme_font_size_override("font_size", 22)
	stats_lbl.add_theme_color_override("font_color", Color(0.88, 0.88, 0.88))
	game_over_panel.add_child(stats_lbl)
	var stats2_lbl := Label.new()
	stats2_lbl.name = "Stats2Label"
	stats2_lbl.position = Vector2(418, 362)
	stats2_lbl.add_theme_font_size_override("font_size", 15)
	stats2_lbl.add_theme_color_override("font_color", Color(0.65, 0.65, 0.65))
	game_over_panel.add_child(stats2_lbl)
	var hs_lbl := Label.new()
	hs_lbl.name = "HighScoreLabel"
	hs_lbl.position = Vector2(418, 364)
	hs_lbl.add_theme_font_size_override("font_size", 18)
	hs_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.25))
	game_over_panel.add_child(hs_lbl)
	var restart_btn := _btn("Play Again", Vector2(563, 412), Vector2(154, 52))
	restart_btn.pressed.connect(_on_restart_pressed)
	game_over_panel.add_child(restart_btn)

	# Victory panel
	victory_panel = ColorRect.new()
	victory_panel.color = Color(0.0, 0.06, 0.0, 0.88)
	victory_panel.position = Vector2.ZERO
	victory_panel.size = Vector2(1280, 720)
	victory_panel.visible = false
	add_child(victory_panel)
	var v_title := Label.new()
	v_title.text = "You Win!"
	v_title.position = Vector2(478, 210)
	v_title.add_theme_font_size_override("font_size", 82)
	v_title.add_theme_color_override("font_color", Color(0.25, 1.0, 0.38))
	victory_panel.add_child(v_title)
	var v_sub := Label.new()
	v_sub.text = "Survived all %d waves" % GameManager.WIN_WAVE
	v_sub.position = Vector2(438, 318)
	v_sub.add_theme_font_size_override("font_size", 26)
	v_sub.add_theme_color_override("font_color", Color(0.80, 0.80, 0.80))
	victory_panel.add_child(v_sub)
	var v_stats := Label.new()
	v_stats.name = "VictoryStats"
	v_stats.position = Vector2(438, 360)
	v_stats.add_theme_font_size_override("font_size", 20)
	v_stats.add_theme_color_override("font_color", Color(0.72, 0.72, 0.72))
	victory_panel.add_child(v_stats)
	var v_btn := _btn("Play Again", Vector2(563, 420), Vector2(154, 52))
	v_btn.pressed.connect(_on_restart_pressed)
	victory_panel.add_child(v_btn)
	pause_panel = ColorRect.new()
	pause_panel.color = Color(0, 0, 0, 0.72)
	pause_panel.position = Vector2.ZERO
	pause_panel.size = Vector2(1280, 720)
	pause_panel.visible = false
	add_child(pause_panel)
	var pause_title := Label.new()
	pause_title.text = "Paused"
	pause_title.position = Vector2(540, 278)
	pause_title.add_theme_font_size_override("font_size", 62)
	pause_title.add_theme_color_override("font_color", Color(0.92, 0.92, 0.92))
	pause_panel.add_child(pause_title)
	var resume_btn := Button.new()
	resume_btn.text = "Resume  (ESC)"
	resume_btn.position = Vector2(540, 370)
	resume_btn.size = Vector2(200, 50)
	resume_btn.pressed.connect(func():
		get_node("/root/Main")._toggle_pause())
	pause_panel.add_child(resume_btn)
	var quit_btn := Button.new()
	quit_btn.text = "Quit to Title"
	quit_btn.position = Vector2(540, 432)
	quit_btn.size = Vector2(200, 50)
	quit_btn.pressed.connect(func():
		get_tree().paused = false
		GameManager.reset()
		get_tree().reload_current_scene())
	pause_panel.add_child(quit_btn)

func _build_start_screen() -> void:
	start_screen = ColorRect.new()
	start_screen.color = Color(0.04, 0.06, 0.04, 0.97)
	start_screen.position = Vector2.ZERO
	start_screen.size = Vector2(1280, 720)
	add_child(start_screen)

	var title := Label.new()
	title.text = "Poker  TD"
	title.position = Vector2(438, 72)
	title.add_theme_font_size_override("font_size", 88)
	title.add_theme_color_override("font_color", Color(0.95, 0.82, 0.22))
	start_screen.add_child(title)

	var sub := Label.new()
	sub.text = "Select cards  →  Play hand  →  Place tower  •  Defend the base"
	sub.position = Vector2(272, 188)
	sub.add_theme_font_size_override("font_size", 18)
	sub.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
	start_screen.add_child(sub)

	# Map selection with inline previews
	var map_lbl := Label.new()
	map_lbl.text = "Map"
	map_lbl.position = Vector2(272, 240)
	map_lbl.add_theme_font_size_override("font_size", 15)
	map_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
	start_screen.add_child(map_lbl)
	for i in MAP_NAMES.size():
		var b := Button.new()
		b.text = MAP_NAMES[i]
		b.position = Vector2(272 + i * 170, 264)
		b.size = Vector2(155, 38)
		b.pressed.connect(func(): _select_map(i))
		start_screen.add_child(b)
		map_btns.append(b)
		# Mini map preview below each button
		var preview_script := load("res://scripts/MapPreview.gd")
		if preview_script:
			var prev := Node2D.new()
			prev.set_script(preview_script)
			prev.position = Vector2(272 + i * 170, 308)
			prev.name = "MapPreview%d" % i
			start_screen.add_child(prev)
			prev.set_map(i)

	# Difficulty selection
	var diff_lbl := Label.new()
	diff_lbl.text = "Difficulty"
	diff_lbl.position = Vector2(272, 426)
	diff_lbl.add_theme_font_size_override("font_size", 15)
	diff_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
	start_screen.add_child(diff_lbl)
	for i in DIFF_NAMES.size():
		var b := Button.new()
		b.text = DIFF_NAMES[i]
		b.position = Vector2(272 + i * 170, 450)
		b.size = Vector2(155, 38)
		b.pressed.connect(func(): _select_diff(i))
		start_screen.add_child(b)
		diff_btns.append(b)

	var diff_desc_lbl := Label.new()
	diff_desc_lbl.name = "DiffDescLabel"
	diff_desc_lbl.position = Vector2(272, 496)
	diff_desc_lbl.add_theme_font_size_override("font_size", 13)
	diff_desc_lbl.add_theme_color_override("font_color", Color(0.52, 0.52, 0.52))
	start_screen.add_child(diff_desc_lbl)

	if GameManager.high_score > 0:
		var hs := Label.new()
		hs.text = "Best: Wave %d / %d" % [GameManager.high_score, GameManager.WIN_WAVE]
		hs.position = Vector2(548, 534)
		hs.add_theme_font_size_override("font_size", 17)
		hs.add_theme_color_override("font_color", Color(1.0, 0.82, 0.22))
		start_screen.add_child(hs)

	var start_btn := Button.new()
	start_btn.text = "Start Game"
	start_btn.position = Vector2(560, 562)
	start_btn.size = Vector2(160, 56)
	start_btn.add_theme_font_size_override("font_size", 20)
	start_btn.pressed.connect(_on_start_pressed)
	start_screen.add_child(start_btn)

	# Settings panel at bottom of start screen
	_build_settings_panel(start_screen, 610.0)

	_update_selection_visuals()

func _select_map(idx: int) -> void:
	sel_map = idx
	GameManager.selected_map = idx
	_update_selection_visuals()

func _select_diff(idx: int) -> void:
	sel_diff = idx
	GameManager.difficulty = idx
	GameManager.lives = GameManager.DIFFICULTIES[idx].lives
	lives_label.text = "Lives: %d" % GameManager.lives
	_update_selection_visuals()

func _update_selection_visuals() -> void:
	for i in map_btns.size():
		map_btns[i].modulate = Color.WHITE if i == sel_map else Color(0.55, 0.55, 0.55)
	for i in diff_btns.size():
		diff_btns[i].modulate = Color.WHITE if i == sel_diff else Color(0.55, 0.55, 0.55)
	var ddl: Label = start_screen.get_node_or_null("DiffDescLabel")
	if ddl: ddl.text = DIFF_DESCS[sel_diff]

# ---------------------------------------------------------------------------
# Signal wiring
# ---------------------------------------------------------------------------
func _connect_gm_signals() -> void:
	GameManager.gold_changed.connect(func(v): gold_label.text = "Gold: %d" % v)
	GameManager.lives_changed.connect(func(v): lives_label.text = "Lives: %d" % v)
	GameManager.wave_started.connect(func(w):
		wave_label.text = "Wave: %d/%d" % [w, GameManager.WIN_WAVE])
	GameManager.kill_registered.connect(func(): kills_label.text = "Kills: %d" % GameManager.kills)
	GameManager.tower_count_changed.connect(func(c):
		var tl := get_node_or_null("TowersLabel")
		if tl: tl.text = "Towers: %d" % c)
	GameManager.run_over.connect(_on_run_over)
	GameManager.run_won.connect(func(): show_victory_screen())
	GameManager.wave_cleared.connect(func(_w): status_label.text = "Wave cleared!")
	GameManager.boss_health_changed.connect(func(hp, max_hp):
		boss_bar_panel.visible = true
		boss_bar.max_value = max_hp
		boss_bar.value = hp)
	GameManager.boss_cleared.connect(func():
		var tw := create_tween()
		tw.tween_property(boss_bar_panel, "modulate:a", 0.0, 0.5)
		tw.tween_callback(func():
			boss_bar_panel.visible = false
			boss_bar_panel.modulate.a = 1.0))

func _connect_card_hand() -> void:
	var ch := _ch()
	if ch:
		ch.hand_updated.connect(_on_hand_updated)
		ch.hand_evaluated.connect(_on_hand_evaluated)
	var tp := get_node_or_null("/root/Main/TowerPlacer")
	if tp:
		tp.placement_started.connect(_on_placement_started)

# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------
func _on_hand_updated(_hand: Array) -> void:
	var ch := _ch()
	if not ch: return
	discard_count_label.text = "Discards: %d" % ch.discards_remaining
	discard_btn.disabled = ch.discards_remaining <= 0 or ch.selected.is_empty()
	play_btn.disabled = ch.selected.size() != 5
	var pr: int = ch.preview_rank()
	if pr >= 0:
		rank_label.text = HAND_NAMES[pr]
		rank_label.add_theme_color_override("font_color",
			Color(1.0, 0.85, 0.25) if pr > 0 else Color(0.46, 0.46, 0.46))
	else:
		rank_label.text = "Select 5 cards"
		rank_label.add_theme_color_override("font_color", Color(0.68, 0.68, 0.68))

func _on_hand_evaluated(rank: int, _cards: Array) -> void:
	status_label.text = "" if rank > 0 else "High card — no placement"

func _on_placement_started(tower_lbl: String, suit_bonus: String) -> void:
	var bonus_txt := ("  [%s]" % suit_bonus) if suit_bonus != "" else ""
	placing_label.text = "Placing: %s%s   (ESC / right-click to cancel)" % [tower_lbl, bonus_txt]
	placing_label.visible = true

func hide_placing_label() -> void:
	placing_label.visible = false
	status_label.text = ""

func update_wave_progress(remaining: int, total: int) -> void:
	if total <= 0: return
	enemy_bar.max_value = total
	enemy_bar.value = total - remaining
	enemy_count_label.text = "%d / %d cleared" % [total - remaining, total]

func show_wave_announcement(wave_num: int) -> void:
	wave_announce_label.text = "Wave  %d" % wave_num
	wave_announce_label.modulate.a = 1.0
	wave_announce_label.visible = true
	var tw := create_tween()
	tw.tween_interval(1.0)
	tw.tween_property(wave_announce_label, "modulate:a", 0.0, 0.65)
	tw.tween_callback(func(): wave_announce_label.visible = false)

func run_countdown(wave_num: int = 0, wave_kills_count: int = 0) -> void:
	countdown_label.visible = true
	countdown_label.add_theme_font_size_override("font_size", 22)
	if wave_num > 0:
		countdown_label.text = "Wave %d cleared!   %d kills" % [wave_num, wave_kills_count]
		await get_tree().create_timer(1.2).timeout
	# Show upcoming wave info
	var wm := get_node_or_null("/root/Main/WaveManager")
	if wm:
		var next_num := GameManager.wave_number + 1
		if next_num <= GameManager.WIN_WAVE:
			# Generate a preview of the next wave
			var main := get_node_or_null("/root/Main")
			if main and main.has_method("_generate_wave_fallback"):
				var preview := main._generate_wave_fallback(next_num)
				var summary := wm.get_wave_summary(preview)
				var parts: Array = []
				if summary.normal  > 0: parts.append("%d normal" % summary.normal)
				if summary.runner  > 0: parts.append("%d runner" % summary.runner)
				if summary.armored > 0: parts.append("%d armored" % summary.armored)
				if summary.boss    > 0: parts.append("BOSS")
				countdown_label.text = "Next: Wave %d   %s" % [next_num, "  •  ".join(parts)]
				await get_tree().create_timer(1.0).timeout
	# Countdown
	countdown_label.add_theme_font_size_override("font_size", 72)
	for i in range(3, 0, -1):
		countdown_label.text = str(i)
		await get_tree().create_timer(0.72).timeout
	countdown_label.text = "Go!"
	await get_tree().create_timer(0.48).timeout
	countdown_label.visible = false
	enemy_count_label.text = "Spawning…"
	enemy_bar.value = 0

func show_tower_info(tower: Node) -> void:
	tower_name_lbl.text = tower.tower_label
	tower_name_lbl.add_theme_color_override("font_color", tower.tower_color.lightened(0.3))
	tower_dmg_lbl.text    = "DMG  %d  (%.0f DPS)" % [tower.damage, tower.dps()]
	tower_rate_lbl.text   = "RATE  %.1f/s  [%s]" % [tower.fire_rate,
		tower.PRIORITY_LABELS[tower.targeting_priority]]
	tower_range_lbl.text  = "RANGE  %d" % int(tower.range_radius)
	var splash_txt := ("SPLASH  %d" % int(tower.splash_radius)) if tower.splash_radius > 0 else ""
	var status_txt := ""
	match tower.status_type:
		1: status_txt = "  SLOW"
		2: status_txt = "  POISON"
	tower_splash_lbl.text = splash_txt + status_txt
	var sell_txt := "Sell: +%d gold" % tower.sell_value
	if tower.suit_bonus_label != "":
		sell_txt += "  [%s]" % tower.suit_bonus_label
	tower_sell_lbl.text = sell_txt

func clear_tower_info() -> void:
	tower_name_lbl.text = "—"
	tower_name_lbl.add_theme_color_override("font_color", Color.WHITE)
	for l in [tower_dmg_lbl, tower_rate_lbl, tower_range_lbl, tower_splash_lbl, tower_sell_lbl]:
		l.text = ""

func show_sell_feedback(amount: int) -> void:
	sell_popup_label.text = "+%d gold (sold)" % amount
	sell_popup_label.position = Vector2(560, 330)
	sell_popup_label.modulate.a = 1.0
	sell_popup_label.visible = true
	var tw := create_tween()
	tw.tween_property(sell_popup_label, "position:y", 272.0, 0.75).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(sell_popup_label, "modulate:a", 0.0, 0.75)
	tw.tween_callback(func(): sell_popup_label.visible = false)

func show_income_popup(amount: int) -> void:
	income_popup_label.text = "+%d gold (income)" % amount
	income_popup_label.position = Vector2(560, 290)
	income_popup_label.modulate.a = 1.0
	income_popup_label.visible = true
	var tw := create_tween()
	tw.tween_property(income_popup_label, "position:y", 232.0, 0.9).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(income_popup_label, "modulate:a", 0.0, 0.9)
	tw.tween_callback(func(): income_popup_label.visible = false)

func _on_run_over() -> void:
	Engine.time_scale = 1.0
	speed_val = 1.0
	speed_btn.text = "2x"
	var stats: Label = game_over_panel.get_node_or_null("StatsLabel")
	if stats:
		stats.text = "Wave %d / %d   •   %d kills   •   %s" % [
			GameManager.wave_number, GameManager.WIN_WAVE,
			GameManager.kills,
			GameManager.DIFFICULTIES[GameManager.difficulty].name]
	var stats2: Label = game_over_panel.get_node_or_null("Stats2Label")
	if stats2:
		stats2.text = "%d hands played   •   %d gold earned   •   %d towers built   •   %d high cards" % [
			GameManager.stat_hands_played, GameManager.stat_gold_earned,
			GameManager.stat_towers_placed, GameManager.stat_high_cards]
	var hs_lbl: Label = game_over_panel.get_node_or_null("HighScoreLabel")
	if hs_lbl:
		if GameManager.wave_number >= GameManager.high_score and GameManager.high_score > 0:
			hs_lbl.text = "New best wave!"
			hs_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.25))
		elif GameManager.high_score > 0:
			hs_lbl.text = "Best: Wave %d" % GameManager.high_score
		else:
			hs_lbl.text = ""
	game_over_panel.visible = true
	play_btn.disabled    = true
	discard_btn.disabled = true

func show_pause_screen(show: bool) -> void:
	pause_panel.visible = show

func show_modifier_banner(mod: Dictionary) -> void:
	modifier_title_lbl.text = mod.get("label", "")
	modifier_title_lbl.add_theme_color_override("font_color", mod.get("color", Color.WHITE))
	modifier_desc_lbl.text  = mod.get("desc", "")
	modifier_banner.visible = true
	modifier_banner.modulate.a = 1.0
	var tw := create_tween()
	tw.tween_interval(2.2)
	tw.tween_property(modifier_banner,    "modulate:a", 0.0, 0.5)
	tw.parallel().tween_property(modifier_title_lbl, "modulate:a", 0.0, 0.5)
	tw.parallel().tween_property(modifier_desc_lbl,  "modulate:a", 0.0, 0.5)
	tw.tween_callback(func():
		modifier_banner.visible = false
		modifier_title_lbl.modulate.a = 1.0
		modifier_desc_lbl.modulate.a  = 1.0)

func show_penalty_popup() -> void:
	penalty_popup_label.text = "High card! -5 gold"
	penalty_popup_label.position = Vector2(530, 250)
	penalty_popup_label.modulate.a = 1.0
	penalty_popup_label.visible = true
	var tw := create_tween()
	tw.tween_property(penalty_popup_label, "position:y", 196.0, 0.7).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(penalty_popup_label, "modulate:a", 0.0, 0.7)
	tw.tween_callback(func(): penalty_popup_label.visible = false)

func show_victory_screen() -> void:
	Engine.time_scale = 1.0
	speed_val = 1.0
	speed_btn.text = "2x"
	var vs: Label = victory_panel.get_node_or_null("VictoryStats")
	if vs:
		vs.text = "%d kills   •   %d hands played   •   %d gold earned   •   %s" % [
			GameManager.kills, GameManager.stat_hands_played,
			GameManager.stat_gold_earned,
			GameManager.DIFFICULTIES[GameManager.difficulty].name]
	victory_panel.visible = true
	play_btn.disabled    = true
	discard_btn.disabled = true

func _build_settings_panel(parent: Node, base_y: float) -> void:
	var sp := ColorRect.new()
	sp.color = Color(0.06, 0.06, 0.06, 0.95)
	sp.position = Vector2(272, base_y)
	sp.size = Vector2(448, 140)
	parent.add_child(sp)

	var lbl := Label.new()
	lbl.text = "Settings"
	lbl.position = Vector2(280, base_y + 10)
	lbl.add_theme_font_size_override("font_size", 15)
	lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
	parent.add_child(lbl)

	# Volume
	var vlbl := Label.new()
	vlbl.text = "Volume"
	vlbl.position = Vector2(280, base_y + 36)
	vlbl.add_theme_font_size_override("font_size", 13)
	vlbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.75))
	parent.add_child(vlbl)
	var vslider := HSlider.new()
	vslider.position = Vector2(350, base_y + 36)
	vslider.size     = Vector2(200, 20)
	vslider.min_value = -40.0
	vslider.max_value = 6.0
	vslider.value     = GameManager.volume_db
	vslider.value_changed.connect(func(v): GameManager.apply_volume(v))
	parent.add_child(vslider)

	# Fullscreen
	var fslbl := Label.new()
	fslbl.text = "Fullscreen"
	fslbl.position = Vector2(280, base_y + 72)
	fslbl.add_theme_font_size_override("font_size", 13)
	fslbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.75))
	parent.add_child(fslbl)
	var fsbtn := CheckButton.new()
	fsbtn.button_pressed = GameManager.fullscreen
	fsbtn.position = Vector2(380, base_y + 68)
	fsbtn.toggled.connect(func(v): GameManager.apply_fullscreen(v))
	parent.add_child(fsbtn)

func _on_restart_pressed() -> void:
	GameManager.reset()
	get_tree().reload_current_scene()

func _on_start_pressed() -> void:
	var tw := create_tween()
	tw.tween_property(start_screen, "modulate:a", 0.0, 0.35)
	tw.tween_callback(func(): start_screen.visible = false)
	GameManager.game_started.emit()

func _on_speed_toggle() -> void:
	speed_val = 2.0 if speed_val == 1.0 else 1.0
	Engine.time_scale = speed_val
	speed_btn.text = "1x" if speed_val == 2.0 else "2x"

func _on_play_pressed() -> void:
	var ch := _ch()
	if ch and ch.selected.size() == 5:
		ch.evaluate_selected()

func _on_discard_pressed() -> void:
	var ch := _ch()
	if ch: ch.discard_selected()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
func _ch() -> Node:
	return get_node_or_null("/root/Main/CardHand")

func _sep(x: float, y: float, w: float) -> void:
	var s := ColorRect.new()
	s.color = Color(0.20, 0.20, 0.20)
	s.position = Vector2(x, y)
	s.size = Vector2(w, 1)
	add_child(s)

func _lbl(text: String, pos: Vector2, font_size: int = 16) -> Label:
	var l := Label.new()
	l.text = text
	l.position = pos
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", Color.WHITE)
	add_child(l)
	return l

func _btn(text: String, pos: Vector2, sz: Vector2) -> Button:
	var b := Button.new()
	b.text = text
	b.position = pos
	b.size = sz
	add_child(b)
	return b
