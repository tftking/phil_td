import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  type Card as CardValue,
  type GameEvent,
  GAME_DATA,
  HAND_NAMES,
  SUIT_SYMBOLS,
  TICK_RATE,
  isJoker,
  modifierDef,
  parseCards,
  rankOf,
  towerDef,
  towerForHand,
} from '@pokertd/sim';
import { sfx } from '../audio/sfx';
import { t } from '../i18n/strings';
import { serverBase } from '../net/online';
import { settings, updateSettings } from '../settings';
import {
  act,
  activeKind,
  chat,
  chatOpen,
  deckCards,
  endResult,
  lastReplay,
  lobby,
  match,
  panel,
  players,
  scoreboardOpen,
  seatId,
  send,
  snap,
  stats,
  toMenu,
  toast,
  toasts,
  watchReplay,
  you,
} from '../state/store';
import { Btn, Card, Modal, gold } from './common';

// ---------------------------------------------------------------- banners

interface Banner {
  id: number;
  title: string;
  sub?: string;
  kind: 'wave' | 'boss' | 'big' | 'shop' | 'bust';
}
const banners = signal<Banner[]>([]);
let bannerId = 1;

function pushBanner(b: Omit<Banner, 'id'>, ms = 2600): void {
  const id = bannerId++;
  banners.value = [...banners.value.slice(-2), { ...b, id }];
  setTimeout(() => (banners.value = banners.value.filter((x) => x.id !== id)), ms);
}

/** Turns notable game events into on-screen announcements. */
export function announce(e: GameEvent): void {
  const name = (id: string) => players.value.find((p) => p.id === id)?.name ?? id;
  switch (e.kind) {
    case 'waveStart':
      pushBanner({
        title: e.name ?? `Wave ${e.wave}`,
        sub:
          [e.boss ? 'BOSS WAVE' : '', ...e.modifiers.map((m) => modifierDef(m).name)]
            .filter(Boolean)
            .join(' · ') || undefined,
        kind: e.boss ? 'boss' : 'wave',
      });
      break;
    case 'bigHand':
      pushBanner(
        {
          title: `${name(e.player)} hit ${HAND_NAMES[e.category].toUpperCase()}!`,
          sub: `${towerDef(e.tower).name} tower`,
          kind: 'big',
        },
        4000,
      );
      break;
    case 'shopOpen':
      pushBanner({ title: t('shop.title'), sub: 'Open for a short while', kind: 'shop' });
      break;
    case 'potFilled':
      pushBanner({ title: 'The Pot is full!', sub: 'Everyone gets a River card', kind: 'shop' });
      break;
    case 'bust':
      pushBanner({ title: `${name(e.player)} busted`, kind: 'bust' });
      break;
    case 'slip':
      if (e.to === match.value?.you) toast(`${name(e.from)} slipped you a card`);
      break;
    case 'raise':
      if (e.target === match.value?.you)
        toast(`${name(e.from)} raised ${e.gold}g against you`, 'error');
      break;
    case 'reshuffle':
      toast('Deck reshuffled');
      break;
    case 'paused':
      toast(e.paused ? 'Game paused' : 'Game resumed');
      break;
    default:
      break;
  }
}

export function Banners() {
  return (
    <div class="banners" aria-live="polite">
      {banners.value.map((b) => (
        <div key={b.id} class={`banner ${b.kind}`}>
          <b>{b.title}</b>
          {b.sub && <span>{b.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((x) => (
        <div key={x.id} class={`toast ${x.kind}`}>
          {x.text}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- chat

export function ChatBox({ inline = false }: { inline?: boolean }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const lines = chat.value;
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatOpen.value) input.current?.focus();
  }, [chatOpen.value]);
  useEffect(() => {
    log.current?.scrollTo(0, log.current.scrollHeight);
  }, [lines.length]);
  if (activeKind.value !== 'online' && !inline) return null;
  return (
    <div class={['chat', inline && 'inline', chatOpen.value && 'open'].filter(Boolean).join(' ')}>
      <div class="chat-log" ref={log}>
        {lines.slice(inline ? -40 : -8).map((l) => (
          <div key={l.id} class={l.system ? 'sys' : ''}>
            {!l.system && (
              <b
                title="Click to mute"
                onClick={() => {
                  if (l.from && l.from !== seatId.value && confirm(`Mute ${l.name}?`))
                    updateSettings({ muted: [...settings.value.muted, l.from] });
                }}
              >
                {l.name}:{' '}
              </b>
            )}
            {l.text}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send({ t: 'chat', text: text.trim() });
          setText('');
          chatOpen.value = false;
          input.current?.blur();
        }}
      >
        <input
          ref={input}
          value={text}
          maxLength={200}
          placeholder={t('chat.placeholder')}
          onInput={(e) => setText(e.currentTarget.value)}
          onFocus={() => (chatOpen.value = true)}
          onBlur={() => (chatOpen.value = false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
            e.stopPropagation();
          }}
          aria-label="Chat"
        />
      </form>
    </div>
  );
}

// ------------------------------------------------------------- scoreboard

export function Scoreboard() {
  if (!scoreboardOpen.value) return null;
  const showdown = match.value?.settings.mode === 'showdown';
  return (
    <div class="scoreboard" role="dialog" aria-label={t('score.title')}>
      <h2>{t('score.title')}</h2>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            {showdown && <th>Team</th>}
            <th>Gold</th>
            {showdown && <th>Lives</th>}
            {showdown && <th>Income</th>}
            <th>Towers</th>
            <th>Damage</th>
            <th>Kills</th>
            <th>Leaks</th>
            <th>Best hand</th>
            <th>Research</th>
          </tr>
        </thead>
        <tbody>
          {players.value.map((p) => {
            const st = stats.value[p.id] ?? p.stats;
            return (
              <tr
                key={p.id}
                class={[p.busted && 'busted', p.id === match.value?.you && 'me']
                  .filter(Boolean)
                  .join(' ')}
              >
                <td>{p.name}</td>
                {showdown && <td>{String.fromCharCode(65 + p.team)}</td>}
                <td>{gold(p.gold)}</td>
                {showdown && <td>{p.busted ? 'bust' : p.lives}</td>}
                {showdown && <td>+{p.income}</td>}
                <td>{st?.towersPlaced ?? '–'}</td>
                <td>{st ? Math.round(st.damage).toLocaleString() : '–'}</td>
                <td>{st?.kills ?? '–'}</td>
                <td>{st?.leaks ?? '–'}</td>
                <td>{st && st.bestHand >= 0 ? HAND_NAMES[st.bestHand as 0] : '–'}</td>
                <td>
                  {p.research.map((lvl, i) => (
                    <span key={i} class={`suit-${i}`}>
                      {SUIT_SYMBOLS[i]}
                      {lvl}{' '}
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------- shop

export function ShopModal() {
  const v = you.value;
  const s = snap.value;
  const [picking, setPicking] = useState<string | null>(null);
  const [paintSuit, setPaintSuit] = useState(1);
  if (!v?.shopOffers || !s) return null;
  const secs = Math.max(0, Math.ceil((s.shopOpenUntil - s.tick) / TICK_RATE));
  const items = GAME_DATA.rules.shop.items;
  const needsCard = (id: string) => ['burn', 'mark', 'paint', 'promote'].includes(id);
  const cards = [...new Set(deckCards.value)].filter((c) => !isJoker(c));
  const my = players.value.find((p) => p.id === match.value?.you);

  return (
    <Modal
      title={`${t('shop.title')} · ${t('shop.closes', { s: secs })}`}
      onClose={() => (panel.value = 'none')}
      wide
    >
      <div class="shop">
        {v.shopOffers.map((id) => {
          const item = items.find((i) => i.id === id)!;
          const bought = v.shopBought.includes(id);
          return (
            <div
              key={id}
              class={['offer', bought && 'bought', picking === id && 'active']
                .filter(Boolean)
                .join(' ')}
            >
              <b>{item.name}</b>
              <p>{item.desc}</p>
              <Btn
                kind="primary"
                disabled={bought || (my?.gold ?? 0) < item.cost}
                onClick={() => (needsCard(id) ? setPicking(id) : act({ t: 'shopBuy', item: id }))}
              >
                {bought ? 'Bought' : gold(item.cost)}
              </Btn>
            </div>
          );
        })}
      </div>
      {picking && (
        <div class="card-picker">
          <p>
            {t('shop.pickCard')} for <b>{items.find((i) => i.id === picking)!.name}</b>
            {picking === 'paint' && (
              <>
                {' '}
                → new suit{' '}
                <select
                  value={paintSuit}
                  onChange={(e) => setPaintSuit(Number(e.currentTarget.value))}
                >
                  {[0, 1, 2, 3].map((s) => (
                    <option key={s} value={s}>
                      {SUIT_SYMBOLS[s]}
                    </option>
                  ))}
                </select>
              </>
            )}
          </p>
          <div class="picker-grid">
            {cards
              .filter((c) => picking !== 'promote' || rankOf(c) < 14)
              .map((c: CardValue) => (
                <Card
                  key={c}
                  card={c}
                  small
                  onClick={() => {
                    act({
                      t: 'shopBuy',
                      item: picking,
                      card: c,
                      ...(picking === 'paint' ? { arg: paintSuit } : {}),
                    });
                    setPicking(null);
                  }}
                />
              ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------- end screen

export function EndScreen() {
  const r = endResult.value!;
  const info = match.value;
  const showdown = info?.settings.mode === 'showdown';
  const won = r.result === 'won';
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (won) sfx.win();
    else sfx.lose();
  }, []);
  const host = lobby.value?.seats.find((s) => s.id === seatId.value)?.host ?? false;
  const local = activeKind.value !== 'online';
  const title = showdown
    ? won
      ? t('end.showdownWon')
      : t('end.showdownLost')
    : won
      ? t('end.won')
      : t('end.lost');

  return (
    <div class="end-screen">
      <div class={`end-card ${won ? 'won' : 'lost'}`}>
        <h1>{title}</h1>
        <p>{t('end.wave', { n: r.wave })}</p>
        {r.xpGained > 0 && <p class="xp">{t('end.xp', { xp: r.xpGained })}</p>}
        <table class="end-stats">
          <thead>
            <tr>
              <th>Player</th>
              <th>Hands</th>
              <th>Best hand</th>
              <th>Damage</th>
              <th>Kills</th>
              <th>Leaks</th>
            </tr>
          </thead>
          <tbody>
            {players.value.map((p) => {
              const st = stats.value[p.id] ?? p.stats;
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{st?.handsPlayed ?? '–'}</td>
                  <td>{st && st.bestHand >= 0 ? HAND_NAMES[st.bestHand as 0] : '–'}</td>
                  <td>{st ? Math.round(st.damage).toLocaleString() : '–'}</td>
                  <td>{st?.kills ?? '–'}</td>
                  <td>{st?.leaks ?? '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div class="row">
          {(local || host) && activeKind.value !== 'replay' && (
            <Btn kind="primary" onClick={() => send({ t: 'rematch' })}>
              {t('end.rematch')}
            </Btn>
          )}
          {(r.replayId || (local && lastReplay.value)) && activeKind.value !== 'replay' && (
            <Btn
              onClick={() => {
                if (r.replayId) {
                  fetch(`${serverBase()}/replays/${r.replayId}`)
                    .then((res) => res.json())
                    .then((rep) => watchReplay(rep))
                    .catch(() => toast('Replay unavailable', 'error'));
                } else if (lastReplay.value) watchReplay(lastReplay.value);
              }}
            >
              {t('end.replay')}
            </Btn>
          )}
          {r.replayId && (
            <Btn
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(r.replayId!)
                  .then(() => toast('Replay id copied'))
              }
            >
              Copy replay id
            </Btn>
          )}
          <Btn kind="ghost" onClick={toMenu}>
            {t('end.menu')}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ cheat sheet

const EXAMPLES: Record<number, string> = {
  0: 'AS KD 8C 5H 2D',
  1: 'QH QC 9S 6D 3C',
  2: 'JS JD 4H 4C KS',
  3: '7H 7D 7C AS 2D',
  4: '5C 6D 7H 8S 9C',
  5: 'KH TH 8H 4H 2H',
  6: 'TS TD TC 3H 3S',
  7: '9S 9D 9H 9C 4D',
  8: '4D 5D 6D 7D 8D',
  9: 'TC JC QC KC AC',
  10: 'AS AD AH AC JK',
};
const ODDS = [
  '50.1%',
  '42.3%',
  '4.75%',
  '2.11%',
  '0.39%',
  '0.20%',
  '0.14%',
  '0.024%',
  '0.0014%',
  '0.00015%',
  'Joker only',
];

export function CheatSheet() {
  return (
    <Modal title={t('cheat.title')} onClose={() => (panel.value = 'none')} wide>
      <table class="cheatsheet">
        <tbody>
          {Object.entries(EXAMPLES)
            .reverse()
            .map(([cat, cards]) => {
              const tower = towerForHand(Number(cat) as 0);
              return (
                <tr key={cat}>
                  <td>
                    <b>{HAND_NAMES[Number(cat) as 0]}</b>
                  </td>
                  <td class="mini-cards">
                    {parseCards(cards).map((c, i) => (
                      <Card key={i} card={c} small />
                    ))}
                  </td>
                  <td>
                    → <b>{tower.name}</b>
                  </td>
                  <td class="hint">{ODDS[Number(cat)]} (no redraw)</td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <p class="hint">
        Higher cards make stronger towers (Aces ×1.6). The most common suit among the scoring cards
        sets the tower's effect: ♠ pierce armor, ♥ critical hits, ♦ extra gold, ♣ slow. Flushes get
        a double-strength effect.
      </p>
    </Modal>
  );
}
