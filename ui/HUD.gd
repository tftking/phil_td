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
var boss_name_lbl:  Label

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
var game_over_panel:     ColorRect
var start_screen:        ColorRect

func _ready() -> void:
	layer = 10
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
	lives_label  = _lbl("Lives: 20",  Vector2(12, 9))
	gold_label   = _lbl("Gold: 100",  Vector2(165, 9))
	wave_label   = _lbl("Wave: 0",    Vector2(318, 9))
	kills_label  = _lbl("Kills: 0",   Vector2(468, 9))
	status_label = _lbl("",           Vector2(618, 9))
	status_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.25))
	# Speed toggle
	speed_btn = _btn("2x", Vector2(900, 3), Vector2(54, 30))
	speed_btn.pressed.connect(_on_speed_toggle)

func _build_boss_bar() -> void:
	boss_bar_panel = ColorRect.new()
	boss_bar_panel.color = Color(0.10, 0.02, 0.12, 0.92)
	boss_bar_panel.position = Vector2(270, 40)
	boss_bar_panel.size = Vector2(418, 28)
	boss_bar_panel.visible = false
	add_child(boss_bar_panel)

	boss_name_lbl = _lbl("BOSS", Vector2(278, 46), 12)
	boss_name_lbl.add_theme_color_override("font_color", Color(0.9, 0.4, 1.0))

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

	_lbl("Wave progress", Vector2(px, 54), 13).add_theme_color_override("font_color", Color(0.52, 0.52, 0.52))
	enemy_bar = ProgressBar.new()
	enemy_bar.position = Vector2(px, 72)
	enemy_bar.size = Vector2(285, 18)
	enemy_bar.max_value = 1
	enemy_bar.value = 0
	add_child(enemy_bar)
	enemy_count_label = _lbl("Waiting…", Vector2(px, 96), 12)
	enemy_count_label.add_theme_color_override("font_color", Color(0.65, 0.65, 0.65))

	_sep(px, 116, 285)

	_lbl("Tower info", Vector2(px, 126), 13).add_theme_color_override("font_color", Color(0.52, 0.52, 0.52))
	_lbl("Hover a tower  •  right-click to sell", Vector2(px, 144), 11).add_theme_color_override("font_color", Color(0.38, 0.38, 0.38))
	tower_name_lbl   = _lbl("—",  Vector2(px, 163), 17)
	tower_dmg_lbl    = _lbl("",   Vector2(px, 186), 12)
	tower_rate_lbl   = _lbl("",   Vector2(px + 148, 186), 12)
	tower_range_lbl  = _lbl("",   Vector2(px, 203), 12)
	tower_splash_lbl = _lbl("",   Vector2(px + 148, 203), 12)
	tower_sell_lbl   = _lbl("",   Vector2(px, 220), 12)
	for l in [tower_dmg_lbl, tower_rate_lbl, tower_range_lbl, tower_splash_lbl, tower_sell_lbl]:
		l.add_theme_color_override("font_color", Color(0.70, 0.70, 0.70))

	_sep(px, 240, 285)

	_lbl("Hand → Tower", Vector2(px, 250), 13).add_theme_color_override("font_color", Color(0.52, 0.52, 0.52))
	for i in GUIDE.size():
		var row: Array = GUIDE[i]
		var gl := _lbl("%-16s %s" % [row[0], row[1]], Vector2(px, 269 + i * 19), 12)
		gl.add_theme_color_override("font_color", row[2].lightened(0.2))

func _build_bottom_bar() -> void:
	var bar := ColorRect.new()
	bar.color = Color(0.04, 0.04, 0.04, 0.84)
	bar.position = Vector2(0, 480)
	bar.size = Vector2(1280, 240)
	add_child(bar)
	rank_label = _lbl("Select 5 cards", Vector2(30, 492), 22)
	rank_label.add_theme_color_override("font_color", Color(0.70, 0.70, 0.70))
	placing_label = _lbl("", Vector2(30, 528), 15)
	placing_label.add_theme_color_override("font_color", Color(0.22, 1.0, 0.38))
	placing_label.visible = false
	_lbl("Yellow cell = upgrade existing tower", Vector2(30, 556), 12).add_theme_color_override("font_color", Color(0.40, 0.40, 0.40))
	_lbl("Right-click tower to sell", Vector2(30, 574), 12).add_theme_color_override("font_color", Color(0.40, 0.40, 0.40))
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

	countdown_label = _lbl("", Vector2(595, 185), 72)
	countdown_label.add_theme_color_override("font_color", Color(0.92, 0.92, 0.92))
	countdown_label.visible = false

	sell_popup_label = _lbl("", Vector2(590, 320), 22)
	sell_popup_label.add_theme_color_override("font_color", Color(0.22, 1.0, 0.38))
	sell_popup_label.modulate.a = 0.0

	game_over_panel = ColorRect.new()
	game_over_panel.color = Color(0, 0, 0, 0.80)
	game_over_panel.position = Vector2.ZERO
	game_over_panel.size = Vector2(1280, 720)
	game_over_panel.visible = false
	add_child(game_over_panel)

	var go_lbl := Label.new()
	go_lbl.text = "GAME OVER"
	go_lbl.position = Vector2(420, 228)
	go_lbl.add_theme_font_size_override("font_size", 72)
	go_lbl.add_theme_color_override("font_color", Color(0.95, 0.15, 0.15))
	game_over_panel.add_child(go_lbl)

	var stats_lbl := Label.new()
	stats_lbl.name = "StatsLabel"
	stats_lbl.position = Vector2(420, 330)
	stats_lbl.add_theme_font_size_override("font_size", 24)
	stats_lbl.add_theme_color_override("font_color", Color(0.88, 0.88, 0.88))
	game_over_panel.add_child(stats_lbl)

	var hs_lbl := Label.new()
	hs_lbl.name = "HighScoreLabel"
	hs_lbl.position = Vector2(420, 364)
	hs_lbl.add_theme_font_size_override("font_size", 18)
	hs_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.25))
	game_over_panel.add_child(hs_lbl)

	var restart_btn := _btn("Play Again", Vector2(563, 410), Vector2(154, 52))
	restart_btn.pressed.connect(_on_restart_pressed)
	game_over_panel.add_child(restart_btn)

func _build_start_screen() -> void:
	start_screen = ColorRect.new()
	start_screen.color = Color(0.04, 0.06, 0.04, 0.96)
	start_screen.position = Vector2.ZERO
	start_screen.size = Vector2(1280, 720)
	add_child(start_screen)

	var title := Label.new()
	title.text = "Poker TD"
	title.position = Vector2(450, 190)
	title.add_theme_font_size_override("font_size", 82)
	title.add_theme_color_override("font_color", Color(0.95, 0.82, 0.22))
	start_screen.add_child(title)

	var sub := Label.new()
	sub.text = "Build towers with poker hands. Defend the base."
	sub.position = Vector2(340, 298)
	sub.add_theme_font_size_override("font_size", 20)
	sub.add_theme_color_override("font_color", Color(0.70, 0.70, 0.70))
	start_screen.add_child(sub)

	# Quick guide on start screen
	var guide_lbl := Label.new()
	guide_lbl.text = "Select 5 cards  →  Play Hand  →  Click grid to place tower\nRight-click tower to sell  •  Yellow cell = upgrade"
	guide_lbl.position = Vector2(330, 345)
	guide_lbl.add_theme_font_size_override("font_size", 15)
	guide_lbl.add_theme_color_override("font_color", Color(0.52, 0.52, 0.52))
	start_screen.add_child(guide_lbl)

	if GameManager.high_score > 0:
		var hs_lbl := Label.new()
		hs_lbl.text = "Best: Wave %d" % GameManager.high_score
		hs_lbl.position = Vector2(548, 396)
		hs_lbl.add_theme_font_size_override("font_size", 18)
		hs_lbl.add_theme_color_override("font_color", Color(1.0, 0.82, 0.22))
		start_screen.add_child(hs_lbl)

	var start_btn := _btn("Start Game", Vector2(560, 436), Vector2(160, 56))
	start_btn.add_theme_font_size_override("font_size", 20)
	start_btn.pressed.connect(_on_start_pressed)
	start_screen.add_child(start_btn)

# ---------------------------------------------------------------------------
# Signal wiring
# ---------------------------------------------------------------------------
func _connect_gm_signals() -> void:
	GameManager.gold_changed.connect(func(v): gold_label.text = "Gold: %d" % v)
	GameManager.lives_changed.connect(func(v): lives_label.text = "Lives: %d" % v)
	GameManager.wave_started.connect(func(w): wave_label.text = "Wave: %d" % w)
	GameManager.kill_registered.connect(func(): kills_label.text = "Kills: %d" % GameManager.kills)
	GameManager.run_over.connect(_on_run_over)
	GameManager.wave_cleared.connect(func(_w): status_label.text = "Wave cleared!")
	GameManager.boss_health_changed.connect(func(hp, max_hp):
		boss_bar_panel.visible = true
		boss_bar.max_value = max_hp
		boss_bar.value = hp)
	GameManager.boss_cleared.connect(func():
		var tw := create_tween()
		tw.tween_property(boss_bar_panel, "modulate:a", 0.0, 0.5)
		tw.tween_callback(func(): boss_bar_panel.visible = false; boss_bar_panel.modulate.a = 1.0))

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
			Color(1.0, 0.85, 0.25) if pr > 0 else Color(0.48, 0.48, 0.48))
	else:
		rank_label.text = "Select 5 cards"
		rank_label.add_theme_color_override("font_color", Color(0.70, 0.70, 0.70))

func _on_hand_evaluated(rank: int, _cards: Array) -> void:
	status_label.text = "" if rank > 0 else "High card — no placement"

func _on_placement_started(tower_lbl: String) -> void:
	placing_label.text = "Placing: %s   (ESC / right-click to cancel)" % tower_lbl
	placing_label.visible = true

func hide_placing_label() -> void:
	placing_label.visible = false
	status_label.text = ""

func update_wave_progress(remaining: int, total: int) -> void:
	if total <= 0: return
	enemy_bar.max_value = total
	enemy_bar.value = total - remaining
	enemy_count_label.text = "%d / %d enemies cleared" % [total - remaining, total]

func show_wave_announcement(wave_num: int) -> void:
	wave_announce_label.text = "Wave  %d" % wave_num
	wave_announce_label.modulate.a = 1.0
	wave_announce_label.visible = true
	var tw := create_tween()
	tw.tween_interval(1.0)
	tw.tween_property(wave_announce_label, "modulate:a", 0.0, 0.65)
	tw.tween_callback(func(): wave_announce_label.visible = false)

func run_countdown() -> void:
	countdown_label.visible = true
	for i in range(3, 0, -1):
		countdown_label.text = str(i)
		await get_tree().create_timer(0.75).timeout
	countdown_label.text = "Go!"
	await get_tree().create_timer(0.50).timeout
	countdown_label.visible = false
	enemy_count_label.text = "Spawning…"
	enemy_bar.value = 0

func show_tower_info(tower: Node) -> void:
	tower_name_lbl.text = tower.tower_label
	tower_name_lbl.add_theme_color_override("font_color", tower.tower_color.lightened(0.3))
	tower_dmg_lbl.text    = "DMG  %d" % tower.damage
	tower_rate_lbl.text   = "RATE  %.1f/s" % tower.fire_rate
	tower_range_lbl.text  = "RANGE  %d" % int(tower.range_radius)
	tower_splash_lbl.text = ("SPLASH  %d" % int(tower.splash_radius)) if tower.splash_radius > 0 else ""
	tower_sell_lbl.text   = "Sell: +%d gold" % tower.sell_value

func clear_tower_info() -> void:
	tower_name_lbl.text   = "—"
	tower_name_lbl.add_theme_color_override("font_color", Color.WHITE)
	for l in [tower_dmg_lbl, tower_rate_lbl, tower_range_lbl, tower_splash_lbl, tower_sell_lbl]:
		l.text = ""

func show_sell_feedback(amount: int) -> void:
	sell_popup_label.text = "+%d gold" % amount
	sell_popup_label.position = Vector2(590, 330)
	sell_popup_label.modulate.a = 1.0
	sell_popup_label.visible = true
	var tw := create_tween()
	tw.tween_property(sell_popup_label, "position:y", 272.0, 0.75).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(sell_popup_label, "modulate:a", 0.0, 0.75)
	tw.tween_callback(func(): sell_popup_label.visible = false)

func _on_run_over() -> void:
	Engine.time_scale = 1.0
	speed_val = 1.0
	speed_btn.text = "2x"
	var stats: Label = game_over_panel.get_node_or_null("StatsLabel")
	if stats: stats.text = "Wave %d  •  %d kills" % [GameManager.wave_number, GameManager.kills]
	var hs_lbl: Label = game_over_panel.get_node_or_null("HighScoreLabel")
	if hs_lbl:
		hs_lbl.text = ("New best!" if GameManager.wave_number >= GameManager.high_score
			else "Best: Wave %d" % GameManager.high_score)
	game_over_panel.visible = true
	play_btn.disabled = true
	discard_btn.disabled = true

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
