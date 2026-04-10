extends Node

# Preloaded once at startup, shared across all scripts.
# Access via SceneCache.projectile, SceneCache.float_text, etc.

var projectile:   PackedScene
var float_text:   PackedScene
var death_burst:  PackedScene
var splash_effect: PackedScene

func _ready() -> void:
	projectile    = load("res://scenes/Projectile.tscn")
	float_text    = load("res://scenes/FloatText.tscn")
	death_burst   = load("res://scenes/DeathBurst.tscn")
	splash_effect = load("res://scenes/SplashEffect.tscn")
