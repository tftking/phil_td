extends CanvasLayer

const CARD_W: int   = 72
const CARD_H: int   = 104
const CARD_GAP: int = 8
const CARD_Y: int   = 500
const LIFT: int     = 16

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

var control: Control
var font: Font
var card_rects: Array = []

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

	call_deferred("_connect_card_hand")

func _connect_card_hand() -> void:
	var ch := get_node_or_null("/root/Main/CardHand")
	if ch:
		ch.hand_updated.connect(_on_hand_updated)

func _on_hand_updated(_hand: Array) -> void:
	control.queue_redraw()

func _compute_rects(count: int, selected: Array) -> Array:
	var rects := []
	var total_w: int = count * CARD_W + (count - 1) * CARD_GAP
	var start_x: int = (1280 - total_w) / 2
	for i in count:
		var y: int = CARD_Y - (LIFT if i in selected else 0)
		rects.append(Rect2(start_x + i * (CARD_W + CARD_GAP), y, CARD_W, CARD_H))
	return rects

func _on_draw() -> void:
	var ch := get_node_or_null("/root/Main/CardHand")
	if not ch or ch.hand.is_empty(): return
	var hand: Array   = ch.hand
	var selected: Array = ch.selected
	card_rects = _compute_rects(hand.size(), selected)

	for i in hand.size():
		var card: Dictionary = hand[i]
		var rect: Rect2      = card_rects[i]
		var is_sel: bool     = i in selected

		# Shadow
		control.draw_rect(Rect2(rect.position + Vector2(3, 4), rect.size), Color(0, 0, 0, 0.32))
		# Body
		control.draw_rect(rect, Color(1.0, 0.97, 0.93) if not is_sel else Color(1.0, 0.95, 0.70))
		# Border
		control.draw_rect(rect, Color(0.55, 0.35, 0.0) if is_sel else Color(0.42, 0.42, 0.42), false, 2.5 if is_sel else 1.5)

		var sc: Color   = SUIT_COLS[card["suit"]]
		var rs: String  = RANK_STRS.get(card["rank"], "?")
		var ss: String  = SUIT_SYMS[card["suit"]]
		var fp: Vector2 = rect.position

		# Top-left rank
		control.draw_string(font, fp + Vector2(6, 21), rs,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 18, sc)
		# Top-left suit
		control.draw_string(font, fp + Vector2(6, 42), ss,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 15, sc)
		# Center suit (large)
		control.draw_string(font, fp + Vector2(CARD_W / 2 - 12, CARD_H / 2 + 16), ss,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 28, sc)

func _on_gui_input(event: InputEvent) -> void:
	if not event is InputEventMouseButton: return
	if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT: return
	# Only handle clicks in the card area (below the grid)
	if event.position.y < 480: return
	for i in card_rects.size():
		if card_rects[i].has_point(event.position):
			var ch := get_node_or_null("/root/Main/CardHand")
			if ch: ch.toggle_select(i)
			return
