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
var status_label: Label
var rank_label: Label
var placing_label: Label
var discard_count_label: Label
var play_btn: Button
var discard_btn: Button
var game_over_panel: ColorRect

func _ready() -> void:
	layer = 10
	_build_top_bar()
	_build_bottom_bar()
	_connect_gm_signals()
	call_deferred("_connect_card_hand")

func _build_top_bar() -> void:
	var bar := ColorRect.new()
	bar.color = Color(0.04, 0.04, 0.04, 0.80)
	bar.position = Vector2(0, 0)
	bar.size = Vector2(1280, 38)
	add_child(bar)

	lives_label  = _lbl("Lives: 20",  Vector2(12, 9))
	gold_label   = _lbl("Gold: 100",  Vector2(170, 9))
	wave_label   = _lbl("Wave: 0",    Vector2(330, 9))
	status_label = _lbl("",           Vector2(500, 9))
	status_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.25))

func _build_bottom_bar() -> void:
	var bar := ColorRect.new()
	bar.color = Color(0.04, 0.04, 0.04, 0.80)
	bar.position = Vector2(0, 480)
	bar.size = Vector2(1280, 240)
	add_child(bar)

	rank_label = _lbl("Select 5 cards", Vector2(420, 490), 22)
	rank_label.add_theme_color_override("font_color", Color(0.75, 0.75, 0.75))

	placing_label = _lbl("", Vector2(420, 524), 15)
	placing_label.add_theme_color_override("font_color", Color(0.3, 1.0, 0.4))
	placing_label.visible = false

	discard_count_label = _lbl("Discards: 3", Vector2(1040, 492))

	play_btn = _btn("Play Hand", Vector2(1055, 518), Vector2(155, 44))
	play_btn.pressed.connect(_on_play_pressed)
	play_btn.disabled = true

	discard_btn = _btn("Discard", Vector2(1055, 572), Vector2(155, 44))
	discard_btn.pressed.connect(_on_discard_pressed)

	# Game over overlay
	game_over_panel = ColorRect.new()
	game_over_panel.color = Color(0, 0, 0, 0.72)
	game_over_panel.position = Vector2(0, 0)
	game_over_panel.size = Vector2(1280, 720)
	game_over_panel.visible = false
	add_child(game_over_panel)

	var go_lbl := _lbl("GAME OVER", Vector2(490, 290), 52)
	go_lbl.add_theme_color_override("font_color", Color(0.95, 0.2, 0.2))
	game_over_panel.add_child(go_lbl)
	go_lbl.position = Vector2(490, 290)

	var wave_final := _lbl("", Vector2(540, 370), 24)
	wave_final.name = "WaveFinalLabel"
	game_over_panel.add_child(wave_final)

	var restart_btn := _btn("Restart", Vector2(565, 430), Vector2(150, 50))
	restart_btn.pressed.connect(_on_restart_pressed)
	game_over_panel.add_child(restart_btn)

func _connect_gm_signals() -> void:
	GameManager.gold_changed.connect(func(v): gold_label.text = "Gold: %d" % v)
	GameManager.lives_changed.connect(func(v): lives_label.text = "Lives: %d" % v)
	GameManager.wave_started.connect(func(w): wave_label.text = "Wave: %d" % w)
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
			Color(1.0, 0.85, 0.25) if pr > 0 else Color(0.55, 0.55, 0.55))
	else:
		rank_label.text = "Select 5 cards"
		rank_label.add_theme_color_override("font_color", Color(0.75, 0.75, 0.75))

func _on_hand_evaluated(rank: int, _cards: Array) -> void:
	if rank == 0:
		status_label.text = "High card — no placement"
	else:
		status_label.text = ""

func _on_placement_started(tower_lbl: String) -> void:
	placing_label.text = "Place tower: %s   (right-click to cancel)" % tower_lbl
	placing_label.visible = true

func hide_placing_label() -> void:
	placing_label.visible = false

func _on_play_pressed() -> void:
	var ch := _ch()
	if ch and ch.selected.size() == 5:
		ch.evaluate_selected()

func _on_discard_pressed() -> void:
	var ch := _ch()
	if ch: ch.discard_selected()

func _on_run_over() -> void:
	var wfl: Label = game_over_panel.get_node_or_null("WaveFinalLabel")
	if wfl: wfl.text = "Survived %d wave(s)" % GameManager.wave_number
	game_over_panel.visible = true
	play_btn.disabled = true
	discard_btn.disabled = true

func _on_restart_pressed() -> void:
	GameManager.reset()
	get_tree().reload_current_scene()

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
