extends Node2D

const CELL_SIZE: int = 48
const COLS: int      = 20
const ROWS: int      = 10

var path_cells: Array[Vector2i] = []
var path_set: Dictionary        = {}
var world_path: Array[Vector2]  = []
var tower_slots: Dictionary     = {}

var hover_cell: Vector2i    = Vector2i(-1, -1)
var placement_mode: bool    = false
var _sell_flash_cell: Vector2i = Vector2i(-1, -1)
var _sell_flash_timer: float   = 0.0
const SELL_FLASH_DUR: float    = 0.35

signal path_ready(world_path: Array)

func _ready() -> void:
	rebuild_for_map(GameManager.selected_map)

func rebuild_for_map(map_idx: int) -> void:
	path_cells.clear()
	path_set.clear()
	world_path.clear()
	# Note: does NOT clear tower_slots (call separately if needed)
	_build_path(map_idx)
	queue_redraw()
	path_ready.emit(world_path)

func _build_path(map_idx: int) -> void:
	var cells: Array[Vector2i] = []
	match map_idx:
		0: # Valley — S-curve
			for x in range(0, 5):    cells.append(Vector2i(x, 5))
			for y in range(4, 0, -1): cells.append(Vector2i(4, y))
			for x in range(5, 16):   cells.append(Vector2i(x, 1))
			for y in range(2, 9):    cells.append(Vector2i(15, y))
			for x in range(16, 20):  cells.append(Vector2i(x, 8))
		1: # Gauntlet — double U
			for x in range(0, 18):      cells.append(Vector2i(x, 1))
			for y in range(2, 6):        cells.append(Vector2i(17, y))
			for x in range(16, 1, -1):   cells.append(Vector2i(x, 5))
			for y in range(6, 9):        cells.append(Vector2i(2, y))
			for x in range(3, 20):       cells.append(Vector2i(x, 8))
		2: # Maze — four-turn winding
			for x in range(0, 7):        cells.append(Vector2i(x, 4))
			for y in range(3, 0, -1):    cells.append(Vector2i(6, y))
			for x in range(7, 14):       cells.append(Vector2i(x, 1))
			for y in range(2, 9):        cells.append(Vector2i(13, y))
			for x in range(12, 6, -1):   cells.append(Vector2i(x, 8))
			for y in range(7, 4, -1):    cells.append(Vector2i(7, y))
			for x in range(8, 20):       cells.append(Vector2i(x, 5))

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
				var has_tower := tower_slots.get(cell) != null
				if has_tower:
					draw_rect(rect, Color(0.82, 0.72, 0.08, 0.90))  # yellow = upgrade
				elif is_valid_cell(cell):
					draw_rect(rect, Color(0.25, 0.65, 0.25, 0.88))  # green = place
				else:
					draw_rect(rect, Color(0.65, 0.22, 0.22, 0.88))  # red = invalid
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

	if world_path.size() > 0:
		_draw_portal(world_path[0],  Color(0.15, 0.95, 0.30))
		_draw_portal(world_path[-1], Color(0.95, 0.20, 0.20))

	# Sell flash
	if _sell_flash_timer > 0.0:
		var t := _sell_flash_timer / SELL_FLASH_DUR
		var fc := Rect2(_sell_flash_cell.x * CELL_SIZE, _sell_flash_cell.y * CELL_SIZE,
			CELL_SIZE, CELL_SIZE)
		draw_rect(fc, Color(0.25, 1.0, 0.4, t * 0.55))

var _portal_angle: float = 0.0

func _process(delta: float) -> void:
	if _sell_flash_timer > 0.0:
		_sell_flash_timer -= delta
		queue_redraw()
	_portal_angle += delta * 1.8
	if world_path.size() > 0:
		queue_redraw()

func _draw_portal(center: Vector2, col: Color) -> void:
	draw_circle(center, 14, col.darkened(0.55))
	draw_arc(center, 14, 0, TAU, 24, col, 2.5)
	# Rotating inner ring
	var r2: float = 9.0
	for i in 4:
		var a := _portal_angle + (TAU / 4.0) * i
		var p := center + Vector2(cos(a), sin(a)) * r2
		draw_circle(p, 2.5, col.lightened(0.3))

func flash_sell(cell: Vector2i) -> void:
	_sell_flash_cell  = cell
	_sell_flash_timer = SELL_FLASH_DUR
	queue_redraw()
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

func is_path_cell(cell: Vector2i) -> bool:
	return path_set.has(cell)

func can_place_tower(cell: Vector2i) -> bool:
	if not is_valid_cell(cell): return false
	if is_path_cell(cell): return false
	if tower_slots.get(cell) != null: return false
	return true

func place_tower(cell: Vector2i, tower: Node) -> void:
	tower_slots[cell] = tower
	queue_redraw()

func remove_tower(cell: Vector2i) -> void:
	tower_slots.erase(cell)
	queue_redraw()
