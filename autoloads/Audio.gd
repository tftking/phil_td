extends Node

# Procedural audio via AudioStreamGenerator — no audio files needed.
# Each channel is an independent AudioStreamPlayer so sounds don't cancel each other.

var _shoot_player:   AudioStreamPlayer
var _hit_player:     AudioStreamPlayer
var _clear_player:   AudioStreamPlayer
var _sell_player:    AudioStreamPlayer
var _place_player:   AudioStreamPlayer
var _boss_player:    AudioStreamPlayer

const SAMPLE_RATE: float = 22050.0

func _ready() -> void:
	_shoot_player  = _make_player()
	_hit_player    = _make_player()
	_clear_player  = _make_player()
	_sell_player   = _make_player()
	_place_player  = _make_player()
	_boss_player   = _make_player()

var _shoot_cooldown: float = 0.0
const SHOOT_MIN_INTERVAL: float = 0.08

func _process(delta: float) -> void:
	if _shoot_cooldown > 0.0:
		_shoot_cooldown -= delta

func play_shoot() -> void:
	if _shoot_cooldown > 0.0: return
	_shoot_cooldown = SHOOT_MIN_INTERVAL
	_play_tone(_shoot_player, 880.0, 0.04, 0.06, 0.6)

func play_hit() -> void:
	_play_tone(_hit_player, 440.0, 0.055, 0.055, 0.35)

func play_splash() -> void:
	_play_noise(_hit_player, 0.08, 0.28)

func play_wave_clear() -> void:
	_play_arpeggio(_clear_player, [523.0, 659.0, 784.0, 1047.0], 0.09, 0.5)

func play_sell() -> void:
	_play_arpeggio(_sell_player, [784.0, 523.0], 0.08, 0.35)

func play_place() -> void:
	_play_arpeggio(_place_player, [440.0, 660.0], 0.07, 0.45)

func play_boss_spawn() -> void:
	_play_arpeggio(_boss_player, [220.0, 196.0, 165.0], 0.14, 0.65)

func play_boss_dead() -> void:
	_play_arpeggio(_boss_player, [330.0, 494.0, 659.0, 988.0, 1319.0], 0.11, 0.75)

# ---------------------------------------------------------------------------
# Internal synth helpers
# ---------------------------------------------------------------------------
func _make_player() -> AudioStreamPlayer:
	var stream := AudioStreamGenerator.new()
	stream.mix_rate  = SAMPLE_RATE
	stream.buffer_length = 0.5
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.volume_db = -12.0
	add_child(p)
	return p

func _play_tone(player: AudioStreamPlayer, freq: float,
				attack: float, decay: float, vol: float) -> void:
	player.stop()
	player.play()
	var pb := player.get_stream_playback() as AudioStreamGeneratorPlayback
	if pb == null: return
	var total_frames := int((attack + decay) * SAMPLE_RATE)
	var frames_available := pb.get_frames_available()
	var n := mini(total_frames, frames_available)
	for i in n:
		var t := float(i) / SAMPLE_RATE
		var env := 1.0 if t < attack else 1.0 - (t - attack) / decay
		env = clampf(env, 0.0, 1.0)
		var sample := sin(TAU * freq * t) * env * vol
		pb.push_frame(Vector2(sample, sample))

func _play_noise(player: AudioStreamPlayer, duration: float, vol: float) -> void:
	player.stop()
	player.play()
	var pb := player.get_stream_playback() as AudioStreamGeneratorPlayback
	if pb == null: return
	var total_frames := int(duration * SAMPLE_RATE)
	var n := mini(total_frames, pb.get_frames_available())
	for i in n:
		var t   := float(i) / SAMPLE_RATE
		var env := 1.0 - (t / duration)
		var s   := randf_range(-1.0, 1.0) * env * vol
		pb.push_frame(Vector2(s, s))

func _play_arpeggio(player: AudioStreamPlayer, freqs: Array,
					note_dur: float, vol: float) -> void:
	player.stop()
	player.play()
	var pb := player.get_stream_playback() as AudioStreamGeneratorPlayback
	if pb == null: return
	var total_frames := int(note_dur * freqs.size() * SAMPLE_RATE)
	var n := mini(total_frames, pb.get_frames_available())
	for i in n:
		var t       := float(i) / SAMPLE_RATE
		var note_i  := int(t / note_dur)
		if note_i >= freqs.size(): break
		var local_t := fmod(t, note_dur)
		var env     := 1.0 - (local_t / note_dur)
		var s       := sin(TAU * freqs[note_i] * t) * env * vol
		pb.push_frame(Vector2(s, s))

# ---------------------------------------------------------------------------
# Background music — procedural looping bass + melody pattern
# ---------------------------------------------------------------------------
var _music_player: AudioStreamPlayer
var _music_playing: bool = false
const MUSIC_BPM: float   = 118.0
const MUSIC_VOL: float   = -22.0

# C minor pentatonic: C3 D#3 F3 G3 A#3 C4
const BASS_NOTES: Array  = [130.81, 155.56, 174.61, 196.00, 233.08, 261.63]
const MELODY_NOTES: Array = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25, 392.00, 349.23]

func start_music() -> void:
	if _music_playing: return
	_music_playing = true
	_music_player  = _make_player()
	_music_player.volume_db = MUSIC_VOL
	_fill_music_buffer()
	_music_player.finished.connect(_on_music_finished)
	_music_player.play()

func stop_music() -> void:
	_music_playing = false
	if is_instance_valid(_music_player):
		_music_player.stop()

func _on_music_finished() -> void:
	if _music_playing:
		_fill_music_buffer()
		_music_player.play()

func _fill_music_buffer() -> void:
	var beat: float    = 60.0 / MUSIC_BPM
	var bar: float     = beat * 4.0
	var bars: int      = 4
	var total: float   = bar * bars
	var n_frames: int  = int(total * SAMPLE_RATE)

	var stream := AudioStreamGenerator.new()
	stream.mix_rate     = SAMPLE_RATE
	stream.buffer_length = total + 0.1
	_music_player.stream = stream
	_music_player.play()

	var pb := _music_player.get_stream_playback() as AudioStreamGeneratorPlayback
	if pb == null: return

	var available := pb.get_frames_available()
	var to_fill   := mini(n_frames, available)

	for i in to_fill:
		var t    := float(i) / SAMPLE_RATE
		var beat_pos := fmod(t, beat)
		var bar_pos  := fmod(t, bar)
		var sample   := 0.0

		# Bass: root note on every beat, fifth on beat 3
		var beat_idx := int(t / beat) % (bars * 4)
		var bass_note: float
		match beat_idx % 4:
			0: bass_note = BASS_NOTES[0]
			1: bass_note = BASS_NOTES[2]
			2: bass_note = BASS_NOTES[4]
			3: bass_note = BASS_NOTES[1]
			_: bass_note = BASS_NOTES[0]
		var bass_env := 1.0 - clampf(beat_pos / (beat * 0.85), 0.0, 1.0)
		sample += sin(TAU * bass_note * t) * bass_env * 0.30

		# Melody: 8th note pattern cycling through pentatonic
		var eighth := beat * 0.5
		var mel_idx := int(t / eighth) % MELODY_NOTES.size()
		var mel_pos := fmod(t, eighth)
		var mel_env := 1.0 - clampf(mel_pos / (eighth * 0.75), 0.0, 1.0)
		if int(t / eighth) % 3 != 1:  # rest on every 3rd eighth
			sample += sin(TAU * MELODY_NOTES[mel_idx] * t) * mel_env * 0.12

		# Hi-hat click on every half-beat
		var hat_pos := fmod(t, beat * 0.5)
		if hat_pos < 0.018:
			sample += randf_range(-1.0, 1.0) * (1.0 - hat_pos / 0.018) * 0.08

		pb.push_frame(Vector2(sample, sample))
