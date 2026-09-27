import { useEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import {
  GAME_DATA,
  HAND_NAMES,
  SUIT_NAMES,
  SUIT_SYMBOLS,
  TICK_RATE,
  enemyDef,
  modifierDef,
  sendDef,
  tileKey,
  towerDef,
} from '@pokertd/sim';
import type { TargetingMode } from '@pokertd/sim';
import { playEvents, setMusicIntensity, sfx } from '../audio/sfx';
import { t } from '../i18n/strings';
import { ReplayLink } from '../net/local';
import { Board, creepColor } from '../render/board';
import { settings } from '../settings';
import {
  act,
  activeKind,
  currentLink,
  gameEvents,
  match,
  me,
  panel,
  pings,
  placing,
  players,
  selectedTower,
  send,
  snap,
  snapshots,
  toMenu,
  towers,
  you,
  nextWave,
  endResult,
} from '../state/store';
import { Btn, gold } from './common';
import { Bench, HandPanel } from './Hand';
import { Banners, ChatBox, EndScreen, Scoreboard, ShopModal, announce } from './Overlays';

export let board: Board | null = null;
export const PING_COLORS: Record<string, number> = {
  help: 0xe0525a,
  flush: 0x4aa3e0,
  saving: 0xe8c15a,
  look: 0xffffff,
  danger: 0xff7a1a,
};
let armedPing: string | null = null;

export function Game() {
  const host = useRef<HTMLDivElement>(null);
  const info = match.value;

  useEffect(() => {
    if (!host.current) return;
    const b = new Board(host.current, {
      onTileClick: (x, y, button) => onTileClick(x, y, button),
      onHover: () => refreshHighlight(),
    });
    board = b;
    const offs = [
      snapshots.on((s) => b.applySnapshot(s)),
      gameEvents.on((events) => {
        b.handleEvents(events);
        const byId = new Map(towers.value.map((tw) => [tw.id, tw.copyOf ?? tw.def]));
        playEvents(events, match.value?.you ?? null, (id) => byId.get(id));
        for (const e of events) announce(e);
      }),
      pings.on((p) => {
        b.ping(p.x, p.y, PING_COLORS[p.kind] ?? 0xffffff);
        sfx.ping();
      }),
      effect(() => {
        const m = match.value;
        if (m) void b.setLayout(m.layout, m.you);
      }),
      effect(() => {
        b.selected = selectedTower.value;
        b.setTowers(towers.value);
      }),
      effect(() => {
        void placing.value;
        void selectedTower.value;
        void towers.value;
        refreshHighlight();
      }),
      effect(() => {
        const n = snap.value?.wave.n ?? 0;
        setMusicIntensity(n / 40);
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      b.destroy();
      board = null;
    };
  }, []);

  // Enter placement mode automatically when a new tower lands on the bench.
  const bench = you.value?.blueprints ?? [];
  const prevBench = useRef(0);
  useEffect(() => {
    if (bench.length > prevBench.current && placing.value === null)
      placing.value = bench[bench.length - 1]!.id;
    prevBench.current = bench.length;
  }, [bench.length]);

  if (!info) return null;
  const showdown = info.settings.mode === 'showdown';
  const spectating = !info.you;

  return (
    <div class={['game', settings.value.reducedMotion && 'reduced'].filter(Boolean).join(' ')}>
      <TopBar />
      <div class="game-main">
        <div class="board-wrap">
          <div class="board" ref={host} />
          <ChatBox />
        </div>
        <aside class="side">
          <Inspector />
          {!spectating && <Research />}
          {!spectating && (showdown ? <RaisePanel /> : <CoopPanel />)}
        </aside>
      </div>
      {!spectating && (
        <div class="game-bottom">
          <HandPanel />
          <Bench />
        </div>
      )}
      {activeKind.value === 'replay' && <ReplayControls />}
      <Banners />
      <Scoreboard />
      {panel.value === 'shop' && <ShopModal />}
      {snap.value?.pause.paused && <div class="pause-overlay">{t('hud.paused')}</div>}
      {endResult.value && <EndScreen />}
    </div>
  );
}

/** Tiles the current blueprint can go on, plus the range preview. */
function refreshHighlight(): void {
  const b = board;
  const info = match.value;
  if (!b || !info) return;
  const tiles = new Set<string>();
  let range: typeof b.highlight.range = null;
  const bpId = placing.value;
  const bp = you.value?.blueprints.find((x) => x.id === bpId);
  const my = me.value;
  if (bp && my) {
    const taken = new Set(towers.value.map((tw) => tileKey(tw.x, tw.y)));
    const centerMine = towers.value.filter((tw) => tw.owner === my.id && tw.zone === -1).length;
    for (const [key, zone] of info.layout.buildZone) {
      if (taken.has(key)) continue;
      if (
        zone === my.lane ||
        (zone === -1 && centerMine < GAME_DATA.rules.coop.centerTowersPerPlayer)
      )
        tiles.add(key);
    }
    const hover = b.hover;
    if (hover && tiles.has(tileKey(hover.x, hover.y))) {
      const def = towerDef(bp.tower === 'jester' ? 'sentry' : bp.tower);
      range = { x: hover.x, y: hover.y, r: def.range, min: def.minRange ?? 0 };
    }
  } else if (selectedTower.value !== null) {
    const tw = towers.value.find((x) => x.id === selectedTower.value);
    if (tw) range = { x: tw.x, y: tw.y, r: tw.range, min: tw.minRange };
  }
  b.highlight = { tiles, range };
}

function onTileClick(x: number, y: number, button: number): void {
  if (button === 2) {
    placing.value = null;
    selectedTower.value = null;
    return;
  }
  if (armedPing) {
    send({ t: 'ping', kind: armedPing as 'help', x: x + 0.5, y: y + 0.5 });
    armedPing = null;
    document.body.classList.remove('pinging');
    return;
  }
  const bp = placing.value;
  if (bp !== null) {
    act({ t: 'place', blueprint: bp, x, y });
    return;
  }
  const tw = towers.value.find((tt) => tt.x === x && tt.y === y);
  selectedTower.value = tw ? tw.id : null;
  if (tw) sfx.click();
}

export function armPing(kind: string): void {
  armedPing = kind;
  document.body.classList.add('pinging');
}

function TopBar() {
  const s = snap.value;
  const info = match.value!;
  const my = me.value;
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  void now;
  if (!s) return <div class="topbar">{t('menu.connecting')}</div>;
  const secs = Math.max(0, Math.ceil((s.wave.nextAt - s.tick) / TICK_RATE));
  const showdown = info.settings.mode === 'showdown';
  const lives = showdown ? (my?.lives ?? 0) : s.lives;
  const next = nextWave.value;
  const local = activeKind.value === 'local';
  const solo = info.settings.players.length === 1;

  return (
    <div class="topbar">
      <div class="wave">
        <b>
          {s.wave.n === 0
            ? 'Get ready'
            : s.wave.final
              ? t('hud.final')
              : t('hud.wave', { n: s.wave.n })}
        </b>
        {!s.wave.final && <span class="timer">{t('hud.nextWave', { s: secs })}</span>}
        {s.wave.modifiers.map((id) => {
          const m = modifierDef(id);
          return (
            <span key={id} class="chip mod" title={m.desc}>
              {m.name}
            </span>
          );
        })}
      </div>
      {next && (
        <div class="next" title="Next wave">
          <span class="label">Next:</span>
          {next.tags.includes('boss') && <span class="chip boss">BOSS</span>}
          {next.tags.includes('air') && <span class="chip air">AIR</span>}
          {next.tags.includes('bonus') && <span class="chip bonus">BONUS</span>}
          {next.composition.map((c) => (
            <span key={c.type} class="creep-chip" title={enemyDef(c.type).name}>
              <i style={{ background: `#${creepColor(c.type).toString(16).padStart(6, '0')}` }} />
              {c.count}× {enemyDef(c.type).name}
            </span>
          ))}
          {next.modifiers > 0 && (
            <span class="chip mod">
              +{next.modifiers} modifier{next.modifiers > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
      <div class="resources">
        <span class="lives" title={t('hud.lives')}>
          ♥ {lives}
        </span>
        {my && (
          <span class="gold" title={t('hud.gold')}>
            ● {gold(my.gold)}
          </span>
        )}
        {showdown && my && <span title={t('hud.income')}>+{my.income}/wave</span>}
        {showdown && my && my.incoming > 0 && (
          <span class="incoming">{t('hud.incoming', { gold: my.incoming })}</span>
        )}
        {!showdown && players.value.length > 1 && (
          <span title={t('coop.potHint')}>
            Pot {s.pot.gold}/{s.pot.target}
          </span>
        )}
      </div>
      <div class="controls">
        {local && solo && s.wave.spawnsLeft === 0 && !s.wave.final && (
          <Btn
            onClick={() => act({ t: 'callWave' })}
            hotkey={settings.value.keys.callWave}
            title="Early bonus gold"
          >
            {t('hud.callWave')}
          </Btn>
        )}
        {local && (
          <Btn
            onClick={() => {
              const link = currentLink();
              if (link && 'speed' in link)
                (link as { speed: number }).speed = (link as { speed: number }).speed === 1 ? 2 : 1;
            }}
          >
            ⏩
          </Btn>
        )}
        {!showdown && info.you && (
          <Btn
            onClick={() => act({ t: 'pauseVote' })}
            hotkey={settings.value.keys.pause}
            title="Vote to pause"
          >
            ⏸
          </Btn>
        )}
        <Btn onClick={() => board?.resetCamera()} title="Fit the whole table">
          ⤢
        </Btn>
        <Btn onClick={() => (panel.value = 'settings')} title={t('menu.settings')}>
          ⚙
        </Btn>
        <Btn kind="ghost" onClick={toMenu}>
          Leave
        </Btn>
      </div>
    </div>
  );
}

const SUIT_EFFECT = (suit: number, amount: number): string => {
  switch (suit) {
    case 0:
      return `Pierce: ignores ${amount.toFixed(0)} armor`;
    case 1:
      return `Crit: ${(amount * 100).toFixed(0)}% chance for double damage`;
    case 2:
      return `Greed: +${amount.toFixed(0)} gold per kill`;
    default:
      return `Chill: ${(amount * 100).toFixed(0)}% slow on hit`;
  }
};

function Inspector() {
  const tw = towers.value.find((x) => x.id === selectedTower.value);
  if (!tw) {
    return (
      <section class="panel inspector empty">
        <p class="hint">
          Click a tower to inspect it. Right-click cancels. Alt-click or the ping buttons mark the
          map.
        </p>
      </section>
    );
  }
  const def = towerDef(tw.def);
  const fights = tw.copyOf ? towerDef(tw.copyOf) : def;
  const owner = players.value.find((p) => p.id === tw.owner);
  const mine = tw.owner === match.value?.you;
  const dps = fights.beam
    ? `${Math.round(fights.beam.minDps * tw.dmg)}–${Math.round(fights.beam.maxDps * tw.dmg)}`
    : Math.round((tw.dmg * (fights.targets ?? 1) * TICK_RATE) / Math.max(1, tw.period));
  const amount = [tw.pierce, tw.crit, tw.greed, tw.slow][tw.suit]!;
  const my = me.value;
  const canUpgrade =
    mine && tw.level < GAME_DATA.rules.towers.maxLevel && (my?.gold ?? 0) >= tw.upgradeCost;
  return (
    <section class="panel inspector">
      <h3>
        <span
          style={{ color: `#${[0xa9b6c8, 0xe0525a, 0x4aa3e0, 0x58c27d][tw.suit]!.toString(16)}` }}
        >
          {SUIT_SYMBOLS[tw.suit]}
        </span>{' '}
        {def.name}
        {tw.copyOf && <small> (copying {towerDef(tw.copyOf).name})</small>}{' '}
        <small>Lv {tw.level}</small>
      </h3>
      <p class="sub">
        {HAND_NAMES[tw.category as 0]} · power ×{tw.power.toFixed(2)}
        {tw.pure && ' · pure suit ×2'} · {owner?.name ?? '?'}
      </p>
      <dl class="stats">
        <dt>Damage</dt>
        <dd>{fights.beam ? `beam ${dps}/s` : Math.round(tw.dmg)}</dd>
        <dt>DPS</dt>
        <dd>{dps}</dd>
        <dt>Range</dt>
        <dd>
          {tw.range.toFixed(1)}
          {tw.minRange > 0 && ` (min ${tw.minRange})`}
        </dd>
        <dt>Hits air</dt>
        <dd>{tw.hitsAir ? 'yes' : 'no'}</dd>
        <dt>Suit</dt>
        <dd>{SUIT_EFFECT(tw.suit, amount)}</dd>
        {tw.aura > 0 && (
          <>
            <dt>Aura</dt>
            <dd>+{Math.round(tw.aura * 100)}% damage from a Crown</dd>
          </>
        )}
        <dt>Dealt</dt>
        <dd>
          {tw.damageDealt.toLocaleString()} dmg · {tw.kills} kills
        </dd>
      </dl>
      {mine && (
        <>
          <label class="field">
            <span>{t('tower.targeting')}</span>
            <select
              value={tw.targeting}
              onChange={(e) =>
                act({ t: 'target', tower: tw.id, mode: e.currentTarget.value as TargetingMode })
              }
            >
              {GAME_DATA.rules.towers.targeting.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <div class="row">
            <Btn
              kind="primary"
              disabled={!canUpgrade}
              onClick={() => act({ t: 'upgrade', tower: tw.id })}
              hotkey={settings.value.keys.upgrade}
            >
              {tw.level >= GAME_DATA.rules.towers.maxLevel
                ? t('tower.maxLevel')
                : t('tower.upgrade', { gold: tw.upgradeCost })}
            </Btn>
            <Btn
              kind="danger"
              onClick={() => act({ t: 'sell', tower: tw.id })}
              hotkey={settings.value.keys.sell}
            >
              {t('tower.sell', { gold: tw.sellValue })}
            </Btn>
          </div>
        </>
      )}
    </section>
  );
}

function Research() {
  const my = me.value;
  const s = snap.value;
  if (!my || !s) return null;
  const costs = GAME_DATA.rules.research.costs;
  const r = my.researching;
  return (
    <section class="panel research">
      <h3>{t('research.title')}</h3>
      {GAME_DATA.rules.suits.map((suit, i) => {
        const level = my.research[i]!;
        const cost = costs[level];
        const busy = r?.suit === i;
        const pct = busy
          ? 100 - ((r!.doneAt - s.tick) / (GAME_DATA.rules.research.seconds * TICK_RATE)) * 100
          : 0;
        return (
          <div key={i} class="research-row">
            <span
              class="suit"
              style={{ color: `#${[0xa9b6c8, 0xe0525a, 0x4aa3e0, 0x58c27d][i]!.toString(16)}` }}
            >
              {SUIT_SYMBOLS[i]}
            </span>
            <span class="name" title={suit.desc}>
              {suit.name}
              <span class="pips">
                {costs.map((_, k) => (
                  <i key={k} class={k < level ? 'on' : ''} />
                ))}
              </span>
            </span>
            {busy ? (
              <div class="progress">
                <div style={{ width: `${pct}%` }} />
              </div>
            ) : cost !== undefined ? (
              <Btn
                disabled={!!r || my.gold < cost}
                onClick={() => act({ t: 'research', suit: i as 0 })}
                title={`${SUIT_NAMES[i]}: ${suit.desc}`}
              >
                {gold(cost)}
              </Btn>
            ) : (
              <span class="max">max</span>
            )}
          </div>
        );
      })}
    </section>
  );
}

function CoopPanel() {
  const s = snap.value;
  const my = me.value;
  if (!s || !my) return null;
  const multi = players.value.length > 1;
  return (
    <section class="panel coop">
      {multi && (
        <>
          <h3>{t('coop.pot')}</h3>
          <div class="progress pot">
            <div style={{ width: `${(100 * s.pot.gold) / s.pot.target}%` }} />
            <span>
              {s.pot.gold}/{s.pot.target}
            </span>
          </div>
          <p class="hint">{t('coop.potHint')}</p>
          <div class="row">
            {[25, 50, 100].map((n) => (
              <Btn key={n} disabled={my.gold < n} onClick={() => act({ t: 'pot', amount: n })}>
                +{n}
              </Btn>
            ))}
          </div>
        </>
      )}
      <PingBar />
    </section>
  );
}

function PingBar() {
  return (
    <div class="pingbar">
      {(['help', 'flush', 'saving', 'danger'] as const).map((k) => (
        <button
          type="button"
          key={k}
          class="ping-btn"
          title={t(`ping.${k}`)}
          onClick={() => armPing(k)}
        >
          <i style={{ background: `#${PING_COLORS[k]!.toString(16).padStart(6, '0')}` }} />
          {k}
        </button>
      ))}
    </div>
  );
}

function RaisePanel() {
  const s = snap.value;
  const my = me.value;
  const [count, setCount] = useState(1);
  if (!s || !my) return null;
  const list = players.value;
  const idx = list.findIndex((p) => p.id === my.id);
  let target = null;
  for (let k = 1; k < list.length; k++) {
    const p = list[(idx + k) % list.length]!;
    if (!p.busted && p.team !== my.team) {
      target = p;
      break;
    }
  }
  return (
    <section class="panel raise">
      <h3>{t('showdown.raise')}</h3>
      <p class="hint">{t('showdown.raiseHint', { target: target?.name ?? '—' })}</p>
      <label class="field">
        <span>Count</span>
        <input
          type="number"
          min={1}
          max={20}
          value={count}
          onInput={(e) => setCount(Math.max(1, Math.min(20, Number(e.currentTarget.value) || 1)))}
        />
      </label>
      <ul class="sends">
        {GAME_DATA.sends.map((send) => {
          const locked = Math.max(1, s.wave.n) < send.unlockWave;
          const n = send.cooldownWaves ? 1 : count;
          return (
            <li key={send.id}>
              <Btn
                disabled={locked || my.gold < send.cost * n || !target}
                onClick={() => act({ t: 'raise', send: send.id, count: n })}
                title={
                  locked
                    ? `Unlocks at wave ${send.unlockWave}`
                    : `+${send.income * n} income per wave`
                }
              >
                {sendDef(send.id)!.name} · {gold(send.cost * n)} <small>+{send.income * n}/w</small>
              </Btn>
            </li>
          );
        })}
      </ul>
      <PingBar />
    </section>
  );
}

function ReplayControls() {
  const link = currentLink();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  if (!(link instanceof ReplayLink)) return null;
  const total = link.totalTicks || 1;
  return (
    <div class="replay-controls">
      <b>{t('replay.title')}</b>
      <Btn onClick={() => (link.paused = !link.paused)}>{link.paused ? '▶' : '⏸'}</Btn>
      {[1, 2, 4, 8].map((sp) => (
        <Btn
          key={sp}
          kind={link.speed === sp ? 'primary' : undefined}
          onClick={() => (link.speed = sp)}
        >
          {sp}×
        </Btn>
      ))}
      <input
        type="range"
        min={0}
        max={total}
        value={link.tick}
        onChange={(e) => link.seek(Number(e.currentTarget.value))}
        aria-label="Seek"
      />
      <span>
        {Math.floor(link.tick / TICK_RATE / 60)}:
        {String(Math.floor(link.tick / TICK_RATE) % 60).padStart(2, '0')}
      </span>
      <label>
        {t('replay.watch')}{' '}
        <select value={link.seat} onChange={(e) => link.watch(e.currentTarget.value)}>
          {link.replay.settings.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
