# Poker TD

A tower defense game where poker hands determine what towers you place.

## How to open

1. Install Godot 4.2+
2. Open Godot, click "Import"
3. Navigate to this folder and select `project.godot`
4. Hit Play (F5)

No assets needed — everything is drawn in code.

## How to play

- A wave starts automatically
- You hold 8 cards at the bottom of the screen
- **Click cards** to select up to 5
- The hand rank previews in the bottom-left (e.g. "Flush")
- Click **Play Hand** to evaluate
- If rank > High Card, your cursor enters placement mode
- **Click a green cell** on the grid to place the tower
- **Right-click** or **ESC** to cancel placement
- Click **Discard** to swap selected cards (3 discards per wave)
- Survive as many waves as you can

## Hand → Tower mapping

| Hand            | Tower   | Notes                        |
|-----------------|---------|------------------------------|
| High card       | —       | No placement                 |
| Pair            | Archer  | Balanced starter             |
| Two pair        | Double  | Faster fire rate             |
| Three of a kind | Sniper  | Long range, high damage      |
| Straight        | Rapid   | Very fast, short range       |
| Flush           | Splash  | AoE damage                   |
| Full house      | Mortar  | Large AoE, slow              |
| Four of a kind  | Laser   | High single-target DPS       |
| Straight flush  | Storm   | Fast + AoE                   |
| Royal flush     | Nuke    | Massive AoE, game-changer    |

## Architecture

```
autoloads/GameManager.gd    — gold, lives, wave state, signals
scripts/Grid.gd             — draws map, owns path + tower slots
scripts/Enemy.gd            — walks world-space path, draws self
scripts/Tower.gd            — targets enemies, fires projectiles
scripts/Projectile.gd       — homes to target, deals damage
scripts/CardHand.gd         — 52-card deck, draw/discard, evaluation
scripts/WaveManager.gd      — spawns enemies with delay
scripts/TowerPlacer.gd      — placement mode after hand is played
scripts/Main.gd             — wires everything together
ui/HUD.gd                   — top bar + bottom controls
ui/CardHandUI.gd            — draws the 8 card slots
```

## Gemini integration hook

Replace `_generate_wave()` in `Main.gd` with an HTTP request to Gemini.
Pass current wave number + player stats, receive JSON wave config array.
`AIManager` autoload is the right place for the API call.
