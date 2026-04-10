extends Node2D

const CELL: float  = 10.0
const COLS: int    = 20
const ROWS: int    = 10
const MAP_NAMES: Array = ["Valley", "Gauntlet", "Maze"]

var map_index: int = 0
var _path: Array   = []

func set_map(idx: int) -> void:
	map_index = idx
	_path     = _build_path(idx)
	queue_redraw()

func _build_path(idx: int) -> Array:
	var cells: Array = []
	match idx:
		0:
			for x in range(0, 5):   cells.append(Vector2i(x, 5))
			for y in range(4, 0, -1): cells.append(Vector2i(4, y))
			for x in range(5, 16):  cells.append(Vector2i(x, 1))
			for y in range(2, 9):   cells.append(Vector2i(15, y))
			for x in range(16, 20): cells.append(Vector2i(x, 8))
		1:
			for x in range(0, 18):      cells.append(Vector2i(x, 1))
			for y in range(2, 6):        cells.append(Vector2i(17, y))
			for x in range(16, 1, -1):   cells.append(Vector2i(x, 5))
			for y in range(6, 9):        cells.append(Vector2i(2, y))
			for x in range(3, 20):       cells.append(Vector2i(x, 8))
		2:
			for x in range(0, 7):        cells.append(Vector2i(x, 4))
			for y in range(3, 0, -1):    cells.append(Vector2i(6, y))
			for x in range(7, 14):       cells.append(Vector2i(x, 1))
			for y in range(2, 9):        cells.append(Vector2i(13, y))
			for x in range(12, 6, -1):   cells.append(Vector2i(x, 8))
			for y in range(7, 4, -1):    cells.append(Vector2i(7, y))
			for x in range(8, 20):       cells.append(Vector2i(x, 5))
	return cells

func _draw() -> void:
	var w: float = COLS * CELL
	var h: float = ROWS * CELL

	# Background
	draw_rect(Rect2(0, 0, w, h), Color(0.14, 0.28, 0.14))
	draw_rect(Rect2(0, 0, w, h), Color(0.3, 0.3, 0.3, 0.5), false, 1.0)

	# Path
	var path_set: Dictionary = {}
	for c in _path:
		path_set[c] = true
		draw_rect(Rect2(c.x * CELL, c.y * CELL, CELL, CELL), Color(0.62, 0.48, 0.32))

	# Start/end dots
	if _path.size() > 0:
		draw_circle(Vector2(_path[0].x * CELL + CELL * 0.5, _path[0].y * CELL + CELL * 0.5),
			3.5, Color(0.15, 0.9, 0.3))
		draw_circle(Vector2(_path[-1].x * CELL + CELL * 0.5, _path[-1].y * CELL + CELL * 0.5),
			3.5, Color(0.9, 0.2, 0.2))
