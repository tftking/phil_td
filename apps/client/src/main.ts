import { h, render } from 'preact';
import * as store from './state/store';
import { connectOnline } from './state/store';
import * as gameUi from './ui/Game';
import { App } from './ui/App';
import './style.css';

render(h(App, {}), document.getElementById('app')!);
connectOnline();

// Small hook for automated browser tests and debugging from the console.
(window as unknown as { pokertd: unknown }).pokertd = {
  store,
  tileToClient: (x: number, y: number) => gameUi.board?.tileToClient(x, y) ?? null,
};
