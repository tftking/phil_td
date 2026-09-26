import { h, render } from 'preact';
import { buildMapGeometry, mapDef } from '@pokertd/sim';
import { createBoard } from './render/board';
import { HandPanel } from './ui/HandPanel';

// Mount the UI first so the board sizes itself to the space that is left.
render(h(HandPanel, {}), document.getElementById('ui')!);
const geo = buildMapGeometry(mapDef('felt'));
await createBoard(document.getElementById('board')!, geo);
