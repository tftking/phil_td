extends Node2D

const CELL_SIZE: int = 48
const COLS: int = 20
const ROWS: int = 10

var path_cells: Array[Vector2i] = []
var path_set: Dictionary = {}
var world_path: Array[Vector2] = []
var tower_slots: Dictionary = {}  # Vector2i -> Node

var hover_cell: Vector2i = Vector2i(-1, -1)
var placement_mode: bool = false

signal path_ready(world_path: Array)

func _ready() -> void:
	_build_path()
	queue_redraw()
	path_ready.emit(world_path)

func _build_path() -> void:
	var cells: Array[Vector2i] = []
	# S-curve: enter left at row 5, snake to exit right at row 8
	for x in range(0, 5):
		cells.append(Vector2i(x, 5))
	for y in range(4, 0, -1):
		cells.append(Vector2i(4, y))
	for x in range(5, 16):
		cells.append(Vector2i(x, 1))
	for y in range(2, 9):
		cells.append(Vector2i(15, y))
	for x in range(16, 20):
		cells.append(Vector2i(x, 8))

	path_cells = cells
	for c in cells:
		path_set[c] = true
		world_path.append(cell_to_world(c))

func _draw() -> void:
	for x in COLS:
		for y in ROWS:
			var cell := Vector2i(x, y)
			var rect := Rect2(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
			if path_set.has(cell):
				draw_rect(rect, Color(0.62, 0.48, 0.32))
			elif placement_mode and hover_cell == cell:
				var ok := can_place_tower(cell)
				draw_rect(rect, Color(0.25, 0.65, 0.25, 0.85) if ok else Color(0.65, 0.22, 0.22, 0.85))
			else:
				draw_rect(rect, Color(0.17, 0.36, 0.17))
			draw_rect(rect, Color(0, 0, 0, 0.22), false, 1.0)

	# Direction arrows every 4 path cells
	for i in range(2, path_cells.size() - 1, 4):
		var a := cell_to_world(path_cells[i - 1])
		var b := cell_to_world(path_cells[i])
		var dir  := (b - a).normalized()
		var mid  := (a + b) * 0.5
		var perp := Vector2(-dir.y, dir.x) * 7.0
		draw_colored_polygon(
			[mid + dir * 9.0, mid - dir * 5.0 + perp, mid - dir * 5.0 - perp],
			Color(0.88, 0.78, 0.58, 0.65))

	# Spawn label
	if world_path.size() > 0:
		draw_circle(world_path[0], 10, Color(0.15, 0.82, 0.25))
		draw_arc(world_path[0], 10, 0, TAU, 16, Color(0, 0, 0, 0.4), 1.5)
	# Base label
	if world_path.size() > 0:
		draw_circle(world_path[-1], 10, Color(0.88, 0.18, 0.18))
		draw_arc(world_path[-1], 10, 0, TAU, 16, Color(0, 0, 0, 0.4), 1.5)

func set_hover(cell: Vector2i) -> void:
	if hover_cell != cell:
		hover_cell = cell
		queue_redraw()

func cell_to_world(cell: Vector2i) -> Vector2:
	return Vector2(cell.x * CELL_SIZE + CELL_SIZE * 0.5,
				   cell.y * CELL_SIZE + CELL_SIZE * 0.5)

func world_to_cell(world_pos: Vector2) -> Vector2i:
	return Vector2i(int(world_pos.x / CELL_SIZE), int(world_pos.y / CELL_SIZE))

func is_valid_cell(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.x < COLS and cell.y >= 0 and cell.y < ROWS

func can_place_tower(cell: Vector2i) -> bool:
	if not is_valid_cell(cell): return false
	if path_set.has(cell): return false
	if tower_slots.get(cell) != null: return false
	return true

func place_tower(cell: Vector2i, tower: Node) -> void:
	tower_slots[cell] = tower
	queue_redraw()

func remove_tower(cell: Vector2i) -> void:
	tower_slots.erase(cell)
	queue_redraw()
