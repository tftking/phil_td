import { useEffect, useState } from 'preact/hooks';
import { applyVolumes } from '../audio/sfx';
import { CARD_BACKS, FELT_OPTIONS } from '../cosmetics';
import { t } from '../i18n/strings';
import { type Action, DEFAULT_KEYS, keyName, settings, updateSettings } from '../settings';
import { panel, profile } from '../state/store';
import { Btn, Modal } from './common';

const ACTION_LABELS: Record<Action, string> = {
  deal: 'Deal',
  redraw: 'Redraw marked cards',
  lock: 'Lock hand',
  fold: 'Fold hand',
  card1: 'Toggle card 1',
  card2: 'Toggle card 2',
  card3: 'Toggle card 3',
  card4: 'Toggle card 4',
  card5: 'Toggle card 5',
  card6: 'Toggle card 6 (River)',
  place: 'Next bench tower',
  upgrade: 'Upgrade selected tower',
  sell: 'Sell selected tower',
  targeting: 'Cycle targeting',
  research: 'Research your main suit',
  scoreboard: 'Scoreboard (hold)',
  cheatsheet: 'Hand rankings',
  chat: 'Chat',
  pause: 'Vote pause',
  callWave: 'Send next wave (solo)',
  focus: 'Zoom to your lane',
  cancel: 'Cancel / close',
};

const pretty = (k: string): string =>
  k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k[0]!.toUpperCase() + k.slice(1);

export function SettingsModal() {
  const s = settings.value;
  const [binding, setBinding] = useState<Action | null>(null);
  const level = profile.value?.level ?? 1;

  useEffect(() => {
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      updateSettings({ keys: { ...settings.value.keys, [binding]: keyName(e) } });
      setBinding(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [binding]);

  const slider = (key: 'master' | 'sfx' | 'music', label: string) => (
    <label class="field">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={s[key]}
        onInput={(e) => {
          updateSettings({ [key]: Number(e.currentTarget.value) });
          applyVolumes();
        }}
      />
    </label>
  );
  const check = (
    key: 'fourColorDeck' | 'colorblind' | 'reducedMotion' | 'showOdds',
    label: string,
  ) => (
    <label class="check">
      <input
        type="checkbox"
        checked={s[key]}
        onChange={(e) => updateSettings({ [key]: e.currentTarget.checked })}
      />{' '}
      {label}
    </label>
  );

  return (
    <Modal title={t('settings.title')} onClose={() => (panel.value = 'none')} wide>
      <div class="settings-grid">
        <section>
          <h3>{t('settings.audio')}</h3>
          {slider('master', t('settings.master'))}
          {slider('sfx', t('settings.sfx'))}
          {slider('music', t('settings.music'))}
          <h3>{t('settings.display')}</h3>
          {check('fourColorDeck', t('settings.fourColor'))}
          {check('colorblind', t('settings.colorblind'))}
          {check('reducedMotion', t('settings.reducedMotion'))}
          {check('showOdds', t('settings.showOdds'))}
          <label class="field">
            <span>{t('settings.uiScale')}</span>
            <input
              type="range"
              min={0.8}
              max={1.4}
              step={0.05}
              value={s.uiScale}
              onInput={(e) => updateSettings({ uiScale: Number(e.currentTarget.value) })}
            />
            <b>{Math.round(s.uiScale * 100)}%</b>
          </label>
          <h3>{t('settings.cosmetics')}</h3>
          <label class="field">
            <span>{t('settings.cardBack')}</span>
            <select
              value={s.cardBack}
              onChange={(e) => updateSettings({ cardBack: e.currentTarget.value })}
            >
              {CARD_BACKS.map((c) => (
                <option key={c.id} value={c.id} disabled={c.level > level}>
                  {c.name}
                  {c.level > level ? ` (${t('settings.locked', { n: c.level })})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>{t('settings.felt')}</span>
            <select
              value={s.felt}
              onChange={(e) => updateSettings({ felt: e.currentTarget.value })}
            >
              {FELT_OPTIONS.map((c) => (
                <option key={c.id} value={c.id} disabled={c.level > level}>
                  {c.name}
                  {c.level > level ? ` (${t('settings.locked', { n: c.level })})` : ''}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section>
          <h3>{t('settings.keys')}</h3>
          <table class="keys">
            <tbody>
              {(Object.keys(ACTION_LABELS) as Action[]).map((a) => (
                <tr key={a}>
                  <td>{ACTION_LABELS[a]}</td>
                  <td>
                    <button type="button" class="keycap" onClick={() => setBinding(a)}>
                      {binding === a ? t('settings.pressKey') : pretty(s.keys[a])}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Btn onClick={() => updateSettings({ keys: DEFAULT_KEYS })}>{t('settings.reset')}</Btn>
        </section>
      </div>
    </Modal>
  );
}
