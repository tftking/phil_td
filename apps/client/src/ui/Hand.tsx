import { useMemo, useState } from 'preact/hooks';
import {
  GAME_DATA,
  HAND_NAMES,
  HandCategory,
  Rng,
  SUIT_SYMBOLS,
  cardToString,
  evaluatePlayerHand,
  handPower,
  handSuit,
  redrawOdds,
  towerDef,
  towerForHand,
} from '@pokertd/sim';
import { sfx } from '../audio/sfx';
import { t } from '../i18n/strings';
import { settings } from '../settings';
import { act, deckCards, marked, me, placing, players, you } from '../state/store';
import { Btn, Card, gold } from './common';

const oddsRng = new Rng(Rng.streamState(Date.now() >>> 0, 'client-odds'));

export function toggleCard(i: number): void {
  const hand = you.value?.hand;
  if (!hand || i >= hand.cards.length) return;
  const next = new Set(marked.value);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  marked.value = next;
  sfx.flip();
}

export function redrawMarked(): void {
  const idx = [...marked.value];
  if (idx.length === 0) return;
  act({ t: 'redraw', idx });
  marked.value = new Set();
  sfx.deal();
}

export function deal(): void {
  act({ t: 'deal' });
  sfx.deal();
}

export function lock(): void {
  if (!you.value?.hand) return;
  act({ t: 'lock' });
  sfx.lock();
}

export function HandPanel() {
  const v = you.value;
  const my = me.value;
  const hand = v?.hand ?? null;
  const [slipTo, setSlipTo] = useState('');
  const cost = GAME_DATA.rules.cards.dealCost;
  const keys = settings.value.keys;

  // Estimated chance the marked redraw improves the hand (deck contents are known, order is not).
  const markedKey = [...marked.value].sort().join(',');
  const handKey = hand?.cards.join(',') ?? '';
  const hint = useMemo(() => {
    if (!hand || marked.value.size === 0 || !settings.value.showOdds || hand.cards.length !== 5)
      return null;
    const pool = deckCards.value.length >= marked.value.size ? deckCards.value : [];
    if (pool.length === 0) return null;
    const odds = redrawOdds(hand.cards, [...marked.value], pool, oddsRng, 3000, 20_000);
    return hand.category < HandCategory.FiveOfAKind ? odds.atLeast[hand.category + 1]! : 0;
  }, [handKey, markedKey, deckCards.value]);

  const ev = hand ? evaluatePlayerHand(hand.cards) : null;
  const tower = ev ? towerForHand(ev.category) : null;
  const suit = ev ? handSuit(ev) : null;
  const teammates = players.value.filter((p) => p.id !== my?.id && !p.busted);

  return (
    <div class="hand-panel">
      <div class="cards" role="group" aria-label="Your hand">
        {hand
          ? hand.cards.map((c, i) => (
              <Card
                key={`${i}:${c}`}
                card={c}
                index={i}
                marked={marked.value.has(i)}
                scoring={hand.scoring.includes(i)}
                onClick={() => toggleCard(i)}
              />
            ))
          : [0, 1, 2, 3, 4].map((i) => <div key={i} class="card empty" />)}
      </div>
      <div class="info">
        {ev && tower && suit ? (
          <>
            <h2>
              {HAND_NAMES[ev.category]} → {tower.name}
            </h2>
            <div class="sub">
              power ×{handPower(ev).toFixed(2)} ·{' '}
              <span class={`suit-${suit.suit}`}>{SUIT_SYMBOLS[suit.suit]}</span>
              {suit.pure && ' ×2'} · {marked.value.size ? '' : t('hand.markHint')}
            </div>
            {hint !== null && (
              <div class="odds">≈ {t('hand.improve', { p: (hint * 100).toFixed(1) })}</div>
            )}
          </>
        ) : (
          <>
            <h2>{t('hand.empty')}</h2>
            <div class="sub">{t('hand.emptyHint', { cost })}</div>
          </>
        )}
        {v && v.riverCards > 0 && <div class="notice">{t('hand.river', { n: v.riverCards })}</div>}
        {v && v.slipIncoming !== null && (
          <div class="notice">{t('hand.slipped', { card: cardToString(v.slipIncoming) })}</div>
        )}
      </div>
      <div class="actions">
        {!hand ? (
          <Btn kind="primary" onClick={deal} disabled={!my || my.gold < cost} hotkey={keys.deal}>
            {t('hand.deal')} ({gold(cost)})
          </Btn>
        ) : (
          <>
            <Btn
              onClick={redrawMarked}
              disabled={marked.value.size === 0 || (my?.gold ?? 0) < hand.nextRedrawCost}
              hotkey={keys.redraw}
            >
              {t('hand.redraw')} ({hand.nextRedrawCost ? gold(hand.nextRedrawCost) : t('hand.free')}
              )
            </Btn>
            <Btn kind="primary" onClick={lock} hotkey={keys.lock}>
              {t('hand.lock')}
            </Btn>
            <Btn kind="ghost" onClick={() => act({ t: 'fold' })} hotkey={keys.fold}>
              {t('hand.fold')}
            </Btn>
          </>
        )}
        {hand && v?.canSlip && teammates.length > 0 && marked.value.size === 1 && (
          <div class="slip">
            <select
              value={slipTo}
              onChange={(e) => setSlipTo(e.currentTarget.value)}
              aria-label="Slip to"
            >
              <option value="">{t('coop.slip')}…</option>
              {teammates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Btn
              disabled={!slipTo}
              onClick={() => {
                act({ t: 'slip', card: [...marked.value][0]!, to: slipTo });
                marked.value = new Set();
                setSlipTo('');
              }}
            >
              Slip
            </Btn>
          </div>
        )}
      </div>
      <div class="deck-tracker" aria-label="Deck tracker">
        {v && (
          <>
            <div>
              Draw {v.deck.drawPile} · discard {v.deck.discardPile}
              {v.deck.jokers > 0 && ` · ${v.deck.jokers} Joker`}
            </div>
            <div class="suits">
              {v.deck.suits.map((n, s) => (
                <span key={s} class={`suit-${s}`}>
                  {SUIT_SYMBOLS[s]}
                  {n}
                </span>
              ))}
            </div>
            <div class="ranks">
              {v.deck.ranks
                .map((n, i) => ({ r: '23456789TJQKA'[i]!, n }))
                .reverse()
                .map(({ r, n }) => (
                  <span key={r} class={n === 0 ? 'out' : ''}>
                    {r}
                    <sub>{n}</sub>
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Bench() {
  const v = you.value;
  if (!v) return null;
  return (
    <div class="bench">
      <div class="bench-title">
        {t('bench.title')} {v.blueprints.length}/{v.benchSlots + 1}
      </div>
      {v.blueprints.length === 0 && (
        <div class="hint">Locked hands wait here until you place them.</div>
      )}
      {v.blueprints.map((bp) => {
        const def = towerDef(bp.tower);
        const active = placing.value === bp.id;
        return (
          <div key={bp.id} class={['blueprint', active && 'active'].filter(Boolean).join(' ')}>
            <button
              type="button"
              class="bp-main"
              onClick={() => (placing.value = active ? null : bp.id)}
              title={t('bench.place')}
            >
              <b>
                <span class={`suit-${bp.suit}`}>{SUIT_SYMBOLS[bp.suit]}</span> {def.name}
              </b>
              <small>
                {HAND_NAMES[bp.category]} · ×{bp.power.toFixed(2)}
              </small>
              <span class="mini-cards">
                {bp.cards.map((c, i) => (
                  <Card key={i} card={c} small />
                ))}
              </span>
            </button>
            <button
              type="button"
              class="linklike danger"
              onClick={() => act({ t: 'scrap', blueprint: bp.id })}
            >
              {t('bench.scrap', {
                gold: Math.floor(bp.value * GAME_DATA.rules.towers.scrapRefund),
              })}
            </button>
          </div>
        );
      })}
      {placing.value !== null && (
        <div class="hint placing">{t('bench.place')} · right-click to cancel</div>
      )}
    </div>
  );
}
