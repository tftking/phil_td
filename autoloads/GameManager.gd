extends Node

signal gold_changed(amount: int)
signal lives_changed(amount: int)
signal wave_started(wave_number: int)
signal wave_cleared(wave_number: int)
signal run_over()

var gold: int = 100
var lives: int = 20
var wave_number: int = 0
var state: String = "idle"  # idle | wave | shop | over

func add_gold(amount: int) -> void:
	gold += amount
	gold_changed.emit(gold)

func spend_gold(amount: int) -> bool:
	if gold < amount:
		return false
	gold -= amount
	gold_changed.emit(gold)
	return true

func lose_life(amount: int = 1) -> void:
	lives -= amount
	lives_changed.emit(lives)
	if lives <= 0:
		state = "over"
		run_over.emit()

func start_wave() -> void:
	wave_number += 1
	state = "wave"
	wave_started.emit(wave_number)

func clear_wave() -> void:
	state = "shop"
	wave_cleared.emit(wave_number)

func reset() -> void:
	gold = 100
	lives = 20
	wave_number = 0
	state = "idle"
