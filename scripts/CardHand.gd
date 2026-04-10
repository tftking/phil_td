extends Node

const SUIT_SYMS: Array = ["♣", "♦", "♥", "♠"]
const RANK_STRS: Dictionary = {
	2:"2", 3:"3", 4:"4", 5:"5", 6:"6", 7:"7",
	8:"8", 9:"9", 10:"10", 11:"J", 12:"Q", 13:"K", 14:"A"
}
const HAND_NAMES: Array = [
	"High card", "Pair", "Two pair", "Three of a kind",
	"Straight", "Flush", "Full house",
	"Four of a kind", "Straight flush", "Royal flush"
]

enum HandRank {
	HIGH_CARD = 0, PAIR = 1, TWO_PAIR = 2, THREE_OF_A_KIND = 3,
	STRAIGHT = 4, FLUSH = 5, FULL_HOUSE = 6,
	FOUR_OF_A_KIND = 7, STRAIGHT_FLUSH = 8, ROYAL_FLUSH = 9
}

var deck: Array = []
var hand: Array = []
var selected: Array = []
var discards_remaining: int = 3
var hand_size: int = 8

signal hand_updated(hand: Array)
signal hand_evaluated(rank: int, cards: Array)

func _ready() -> void:
	_new_deck()

func _new_deck() -> void:
	deck.clear()
	for suit in range(4):
		for rank in range(2, 15):
			deck.append({"suit": suit, "rank": rank})
	deck.shuffle()

func reset_for_wave() -> void:
	discards_remaining = 3
	draw_to_full()

func draw_to_full() -> void:
	while hand.size() < hand_size:
		if deck.is_empty():
			_new_deck()
		hand.append(deck.pop_back())
	hand_updated.emit(hand)

func toggle_select(index: int) -> void:
	if index < 0 or index >= hand.size(): return
	if index in selected:
		selected.erase(index)
	elif selected.size() < 5:
		selected.append(index)
	hand_updated.emit(hand)

func discard_selected() -> void:
	if discards_remaining <= 0 or selected.is_empty(): return
	var to_remove: Array = selected.duplicate()
	to_remove.sort()
	to_remove.reverse()
	for i in to_remove:
		hand.remove_at(i)
	selected.clear()
	discards_remaining -= 1
	draw_to_full()

func evaluate_selected() -> int:
	if selected.size() != 5: return HandRank.HIGH_CARD
	var cards: Array = selected.map(func(i): return hand[i])
	var rank: int = evaluate(cards)
	var to_remove: Array = selected.duplicate()
	to_remove.sort()
	to_remove.reverse()
	for i in to_remove:
		hand.remove_at(i)
	selected.clear()
	draw_to_full()
	hand_evaluated.emit(rank, cards)
	return rank

func preview_rank() -> int:
	if selected.size() != 5: return -1
	var cards: Array = selected.map(func(i): return hand[i])
	return evaluate(cards)

func evaluate(cards: Array) -> int:
	var ranks: Array = cards.map(func(c): return c.rank)
	var suits: Array = cards.map(func(c): return c.suit)
	ranks.sort()

	var is_flush: bool = suits.count(suits[0]) == 5
	var is_straight: bool = _is_straight(ranks)

	var freq: Dictionary = {}
	for r in ranks:
		freq[r] = freq.get(r, 0) + 1
	var counts: Array = freq.values()
	counts.sort()
	counts.reverse()

	if is_flush and is_straight:
		return HandRank.ROYAL_FLUSH if (ranks[0] == 10 and ranks[4] == 14) else HandRank.STRAIGHT_FLUSH
	if counts[0] == 4: return HandRank.FOUR_OF_A_KIND
	if counts[0] == 3 and counts[1] == 2: return HandRank.FULL_HOUSE
	if is_flush: return HandRank.FLUSH
	if is_straight: return HandRank.STRAIGHT
	if counts[0] == 3: return HandRank.THREE_OF_A_KIND
	if counts[0] == 2 and counts[1] == 2: return HandRank.TWO_PAIR
	if counts[0] == 2: return HandRank.PAIR
	return HandRank.HIGH_CARD

func _is_straight(sorted_ranks: Array) -> bool:
	if sorted_ranks == [2, 3, 4, 5, 14]: return true  # wheel
	for i in range(1, sorted_ranks.size()):
		if sorted_ranks[i] - sorted_ranks[i - 1] != 1:
			return false
	return true

static func hand_name(rank: int) -> String:
	if rank < 0 or rank >= HAND_NAMES.size(): return "Unknown"
	return HAND_NAMES[rank]
