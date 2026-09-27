import { useEffect, useState } from 'preact/hooks';
import type { BotStyle } from '@pokertd/bots';
import type { PublicRoom } from '@pokertd/protocol';
import { GAME_DATA, HAND_NAMES, type Replay } from '@pokertd/sim';
import { t } from '../i18n/strings';
import { serverBase } from '../net/online';
import { localReplays, settings, updateSettings } from '../settings';
import {
  connectOnline,
  createRoom,
  joinRoom,
  lastReplay,
  online,
  panel,
  profile,
  queue,
  send,
  startPractice,
  startSolo,
  toast,
  watchReplay,
} from '../state/store';
import { Btn, Modal } from './common';
import { startTutorial } from './Tutorial';

type Dialog = 'none' | 'solo' | 'create' | 'practice' | 'replays' | 'profile';

const mapsFor = (mode: 'coop' | 'showdown') => GAME_DATA.maps.filter((m) => m.mode === mode);

export function Menu() {
  const [dialog, setDialog] = useState<Dialog>('none');
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [editingName, setEditingName] = useState(false);
  const isOnline = online.value === 'open';
  const p = profile.value;

  useEffect(() => {
    if (!isOnline) return;
    const load = () =>
      fetch(`${serverBase()}/rooms`)
        .then((r) => r.json() as Promise<PublicRoom[]>)
        .then(setRooms)
        .catch(() => setRooms([]));
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [isOnline]);

  const q = queue.value;

  return (
    <div class="menu">
      <header class="menu-header">
        <div>
          <h1>
            <span class="logo-suits">♠♥</span> {t('app.title')} <span class="logo-suits">♦♣</span>
          </h1>
          <p class="tagline">{t('app.tagline')}</p>
        </div>
        <div class="profile-chip">
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value
                  .trim()
                  .slice(0, 20);
                if (name) {
                  updateSettings({ name });
                  if (isOnline) send({ t: 'rename', name });
                }
                setEditingName(false);
              }}
            >
              <input
                name="name"
                defaultValue={settings.value.name}
                maxLength={20}
                aria-label={t('menu.name')}
                autoFocus
              />
            </form>
          ) : (
            <button
              type="button"
              class="linklike"
              onClick={() => setEditingName(true)}
              title="Change name"
            >
              {settings.value.name || 'Player'} ✎
            </button>
          )}
          {p && (
            <button type="button" class="level" onClick={() => setDialog('profile')}>
              {t('profile.level', { n: p.level })}
            </button>
          )}
          <span class={`status ${online.value}`}>
            {isOnline ? '● online' : online.value === 'connecting' ? '○ connecting' : '○ offline'}
          </span>
        </div>
      </header>

      {q && (
        <div class="queue-banner">
          {t('menu.searching', { waiting: q.waiting, startsIn: q.startsIn ?? 0 })}
          <Btn kind="ghost" onClick={() => send({ t: 'cancelQueue' })}>
            {t('menu.cancel')}
          </Btn>
        </div>
      )}

      <div class="menu-grid">
        <section class="menu-card">
          <h2>Play offline</h2>
          <Btn kind="primary" onClick={() => setDialog('solo')}>
            {t('menu.solo')}
          </Btn>
          <p class="hint">{t('menu.soloDesc')}</p>
          <Btn onClick={() => setDialog('practice')}>Showdown practice</Btn>
          <Btn onClick={startTutorial}>
            {t('menu.tutorial')}
            {!settings.value.tutorialDone && <span class="badge">new</span>}
          </Btn>
        </section>

        <section class="menu-card">
          <h2>Play online</h2>
          <Btn
            kind="primary"
            disabled={!isOnline || !!q}
            onClick={() => send({ t: 'quickPlay', mode: 'coop' })}
          >
            {t('menu.quickCoop')}
          </Btn>
          <Btn
            disabled={!isOnline || !!q}
            onClick={() => send({ t: 'quickPlay', mode: 'showdown' })}
          >
            {t('menu.quickShowdown')}
          </Btn>
          <Btn disabled={!isOnline} onClick={() => send({ t: 'daily' })}>
            {t('menu.daily')}
          </Btn>
          <p class="hint">{t('menu.dailyDesc')}</p>
          {!isOnline && (
            <p class="hint warn">
              {online.value === 'connecting' ? t('menu.connecting') : t('menu.offline')}
            </p>
          )}
        </section>

        <section class="menu-card">
          <h2>Private table</h2>
          <Btn kind="primary" disabled={!isOnline} onClick={() => setDialog('create')}>
            {t('menu.create')}
          </Btn>
          <form
            class="join-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^[A-Za-z0-9]{5}$/.test(code)) joinRoom(code);
              else toast('Room codes are 5 letters or numbers', 'error');
            }}
          >
            <input
              value={code}
              onInput={(e) => setCode(e.currentTarget.value.toUpperCase().slice(0, 5))}
              placeholder={t('menu.joinPlaceholder')}
              aria-label={t('menu.joinPlaceholder')}
              disabled={!isOnline}
            />
            <Btn submit disabled={!isOnline || code.length !== 5}>
              {t('menu.join')}
            </Btn>
          </form>
          {rooms.length > 0 && (
            <ul class="room-list">
              {rooms.map((r) => (
                <li key={r.code}>
                  <button type="button" class="linklike" onClick={() => joinRoom(r.code)}>
                    <b>{r.code}</b> {t(r.mode === 'coop' ? 'mode.coop' : 'mode.showdown')} ·{' '}
                    {GAME_DATA.maps.find((m) => m.id === r.map)?.name} · {r.players}/{r.maxPlayers}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section class="menu-card">
          <h2>More</h2>
          <Btn onClick={() => setDialog('replays')}>{t('menu.replays')}</Btn>
          <Btn disabled={!p} onClick={() => setDialog('profile')}>
            {t('menu.profile')}
          </Btn>
          <Btn onClick={() => (panel.value = 'settings')}>{t('menu.settings')}</Btn>
          <Btn onClick={() => (panel.value = 'cheatsheet')}>{t('cheat.title')}</Btn>
        </section>
      </div>

      {dialog === 'solo' && <SoloDialog onClose={() => setDialog('none')} />}
      {dialog === 'practice' && <PracticeDialog onClose={() => setDialog('none')} />}
      {dialog === 'create' && <CreateDialog onClose={() => setDialog('none')} />}
      {dialog === 'replays' && <ReplaysDialog onClose={() => setDialog('none')} />}
      {dialog === 'profile' && <ProfileDialog onClose={() => setDialog('none')} />}
    </div>
  );
}

function Select(props: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label class="field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SoloDialog({ onClose }: { onClose: () => void }) {
  const [map, setMap] = useState('felt');
  const [difficulty, setDifficulty] = useState('standard');
  const [allies, setAllies] = useState(0);
  const [endless, setEndless] = useState(false);
  const maxAllies = (GAME_DATA.maps.find((m) => m.id === map)?.players[1] ?? 1) - 1;
  return (
    <Modal title={t('menu.solo')} onClose={onClose}>
      <Select label={t('lobby.map')} value={map} options={mapsFor('coop')} onChange={setMap} />
      <Select
        label={t('lobby.difficulty')}
        value={difficulty}
        options={GAME_DATA.rules.difficulties}
        onChange={setDifficulty}
      />
      <label class="field">
        <span>Bot allies</span>
        <input
          type="range"
          min={0}
          max={Math.min(3, maxAllies)}
          value={Math.min(allies, maxAllies)}
          onInput={(e) => setAllies(Number(e.currentTarget.value))}
        />
        <b>{Math.min(allies, maxAllies)}</b>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={endless}
          onChange={(e) => setEndless(e.currentTarget.checked)}
        />{' '}
        {t('lobby.endless')}
      </label>
      <Btn
        kind="primary"
        onClick={() => {
          startSolo({
            map,
            difficulty,
            allies: Array<BotStyle>(Math.min(allies, maxAllies)).fill('smart'),
            endless,
          });
          onClose();
        }}
      >
        {t('lobby.start')}
      </Btn>
    </Modal>
  );
}

function PracticeDialog({ onClose }: { onClose: () => void }) {
  const [opponents, setOpponents] = useState(3);
  return (
    <Modal title="Showdown practice" onClose={onClose}>
      <p>
        Play Showdown against bots. Raise gold to send creeps at the next player; the last one
        standing wins.
      </p>
      <label class="field">
        <span>Opponents</span>
        <input
          type="range"
          min={1}
          max={7}
          value={opponents}
          onInput={(e) => setOpponents(Number(e.currentTarget.value))}
        />
        <b>{opponents}</b>
      </label>
      <Btn
        kind="primary"
        onClick={() => {
          startPractice(Array.from({ length: opponents }, (_, i) => (i % 2 ? 'smart' : 'raiser')));
          onClose();
        }}
      >
        {t('lobby.start')}
      </Btn>
    </Modal>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'coop' | 'showdown'>('coop');
  const [map, setMap] = useState('felt');
  const [difficulty, setDifficulty] = useState('standard');
  const [isPrivate, setPrivate] = useState(true);
  return (
    <Modal title={t('menu.create')} onClose={onClose}>
      <Select
        label={t('lobby.mode')}
        value={mode}
        options={[
          { id: 'coop', name: t('mode.coop') },
          { id: 'showdown', name: t('mode.showdown') },
        ]}
        onChange={(v) => {
          setMode(v as 'coop' | 'showdown');
          setMap(mapsFor(v as 'coop' | 'showdown')[0]!.id);
        }}
      />
      <Select label={t('lobby.map')} value={map} options={mapsFor(mode)} onChange={setMap} />
      <Select
        label={t('lobby.difficulty')}
        value={difficulty}
        options={GAME_DATA.rules.difficulties}
        onChange={setDifficulty}
      />
      <label class="check">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setPrivate(e.currentTarget.checked)}
        />{' '}
        Private (invite only)
      </label>
      <Btn
        kind="primary"
        onClick={() => {
          connectOnline();
          createRoom({ mode, map, difficulty, private: isPrivate, botTakeover: true });
          onClose();
        }}
      >
        {t('menu.create')}
      </Btn>
    </Modal>
  );
}

function ReplaysDialog({ onClose }: { onClose: () => void }) {
  const [id, setId] = useState('');
  const local = localReplays()
    .map((j) => {
      try {
        return JSON.parse(j) as Replay;
      } catch {
        return null;
      }
    })
    .filter((r): r is Replay => !!r);
  const open = (r: Replay) => {
    watchReplay(r);
    onClose();
  };
  return (
    <Modal title={t('menu.replays')} onClose={onClose}>
      <form
        class="join-row"
        onSubmit={(e) => {
          e.preventDefault();
          fetch(`${serverBase()}/replays/${id.trim()}`)
            .then((r) =>
              r.ok ? (r.json() as Promise<Replay>) : Promise.reject(new Error('not found')),
            )
            .then(open)
            .catch(() => toast('Replay not found', 'error'));
        }}
      >
        <input
          value={id}
          onInput={(e) => setId(e.currentTarget.value)}
          placeholder={t('replay.idPlaceholder')}
        />
        <Btn submit disabled={!/^[a-f0-9]{16}$/.test(id.trim())}>
          {t('replay.load')}
        </Btn>
      </form>
      {lastReplay.value && <Btn onClick={() => open(lastReplay.value!)}>Last match</Btn>}
      <h3>Recent offline matches</h3>
      {local.length === 0 && <p class="hint">Finish a solo match to see it here.</p>}
      <ul class="replay-list">
        {local.map((r, i) => (
          <li key={i}>
            <button type="button" class="linklike" onClick={() => open(r)}>
              {GAME_DATA.maps.find((m) => m.id === r.settings.map)?.name} · {r.settings.difficulty}{' '}
              · {r.result?.phase === 'won' ? 'won' : `wave ${r.result?.wave ?? '?'}`}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const p = profile.value;
  if (!p) return null;
  const pct = Math.round((100 * (p.xp - (p.nextLevelXp - 100 * p.level))) / (100 * p.level));
  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div class="profile">
        <div class="xp">
          <b>{t('profile.level', { n: p.level })}</b>
          <div class="xpbar">
            <div style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
          <span>
            {p.xp} / {p.nextLevelXp} XP
          </span>
        </div>
        <dl class="stats">
          <dt>Matches</dt>
          <dd>{p.stats.matches}</dd>
          <dt>Wins</dt>
          <dd>{p.stats.wins}</dd>
          <dt>Best wave</dt>
          <dd>{p.stats.bestWave}</dd>
          <dt>Hands played</dt>
          <dd>{p.stats.handsPlayed}</dd>
          <dt>Royal flushes</dt>
          <dd>{p.stats.royalFlushes}</dd>
        </dl>
        <h3>{t('profile.handBook')}</h3>
        <ul class="handbook">
          {p.handBook.map((n, i) => (
            <li key={i} class={n > 0 ? 'got' : ''}>
              <span>{HAND_NAMES[i as 0]}</span>
              <b>{n > 0 ? n.toLocaleString() : '—'}</b>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
