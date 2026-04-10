extends CanvasLayer

const CARD_W: int   = 72
const CARD_H: int   = 104
const CARD_GAP: int = 8
const CARD_Y: int   = 500
const LIFT: int     = 18
const HOVER_LIFT: int = 8

const SUIT_SYMS: Array = ["♣", "♦", "♥", "♠"]
const SUIT_COLS: Array = [
	Color(0.07, 0.07, 0.07),
	Color(0.78, 0.08, 0.08),
	Color(0.78, 0.08, 0.08),
	Color(0.07, 0.07, 0.07),
]
const RANK_STRS: Dictionary = {
	2:"2", 3:"3", 4:"4", 5:"5", 6:"6", 7:"7",
	8:"8", 9:"9", 10:"10", 11:"J", 12:"Q", 13:"K", 14:"A"
}

# Colors for selected border per suit
const SUIT_SEL_COLS: Array = [
	Color(0.30, 0.30, 0.90),   # clubs  — blue
	Color(0.90, 0.15, 0.15),   # diamonds — red
	Color(0.90, 0.15, 0.15),   # hearts — red
	Color(0.30, 0.30, 0.90),   # spades — blue
]

var control: Control
var font: Font
var card_rects: Array = []
var hover_index: int  = -1

# Hand history ring buffer (last 4 hands)
var hand_history: Array = []   # [{name, color}]
var history_label: Label

func _ready() -> void:
	layer = 5
	process_mode = Node.PROCESS_MODE_ALWAYS
	font = ThemeDB.fallback_font

	control = Control.new()
	control.set_anchors_preset(Control.PRESET_FULL_RECT)
	control.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(control)

	control.draw.connect(_on_draw)
	control.gui_input.connect(_on_gui_input)
	control.mouse_exited.connect(func(): _set_hover(-1))

	# Selection count label
	var sel_lbl_node := Label.new()
	sel_lbl_node.name = "SelLabel"
	sel_lbl_node.position = Vector2(20, 490)
	sel_lbl_node.add_theme_font_size_override("font_size", 13)
	sel_lbl_node.add_theme_color_override("font_color", Color(0.62, 0.62, 0.62))
	add_child(sel_lbl_node)

	# Hand history label
	history_label = Label.new()
	history_label.position = Vector2(20, 610)
	history_label.add_theme_font_size_override("font_size", 12)
	history_label.add_theme_color_override("font_color", Color(0.55, 0.55, 0.55))
	add_child(history_label)

	# Deck remaining label
	var deck_lbl := Label.new()
	deck_lbl.name = "DeckLabel"
	deck_lbl.position = Vector2(1140, 490)
	deck_lbl.add_theme_font_size_override("font_size", 13)
	deck_lbl.add_theme_color_override("font_color", Color(0.52, 0.52, 0.52))
	add_child(deck_lbl)

	call_deferred("_connect_card_hand")

func _connect_card_hand() -> void:
	var ch := get_node_or_null("/root/Main/CardHand")
	if ch:
		ch.hand_updated.connect(_on_hand_updated)
		ch.hand_evaluated.connect(_on_hand_evaluated)

func _on_hand_updated(hand: Array) -> void:
	control.queue_redraw()
	var ch := get_node_or_null("/root/Main/CardHand")
	var sel_lbl: Label = get_node_or_null("SelLabel")
	if sel_lbl and ch:
		var n := ch.selected.size()
		sel_lbl.text = "%d / 5 selected" % n if n > 0 else ""
	var deck_lbl: Label = get_node_or_null("DeckLabel")
	if deck_lbl and ch:
		deck_lbl.text = "Deck: %d" % ch.deck_remaining()

func _on_hand_evaluated(rank: int, _cards: Array) -> void:
	if rank > 0:
		var entry := {
			name  = _rank_name(rank),
			color = _rank_color(rank)
		}
		hand_history.push_front(entry)
		if hand_history.size() > 4:
			hand_history.pop_back()
		_update_history_label()

func _update_history_label() -> void:
	if hand_history.is_empty():
		history_label.text = ""
		return
	var parts: Array = []
	for h in hand_history:
		parts.append(h.name)
	history_label.text = "Recent: " + "  •  ".join(parts)

func _rank_name(r: int) -> String:
	const NAMES = ["High card","Pair","Two pair","Three of a kind",
		"Straight","Flush","Full house","Four of a kind","Straight flush","Royal flush"]
	return NAMES[r] if r < NAMES.size() else "?"

func _rank_color(r: int) -> Color:
	if r >= 7: return Color(1.0, 0.72, 0.08)
	if r >= 5: return Color(0.35, 0.80, 1.0)
	if r >= 3: return Color(0.55, 0.90, 0.55)
	return Color(0.75, 0.75, 0.75)

func _compute_rects(count: int, selected: Array) -> Array:
	var rects := []
	var total_w: int = count * CARD_W + (count - 1) * CARD_GAP
	var start_x: int = (1280 - total_w) / 2
	for i in count:
		var lift := 0
		if i in selected:
			lift = LIFT
		elif i == hover_index:
			lift = HOVER_LIFT
		rects.append(Rect2(start_x + i * (CARD_W + CARD_GAP), CARD_Y - lift, CARD_W, CARD_H))
	return rects

func _on_draw() -> void:
	var ch := get_node_or_null("/root/Main/CardHand")
	if not ch or ch.hand.is_empty(): return
	var hand: Array     = ch.hand
	var selected: Array = ch.selected
	card_rects = _compute_rects(hand.size(), selected)

	for i in hand.size():
		var card: Dictionary = hand[i]
		var rect: Rect2      = card_rects[i]
		var is_sel: bool     = i in selected
		var is_hov: bool     = i == hover_index and not is_sel

		# Shadow
		control.draw_rect(Rect2(rect.position + Vector2(3, 5), rect.size),
			Color(0, 0, 0, 0.38))

		# Body — warm white, golden tint when selected, slight blue on hover
		var body_col: Color
		if is_sel:     body_col = Color(1.0, 0.95, 0.68)
		elif is_hov:   body_col = Color(0.96, 0.96, 1.0)
		else:          body_col = Color(1.0, 0.97, 0.93)
		control.draw_rect(rect, body_col)

		# Border
		var border_col: Color
		var border_w: float
		if is_sel:
			border_col = SUIT_SEL_COLS[card["suit"]]
			border_w   = 2.8
		elif is_hov:
			border_col = Color(0.75, 0.75, 0.95)
			border_w   = 1.8
		else:
			border_col = Color(0.42, 0.42, 0.42)
			border_w   = 1.2
		control.draw_rect(rect, border_col, false, border_w)

		var sc: Color   = SUIT_COLS[card["suit"]]
		var rs: String  = RANK_STRS.get(card["rank"], "?")
		var ss: String  = SUIT_SYMS[card["suit"]]
		var fp: Vector2 = rect.position

		# Top-left rank + suit
		control.draw_string(font, fp + Vector2(5, 20), rs,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 18, sc)
		control.draw_string(font, fp + Vector2(5, 40), ss,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 14, sc)

		# Center large suit
		control.draw_string(font, fp + Vector2(CARD_W * 0.5 - 11, CARD_H * 0.5 + 15), ss,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 28, sc)

		# Bottom-right mirror (rotated via flipped offsets)
		var br := fp + Vector2(CARD_W, CARD_H)
		var rs_w := font.get_string_size(rs, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		var ss_w := font.get_string_size(ss, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		control.draw_string(font, br + Vector2(-rs_w - 5, -10), rs,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 14, sc)
		control.draw_string(font, br + Vector2(-ss_w - 5, -27), ss,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 11, sc)

		# Selected check-mark overlay
		if is_sel:
			control.draw_string(font, fp + Vector2(CARD_W - 18, 17), "✓",
				HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.0, 0.65, 0.0, 0.85))

func _set_hover(idx: int) -> void:
	if hover_index != idx:
		hover_index = idx
		control.queue_redraw()

func _on_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		if event.position.y < 480:
			_set_hover(-1)
			return
		var found := -1
		for i in card_rects.size():
			if card_rects[i].has_point(event.position):
				found = i
				break
		_set_hover(found)

	if event is InputEventMouseButton:
		if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT: return
		if event.position.y < 480: return
		for i in card_rects.size():
			if card_rects[i].has_point(event.position):
				var ch := get_node_or_null("/root/Main/CardHand")
				if ch: ch.toggle_select(i)
				return
