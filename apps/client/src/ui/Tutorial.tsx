import { signal } from '@preact/signals';
import { HAND_NAMES, towerForHand } from '@pokertd/sim';
import type { LocalLink } from '../net/local';
import { updateSettings } from '../settings';
import { selectedTower, snap, startSolo, towers, toMenu, you } from '../state/store';
import { Btn } from './common';

/**
 * Interactive tutorial: a solo Casual match where the first wave waits until
 * the player has learned the basics. Each step waits for the player to do it.
 */
interface Step {
  text: () => string;
  done?: () => boolean;
}

const STEPS: Step[] = [
  {
    text: () =>
      'Welcome to Poker TD! Creeps walk the brown road toward the red Vault. You stop them with towers, and you get towers by making poker hands.',
  },
  {
    text: () => 'Press D (or the Deal button) to be dealt 5 cards for 50 gold.',
    done: () => !!you.value?.hand,
  },
  {
    text: () => {
      const h = you.value?.hand;
      const cat = h ? HAND_NAMES[h.category as 0] : 'hand';
      const tower = h ? towerForHand(h.category as 0).name : 'tower';
      return `You have ${cat}, which makes a ${tower}. Click cards you don't want (or press 1–5), then press R to redraw them. Your first redraw each hand is free.`;
    },
    done: () =>
      (you.value?.hand?.redrawsUsed ?? 0) > 0 ||
      (you.value?.blueprints.length ?? 0) > 0 ||
      towers.value.length > 0,
  },
  {
    text: () =>
      'Happy with it? Press Space to lock the hand. Better hands make much better towers: a pair is fine, a flush is great.',
    done: () => (you.value?.blueprints.length ?? 0) > 0 || towers.value.length > 0,
  },
  {
    text: () =>
      'Your tower is on the bench. Click a highlighted tile next to the road to place it. Corners cover the most road.',
    done: () => towers.value.length > 0,
  },
  {
    text: () => 'Towers shoot on their own. Deal and place two more before the first wave arrives.',
    done: () => towers.value.length >= 3,
  },
  {
    text: () =>
      'The suit of your scoring cards gives a tower its effect: ♠ pierces armor, ♥ lands critical hits, ♦ earns extra gold, ♣ slows. Click one of your towers to inspect it.',
    done: () => selectedTower.value !== null,
  },
  {
    text: () =>
      'Upgrade strong towers from the inspector. Suit research (right panel) boosts every tower of that suit, so it pays to favor one suit.',
  },
  {
    text: () =>
      'Every 5 waves the Card Shop opens: burn low cards, copy good ones, or buy a Joker to shape your deck. Your deck tracker (bottom right) shows what is left to draw.',
  },
  {
    text: () =>
      'The wave is coming! Survive 40 waves to win. Press H any time for hand rankings. Good luck!',
  },
];

export const tutorialStep = signal<number | null>(null);
let link: LocalLink | null = null;

export function startTutorial(): void {
  link = startSolo({ map: 'felt', difficulty: 'casual', allies: [] });
  link.onReplay = null;
  link.holdWaves = true;
  tutorialStep.value = 0;
}

function advance(): void {
  const next = (tutorialStep.value ?? 0) + 1;
  if (next >= STEPS.length) {
    tutorialStep.value = null;
    if (link) link.holdWaves = false;
    updateSettings({ tutorialDone: true });
    return;
  }
  tutorialStep.value = next;
  // Release the first wave once the player has a few towers down.
  if (next >= 6 && link) link.holdWaves = false;
}

export function TutorialOverlay() {
  const i = tutorialStep.value;
  void snap.value;
  if (i === null) return null;
  const step = STEPS[i]!;
  if (step.done?.()) {
    queueMicrotask(() => {
      if (tutorialStep.value === i) advance();
    });
  }
  return (
    <div class="tutorial" role="dialog" aria-label="Tutorial">
      <div class="step">
        {i + 1}/{STEPS.length}
      </div>
      <p>{step.text()}</p>
      <div class="row">
        {!step.done && (
          <Btn kind="primary" onClick={advance}>
            {i === STEPS.length - 1 ? 'Play' : 'Next'}
          </Btn>
        )}
        {step.done && (
          <Btn kind="ghost" onClick={advance}>
            Skip step
          </Btn>
        )}
        <Btn
          kind="ghost"
          onClick={() => {
            tutorialStep.value = null;
            if (link) link.holdWaves = false;
            updateSettings({ tutorialDone: true });
            toMenu();
          }}
        >
          Quit tutorial
        </Btn>
      </div>
    </div>
  );
}
