import type { HandCategory } from '../cards/evaluate';

export type TargetingMode = 'first' | 'last' | 'strongest' | 'weakest' | 'closest' | 'flying';

export interface TowerDef {
  id: string;
  name: string;
  hand: HandCategory;
  damage: number;
  attacksPerSecond: number;
  range: number;
  hitsAir: boolean;
  targets?: number;
  defaultTargeting?: TargetingMode;
  bossDamageBonus?: number;
  chain?: { bounces: number; falloff: number; radius: number };
  splash?: number;
  minRange?: number;
  suitMultiplier?: number;
  beam?: { minDps: number; maxDps: number; rampSeconds: number };
  aura?: { radius: number; damageBonus: number };
  copy?: { powerMultiplier: number };
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  armor: number;
  count: number;
  leak: number;
  flying?: boolean;
  boss?: boolean;
  regenPerSecond?: number;
  shield?: number;
  splitInto?: { enemy: string; count: number };
}

export interface WaveModifierDef {
  id: string;
  name: string;
  desc: string;
  countMult?: number;
  speedMult?: number;
  armorMult?: number;
  bountyMult?: number;
  waveBonusMult?: number;
  towerRangeDelta?: number;
}

export interface WaveDef {
  wave: number;
  mix: Record<string, number>;
  tags?: ('boss' | 'final' | 'air' | 'bonus')[];
  name?: string;
  hpMult?: number;
  bountyMult?: number;
  /** Number of random modifiers rolled for this wave. */
  modifiers?: number;
}

export interface WavesData {
  formulas: {
    baseHp: number;
    hpGrowth: number;
    armorEveryWaves: number;
    baseSpeedTilesPerSecond: number;
    bountyBase: number;
    bountyEveryWaves: number;
    baseCount: number;
    countPerTwoWaves: number;
    minDamageFraction: number;
  };
  timing: {
    waveSeconds: number;
    bossWaveSeconds: number;
    spawnSecondsMin: number;
    spawnSecondsMax: number;
    firstWaveDelaySeconds: number;
  };
  modifiers: WaveModifierDef[];
  schedule: WaveDef[];
}

export interface DifficultyDef {
  id: string;
  name: string;
  hpMult: number;
  bountyMult: number;
  lives: number;
  livesPerPlayer: number;
}

export interface RulesData {
  economy: {
    startingGold: number;
    waveBonusBase: number;
    waveBonusPerWave: number;
    interestRate: number;
    interestCap: number;
  };
  cards: {
    handSize: number;
    dealCost: number;
    redrawCosts: number[];
    placeTimeoutSeconds: number;
    benchSlots: number;
    maxBenchSlots: number;
    maxJokers: number;
    minDeckSize: number;
    powerPerRank: number;
  };
  towers: {
    maxLevel: number;
    damagePerLevel: number;
    rangePerLevel: number;
    upgradeCostFactor: number;
    sellRefund: number;
    sellGraceSeconds: number;
    scrapRefund: number;
    targeting: TargetingMode[];
  };
  suits: {
    suit: number;
    id: string;
    name: string;
    base: number;
    perLevel: number;
    desc: string;
    max?: number;
    critMultiplier?: number;
    durationSeconds?: number;
  }[];
  research: { costs: number[]; seconds: number };
  shop: {
    everyWaves: number;
    openSeconds: number;
    offers: number;
    items: { id: string; name: string; cost: number; desc: string }[];
  };
  difficulties: DifficultyDef[];
  coop: {
    centerTowersPerPlayer: number;
    centerWidth: number;
    potPerPlayer: number;
    slipsPerWave: number;
    pauseSecondsPerMatch: number;
    disconnectGraceSeconds: number;
  };
  showdown: {
    lives: number;
    suddenDeathWave: number;
    suddenDeathHpGrowth: number;
    startingIncome: number;
    /** HP multiplier for raised (sent) creeps. */
    sendHpMult: number;
    /** Bounty the target earns for killing a raised creep (0 = none). */
    sendBountyMult: number;
  };
  /** Hands at or above this category trigger the lobby-wide banner. */
  bigHandCategory: number;
}

export type Point = [number, number];

export interface MapDef {
  id: string;
  name: string;
  mode: 'coop' | 'showdown';
  players: [number, number];
  /** Creep HP multiplier for this map (short lanes need less HP). Default 1. */
  hpMult?: number;
  /** One lane, in local tile coordinates. The layout builder places one per player. */
  lane: {
    width: number;
    height: number;
    ground: Point[];
    air: Point[];
    /** Rectangles of buildable tiles: [x, y, width, height]. */
    buildAreas: [number, number, number, number][];
    hotTiles: { x: number; y: number; bonus: 'range' | 'damage'; amount: number }[];
  };
}

export interface SendDef {
  id: string;
  name: string;
  enemy: string;
  count: number;
  cost: number;
  income: number;
  unlockWave: number;
  hpMult?: number;
  cooldownWaves?: number;
}

export interface GameData {
  towers: TowerDef[];
  enemies: EnemyDef[];
  waves: WavesData;
  rules: RulesData;
  maps: MapDef[];
  sends: SendDef[];
}
