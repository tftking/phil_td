import { useEffect } from 'preact/hooks';
import { GAME_DATA } from '@pokertd/sim';
import { startMusic, unlockAudio } from '../audio/sfx';
import { serverBase } from '../net/online';
import { type Action, keyName, settings } from '../settings';
import {
  act,
  chatOpen,
  joinRoom,
  match,
  me,
  panel,
  placing,
  scoreboardOpen,
  screen,
  selectedTower,
  toast,
  towers,
  watchReplay,
  you,
  myTowers,
} from '../state/store';
import type { Replay } from '@pokertd/sim';
import { board } from './Game';
import { Game } from './Game';
import { deal, lock, redrawMarked, toggleCard } from './Hand';
import { Lobby } from './Lobby';
import { Menu } from './Menu';
import { CheatSheet, Toasts } from './Overlays';
import { SettingsModal } from './SettingsModal';
import { TutorialOverlay } from './Tutorial';

export function App() {
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      startMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const down = (e: KeyboardEvent) => onKey(e, true);
    const up = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    handleDeepLink();
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(settings.value.uiScale));
  }, [settings.value.uiScale]);

  return (
    <>
      {screen.value === 'menu' && <Menu />}
      {screen.value === 'lobby' && <Lobby />}
      {screen.value === 'game' && <Game />}
      {panel.value === 'settings' && <SettingsModal />}
      {panel.value === 'cheatsheet' && <CheatSheet />}
      <TutorialOverlay />
      <Toasts />
    </>
  );
}

/** /play/CODE joins a room; ?replay=ID opens a replay. */
function handleDeepLink(): void {
  const room = /^\/play\/([A-Za-z0-9]{5})$/.exec(location.pathname);
  if (room) {
    history.replaceState(null, '', '/');
    setTimeout(() => joinRoom(room[1]!), 300);
  }
  const replay = new URLSearchParams(location.search).get('replay');
  if (replay && /^[a-f0-9]{16}$/.test(replay)) {
    history.replaceState(null, '', '/');
    fetch(`${serverBase()}/replays/${replay}`)
      .then((r) => (r.ok ? (r.json() as Promise<Replay>) : Promise.reject(new Error('missing'))))
      .then(watchReplay)
      .catch(() => toast('Replay not found', 'error'));
  }
}

function actionFor(key: string): Action | null {
  const keys = settings.value.keys;
  for (const a of Object.keys(keys) as Action[]) if (keys[a] === key) return a;
  return null;
}

function onKey(e: KeyboardEvent, down: boolean): void {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
  )
    return;
  const action = actionFor(keyName(e));
  if (!action) return;
  if (action === 'scoreboard') {
    if (screen.value === 'game') {
      e.preventDefault();
      scoreboardOpen.value = down;
    }
    return;
  }
  if (!down) return;
  if (action === 'cancel') {
    if (panel.value !== 'none') panel.value = 'none';
    else if (placing.value !== null) placing.value = null;
    else selectedTower.value = null;
    return;
  }
  if (action === 'cheatsheet') {
    panel.value = panel.value === 'cheatsheet' ? 'none' : 'cheatsheet';
    return;
  }
  if (screen.value !== 'game' || !match.value?.you) return;
  if (panel.value === 'settings') return;
  e.preventDefault();
  const tw = towers.value.find((x) => x.id === selectedTower.value);
  switch (action) {
    case 'deal':
      if (!you.value?.hand) deal();
      break;
    case 'redraw':
      redrawMarked();
      break;
    case 'lock':
      lock();
      break;
    case 'fold':
      if (you.value?.hand) act({ t: 'fold' });
      break;
    case 'card1':
    case 'card2':
    case 'card3':
    case 'card4':
    case 'card5':
    case 'card6':
      toggleCard(Number(action.slice(4)) - 1);
      break;
    case 'place': {
      const list = you.value?.blueprints ?? [];
      if (!list.length) break;
      const i = list.findIndex((b) => b.id === placing.value);
      placing.value = list[(i + 1) % list.length]!.id;
      break;
    }
    case 'upgrade':
      if (tw && tw.owner === match.value.you) act({ t: 'upgrade', tower: tw.id });
      break;
    case 'sell':
      if (tw && tw.owner === match.value.you) act({ t: 'sell', tower: tw.id });
      break;
    case 'targeting':
      if (tw && tw.owner === match.value.you) {
        const modes = GAME_DATA.rules.towers.targeting;
        act({
          t: 'target',
          tower: tw.id,
          mode: modes[(modes.indexOf(tw.targeting) + 1) % modes.length]!,
        });
      }
      break;
    case 'research': {
      const weight = [0, 0, 0, 0];
      for (const x of myTowers.value) weight[x.suit]! += x.dmg;
      const suit = weight.indexOf(Math.max(...weight)) as 0 | 1 | 2 | 3;
      act({ t: 'research', suit });
      break;
    }
    case 'chat':
      chatOpen.value = true;
      break;
    case 'pause':
      act({ t: 'pauseVote' });
      break;
    case 'callWave':
      act({ t: 'callWave' });
      break;
    case 'focus':
      if (me.value) board?.focusLane(me.value.lane);
      break;
  }
}
