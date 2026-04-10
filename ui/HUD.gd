extends CanvasLayer

const HAND_NAMES: Array = [
	"High card", "Pair", "Two pair", "Three of a kind",
	"Straight", "Flush", "Full house",
	"Four of a kind", "Straight flush", "Royal flush"
]
const TOWER_NAMES: Array = [
	"", "Archer", "Double", "Sniper", "Rapid",
	"Splash", "Mortar", "Laser", "Storm", "Nuke"
]

var lives_label: Label
var gold_label: Label
var wave_label: Label
var kills_label: Label
var status_label: Label
var rank_label: Label
var placing_label: Label
var discard_count_label: Label
var play_btn: Button
var discard_btn: Button
var wave_announce_label: Label
var sell_popup_label: Label
var game_over_panel: ColorRect

func _ready() -> void:
	layer = 10
	_build_top_bar()
	_build_bottom_bar()
	_build_overlays()
	_connect_gm_signals()
	call_deferred("_connect_card_hand")

# ---------------------------------------------------------------------------
# Layout builders
# ---------------------------------------------------------------------------
func _build_top_bar() -> void:
	var bar := ColorRect.new()
	bar.color = Color(0.04, 0.04, 0.04, 0.82)
	bar.position = Vector2(0, 0)
	bar.size = Vector2(1280, 38)
	add_child(bar)

	lives_label  = _lbl("Lives: 20",  Vector2(12, 9))
	gold_label   = _lbl("Gold: 100",  Vector2(170, 9))
	wave_label   = _lbl("Wave: 0",    Vector2(330, 9))
	kills_label  = _lbl("Kills: 0",   Vector2(490, 9))
	status_label = _lbl("",           Vector2(650, 9))
	status_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.25))

func _build_bottom_bar() -> void:
	var bar := ColorRect.new()
	bar.color = Color(0.04, 0.04, 0.04, 0.82)
	bar.position = Vector2(0, 480)
	bar.size = Vector2(1280, 240)
	add_child(bar)

	# Hand rank preview (centre-left)
	rank_label = _lbl("Select 5 cards", Vector2(30, 490), 22)
	rank_label.add_theme_color_override("font_color", Color(0.75, 0.75, 0.75))

	# Placement instruction
	placing_label = _lbl("", Vector2(30, 526), 15)
	placing_label.add_theme_color_override("font_color", Color(0.3, 1.0, 0.4))
	placing_label.visible = false

	# Sell hint (always visible as subtle hint)
	var sell_hint := _lbl("Right-click tower to sell", Vector2(30, 550), 12)
	sell_hint.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))

	# Discard count + buttons (right side)
	discard_count_label = _lbl("Discards: 3", Vector2(1040, 492))

	play_btn = _btn("Play Hand", Vector2(1055, 518), Vector2(155, 44))
	play_btn.pressed.connect(_on_play_pressed)
	play_btn.disabled = true

	discard_btn = _btn("Discard", Vector2(1055, 572), Vector2(155, 44))
	discard_btn.pressed.connect(_on_discard_pressed)

func _build_overlays() -> void:
	# Wave announcement (fades in/out center screen)
	wave_announce_label = _lbl("", Vector2(440, 200), 58)
	wave_announce_label.add_theme_color_override("font_color", Color(1.0, 0.90, 0.30))
	wave_announce_label.modulate.a = 0.0

	# Sell popup (floats up and fades)
	sell_popup_label = _lbl("", Vector2(600, 300), 24)
	sell_popup_label.add_theme_color_override("font_color", Color(0.3, 1.0, 0.4))
	sell_popup_label.modulate.a = 0.0

	# Game over screen
	game_over_panel = ColorRect.new()
	game_over_panel.color = Color(0, 0, 0, 0.75)
	game_over_panel.position = Vector2.ZERO
	game_over_panel.size = Vector2(1280, 720)
	game_over_panel.visible = false
	add_child(game_over_panel)

	var go_lbl := Label.new()
	go_lbl.text = "GAME OVER"
	go_lbl.position = Vector2(450, 250)
	go_lbl.add_theme_font_size_override("font_size", 64)
	go_lbl.add_theme_color_override("font_color", Color(0.95, 0.18, 0.18))
	game_over_panel.add_child(go_lbl)

	var stats_lbl := Label.new()
	stats_lbl.name = "StatsLabel"
	stats_lbl.position = Vector2(430, 345)
	stats_lbl.add_theme_font_size_override("font_size", 22)
	stats_lbl.add_theme_color_override("font_color", Color(0.9, 0.9, 0.9))
	game_over_panel.add_child(stats_lbl)

	var restart_btn := _btn("Play Again", Vector2(565, 420), Vector2(150, 52))
	restart_btn.pressed.connect(_on_restart_pressed)
	game_over_panel.add_child(restart_btn)

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

func _connect_card_hand() -> void:
	var ch := _ch()
	if ch:
		ch.hand_updated.connect(_on_hand_updated)
		ch.hand_evaluated.connect(_on_hand_evaluated)
	var tp := get_node_or_null("/root/Main/TowerPlacer")
	if tp:
		tp.placement_started.connect(_on_placement_started)

# ---------------------------------------------------------------------------
# Hand UI callbacks
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
			Color(1.0, 0.85, 0.25) if pr > 0 else Color(0.52, 0.52, 0.52))
	else:
		rank_label.text = "Select 5 cards"
		rank_label.add_theme_color_override("font_color", Color(0.72, 0.72, 0.72))

func _on_hand_evaluated(rank: int, _cards: Array) -> void:
	if rank == 0:
		status_label.text = "High card — no placement"

func _on_placement_started(tower_lbl: String) -> void:
	placing_label.text = "Placing: %s   (right-click or ESC to cancel)" % tower_lbl
	placing_label.visible = true

func hide_placing_label() -> void:
	placing_label.visible = false
	status_label.text = ""

# ---------------------------------------------------------------------------
# Wave announcement
# ---------------------------------------------------------------------------
func show_wave_announcement(wave_num: int) -> void:
	wave_announce_label.text = "Wave  %d" % wave_num
	wave_announce_label.modulate.a = 1.0
	wave_announce_label.visible = true
	var tw := create_tween()
	tw.tween_interval(1.1)
	tw.tween_property(wave_announce_label, "modulate:a", 0.0, 0.7)
	tw.tween_callback(func(): wave_announce_label.visible = false)

# ---------------------------------------------------------------------------
# Sell feedback
# ---------------------------------------------------------------------------
func show_sell_feedback(gold_amount: int) -> void:
	sell_popup_label.text = "+%d gold" % gold_amount
	sell_popup_label.position = Vector2(590, 320)
	sell_popup_label.modulate.a = 1.0
	sell_popup_label.visible = true
	var tw := create_tween()
	tw.tween_property(sell_popup_label, "position:y", 260.0, 0.8).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(sell_popup_label, "modulate:a", 0.0, 0.8)
	tw.tween_callback(func(): sell_popup_label.visible = false)

# ---------------------------------------------------------------------------
# Game over
# ---------------------------------------------------------------------------
func _on_run_over() -> void:
	var stats: Label = game_over_panel.get_node_or_null("StatsLabel")
	if stats:
		stats.text = "Wave %d  •  %d kills" % [GameManager.wave_number, GameManager.kills]
	game_over_panel.visible = true
	play_btn.disabled = true
	discard_btn.disabled = true

func _on_restart_pressed() -> void:
	GameManager.reset()
	get_tree().reload_current_scene()

# ---------------------------------------------------------------------------
# Button handlers
# ---------------------------------------------------------------------------
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
