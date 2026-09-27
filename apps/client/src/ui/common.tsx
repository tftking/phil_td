import type { ComponentChildren } from 'preact';
import { type Card as CardValue, SUIT_SYMBOLS, cardToString, isJoker, suitOf } from '@pokertd/sim';
import { sfx } from '../audio/sfx';
import { settings } from '../settings';

const FOUR_COLOR = ['#1b1b1b', '#d8454b', '#2a6fd6', '#1f8a4c'];
const TWO_COLOR = ['#1b1b1b', '#d8454b', '#d8454b', '#1b1b1b'];

export function suitColor(suit: number): string {
  return (settings.value.fourColorDeck ? FOUR_COLOR : TWO_COLOR)[suit]!;
}

export function Card(props: {
  card: CardValue;
  marked?: boolean;
  scoring?: boolean;
  small?: boolean;
  onClick?: () => void;
  index?: number;
}) {
  const { card } = props;
  const joker = isJoker(card);
  const suit = joker ? 0 : suitOf(card);
  const rank = joker ? '★' : cardToString(card)[0]!.replace('T', '10');
  const cls = [
    'card',
    props.small && 'small',
    props.marked && 'marked',
    props.scoring && 'scoring',
    props.onClick && 'clickable',
    joker && 'joker',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      class={cls}
      style={{ color: joker ? '#8a3fbf' : suitColor(suit) }}
      onClick={props.onClick}
      aria-label={joker ? 'Joker' : cardToString(card)}
      aria-pressed={props.marked}
    >
      <span class="rank">{rank}</span>
      <span class="suit">{joker ? 'JOKER' : SUIT_SYMBOLS[suit]}</span>
      {props.index !== undefined && <span class="key">{props.index + 1}</span>}
      {settings.value.colorblind && !joker && <span class="cb">{'SHDC'[suit]}</span>}
    </button>
  );
}

export function Btn(props: {
  onClick?: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'danger' | 'ghost';
  title?: string;
  hotkey?: string;
  children: ComponentChildren;
  class?: string;
  /** Submit the surrounding form instead of acting as a plain button. */
  submit?: boolean;
}) {
  return (
    <button
      type={props.submit ? 'submit' : 'button'}
      class={['btn', props.kind, props.class].filter(Boolean).join(' ')}
      disabled={props.disabled}
      title={props.title}
      onClick={() => {
        sfx.click();
        props.onClick?.();
      }}
    >
      {props.children}
      {props.hotkey && <kbd>{props.hotkey === ' ' ? 'Space' : props.hotkey.toUpperCase()}</kbd>}
    </button>
  );
}

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
}) {
  return (
    <div class="modal-backdrop" onClick={props.onClose}>
      <div
        class={['modal', props.wide && 'wide'].filter(Boolean).join(' ')}
        role="dialog"
        aria-label={props.title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{props.title}</h2>
          <button type="button" class="close" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div class="modal-body">{props.children}</div>
      </div>
    </div>
  );
}

export const gold = (n: number): string => `${Math.floor(n).toLocaleString()}g`;
