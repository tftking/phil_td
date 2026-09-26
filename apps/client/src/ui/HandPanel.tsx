import { useEffect } from 'preact/hooks';
import {
  HAND_NAMES,
  SUIT_SYMBOLS,
  cardToString,
  isJoker,
  suitOf,
  towerForHand,
} from '@pokertd/sim';
import {
  counts,
  deal,
  evaluation,
  hand,
  lastEvent,
  lock,
  locked,
  marked,
  nextRedrawCost,
  redraw,
  redrawHint,
  toggle,
} from './localTable';

function CardView({ card, index, scoring }: { card: number; index: number; scoring: boolean }) {
  const joker = isJoker(card);
  const red = !joker && (suitOf(card) === 1 || suitOf(card) === 2);
  const rank = joker ? '🃏' : cardToString(card)[0]!.replace('T', '10');
  const cls = ['card', red && 'red', scoring && 'scoring', marked.value.has(index) && 'marked']
    .filter(Boolean)
    .join(' ');
  return (
    <div class={cls} onClick={() => toggle(index)} title={`${cardToString(card)} (${index + 1})`}>
      <span>{rank}</span>
      {!joker && <span>{SUIT_SYMBOLS[suitOf(card)]}</span>}
    </div>
  );
}

export function HandPanel() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '5') toggle(Number(e.key) - 1);
      else if (e.key === 'd' || e.key === 'D') deal();
      else if (e.key === 'r' || e.key === 'R') redraw();
      else if (e.key === ' ') {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ev = evaluation.value;
  const scoring = new Set(ev?.scoring ?? []);
  const hint = redrawHint.value;
  const c = counts.value;

  return (
    <div class="hand-panel">
      <div class="cards">
        {hand.value.length
          ? hand.value.map((card, i) => (
              <CardView key={i} card={card} index={i} scoring={scoring.has(i)} />
            ))
          : [0, 1, 2, 3, 4].map((i) => <div key={i} class="card empty" />)}
      </div>

      <div class="info">
        {ev ? (
          <>
            <h2>
              {HAND_NAMES[ev.category]} → {towerForHand(ev.category).name}
            </h2>
            <div class="sub">
              {locked.value
                ? `Locked: ${locked.value.hand}`
                : 'Click cards (1–5) to mark for redraw'}
            </div>
            {hint && !locked.value && (
              <div class="odds">
                {(hint.better * 100).toFixed(1)}% to improve{hint.exact ? '' : ' (est.)'}
              </div>
            )}
          </>
        ) : (
          <>
            <h2>Deal a hand</h2>
            <div class="sub">5 cards from your deck. Your best poker hand becomes a tower.</div>
          </>
        )}
      </div>

      <div class="actions">
        <button onClick={deal}>
          Deal<kbd>D</kbd>
        </button>
        <button onClick={redraw} disabled={!marked.value.size || !!locked.value}>
          Redraw {nextRedrawCost.value ? `(${nextRedrawCost.value}g)` : '(free)'}
          <kbd>R</kbd>
        </button>
        <button onClick={lock} disabled={!ev || !!locked.value}>
          Lock<kbd>Space</kbd>
        </button>
      </div>

      <div class="deck">
        <div>
          Draw pile {c.drawPile} · discard {c.discardPile}
          {lastEvent.value && ` · ${lastEvent.value}`}
        </div>
        <div class="suits">
          {c.suits.map((n, s) => (
            <span key={s}>
              {SUIT_SYMBOLS[s]} {n}
            </span>
          ))}
        </div>
        <div>
          {c.ranks
            .map((n, i) => `${'23456789TJQKA'[i]}:${n}`)
            .reverse()
            .join(' ')}
        </div>
      </div>
    </div>
  );
}
