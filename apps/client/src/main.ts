import { h, render } from 'preact';
import * as store from './state/store';
import { connectOnline } from './state/store';
import * as gameUi from './ui/Game';
import { serverBase } from './net/online';
import { App } from './ui/App';
import './style.css';

render(h(App, {}), document.getElementById('app')!);
connectOnline();

// Small hook for automated browser tests and debugging from the console.
(window as unknown as { pokertd: unknown }).pokertd = {
  store,
  tileToClient: (x: number, y: number) => gameUi.board?.tileToClient(x, y) ?? null,
};

// Report uncaught errors to the server (best effort, a few per session).
let reported = 0;
function report(message: string, stack?: string): void {
  if (reported++ >= 5 || location.protocol === 'file:') return;
  const body = JSON.stringify({
    message: message.slice(0, 500),
    stack: stack?.slice(0, 2000),
    url: location.pathname,
    ua: navigator.userAgent,
  });
  void fetch(`${serverBase()}/client-errors`, { method: 'POST', body, keepalive: true }).catch(
    () => {},
  );
}
window.addEventListener('error', (e) => report(e.message, (e.error as Error | undefined)?.stack));
window.addEventListener('unhandledrejection', (e) =>
  report(String((e.reason as Error)?.message ?? e.reason), (e.reason as Error)?.stack),
);
