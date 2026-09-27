import { GAME_DATA } from '@pokertd/sim';
import { t } from '../i18n/strings';
import { lobby, seatId, send, toMenu, toast } from '../state/store';
import { Btn } from './common';
import { ChatBox } from './Overlays';

export function Lobby() {
  const state = lobby.value;
  if (!state) return <div class="lobby">{t('menu.connecting')}</div>;
  const mySeatId = seatId.value;
  const me = state.seats.find((s) => s.id === mySeatId);
  const isHost = !!me?.host;
  const showdown = state.options.mode === 'showdown';
  const maps = GAME_DATA.maps.filter((m) => m.mode === state.options.mode);
  const invite = `${location.origin}/play/${state.code}`;

  return (
    <div class="lobby">
      <header>
        <h1>{t('lobby.title', { code: state.code })}</h1>
        <div class="row">
          <Btn
            onClick={() => {
              void navigator.clipboard?.writeText(invite).then(() => toast(t('lobby.copied')));
            }}
          >
            {t('lobby.invite')}
          </Btn>
          <Btn kind="ghost" onClick={toMenu}>
            {t('lobby.leave')}
          </Btn>
        </div>
      </header>

      <div class="lobby-body">
        <section class="seats">
          <h2>
            Players {state.seats.length}/{state.maxPlayers}
            {state.spectators > 0 && (
              <small> · {t('lobby.spectators', { n: state.spectators })}</small>
            )}
          </h2>
          <ul>
            {state.seats.map((s) => (
              <li
                key={s.id}
                class={['seat', s.ready && 'ready', !s.connected && 'away']
                  .filter(Boolean)
                  .join(' ')}
              >
                <span class="name">
                  {s.name}
                  {s.host && <span class="tag">{t('lobby.host')}</span>}
                  {s.bot && <span class="tag bot">{t('lobby.bot')}</span>}
                  {s.id === mySeatId && <span class="tag you">you</span>}
                  {s.level > 0 && <span class="lvl">Lv {s.level}</span>}
                </span>
                {showdown && (
                  <label class="team">
                    {t('lobby.team')}
                    <select
                      value={s.team}
                      disabled={!isHost}
                      onChange={(e) =>
                        send({ t: 'team', seat: s.id, team: Number(e.currentTarget.value) })
                      }
                    >
                      {Array.from({ length: state.maxPlayers }, (_, i) => (
                        <option key={i} value={i}>
                          {String.fromCharCode(65 + i)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <span class="state">
                  {s.bot
                    ? '🤖'
                    : !s.connected
                      ? 'away'
                      : s.host
                        ? 'deals'
                        : s.ready
                          ? '✔ ' + t('lobby.ready')
                          : t('lobby.notReady')}
                </span>
                {isHost && s.id !== mySeatId && (
                  <button
                    type="button"
                    class="linklike danger"
                    onClick={() => send({ t: 'kick', seat: s.id })}
                  >
                    kick
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div class="row">
            {me && !isHost && (
              <Btn
                kind={me.ready ? 'ghost' : 'primary'}
                onClick={() => send({ t: 'ready', ready: !me.ready })}
              >
                {me.ready ? t('lobby.notReady') : t('lobby.ready')}
              </Btn>
            )}
            {isHost && (
              <>
                <Btn
                  onClick={() => send({ t: 'addBot', style: showdown ? 'raiser' : 'smart' })}
                  disabled={state.seats.length >= state.maxPlayers}
                >
                  {t('lobby.addBot')}
                </Btn>
                <Btn
                  kind="primary"
                  onClick={() => send({ t: 'start' })}
                  disabled={state.seats.length < state.minPlayers}
                >
                  {t('lobby.start')}
                </Btn>
              </>
            )}
          </div>
          {isHost && state.seats.length < state.minPlayers && (
            <p class="hint">Needs at least {state.minPlayers} players (bots count).</p>
          )}
        </section>

        <section class="options">
          <h2>Table</h2>
          <label class="field">
            <span>{t('lobby.mode')}</span>
            <select
              value={state.options.mode}
              disabled={!isHost}
              onChange={(e) => {
                const mode = e.currentTarget.value as 'coop' | 'showdown';
                send({
                  t: 'settings',
                  options: { mode, map: GAME_DATA.maps.find((m) => m.mode === mode)!.id },
                });
              }}
            >
              <option value="coop">{t('mode.coop')}</option>
              <option value="showdown">{t('mode.showdown')}</option>
            </select>
          </label>
          <label class="field">
            <span>{t('lobby.map')}</span>
            <select
              value={state.options.map}
              disabled={!isHost}
              onChange={(e) => send({ t: 'settings', options: { map: e.currentTarget.value } })}
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.players[0]}–{m.players[1]})
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>{t('lobby.difficulty')}</span>
            <select
              value={state.options.difficulty}
              disabled={!isHost}
              onChange={(e) =>
                send({ t: 'settings', options: { difficulty: e.currentTarget.value } })
              }
            >
              {GAME_DATA.rules.difficulties.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {!showdown && (
            <label class="check">
              <input
                type="checkbox"
                checked={!!state.options.endless}
                disabled={!isHost}
                onChange={(e) =>
                  send({ t: 'settings', options: { endless: e.currentTarget.checked } })
                }
              />{' '}
              {t('lobby.endless')}
            </label>
          )}
          <label class="check">
            <input
              type="checkbox"
              checked={state.options.botTakeover !== false}
              disabled={!isHost}
              onChange={(e) =>
                send({ t: 'settings', options: { botTakeover: e.currentTarget.checked } })
              }
            />{' '}
            {t('lobby.takeover')}
          </label>
          <p class="hint">
            {showdown
              ? 'Showdown: raise gold to send creeps into the next opponent’s lane. Last one standing wins.'
              : 'Co-op: each player holds a lane; leaks run through the shared Center Table to the Vault.'}
          </p>
        </section>

        <section class="lobby-chat">
          <ChatBox inline />
        </section>
      </div>
    </div>
  );
}
