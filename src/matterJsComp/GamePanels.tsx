import React from "react";
import { observer } from "mobx-react";
import { GameStore } from "../stores/GameStore";
import { RootStore } from "../stores/RootStore";
import { nextRewardAt } from "../game/timedGame";
import { startTimedRound } from "../services/timedGameController";
import { categoryLabel } from "../game/relationPairs";
import { toggleDimension, toggleHintMode, toggleLayout3d } from "../services/playground";
import styles from "./AnalogyDashboard.module.scss";

export const HintToggle = observer(({ stores }: { stores: RootStore }) => {
  const on = stores.gameStore.hintMode;
  return (
    <button
      type="button"
      className={on ? styles.HintOn : styles.HintOff}
      onClick={() => toggleHintMode(stores)}
      aria-pressed={on}
      title="Low gravity: related words orbit each other"
    >
      {on ? "Hints on" : "Hints off"}
    </button>
  );
});

const countLabel = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

/** 2D <-> 3D; 3D exists only in hint mode, so the pill hides when hints are off. */
export const DimensionToggle = observer(({ stores }: { stores: RootStore }) => {
  const { hintMode, dimension } = stores.gameStore;
  if (!hintMode) return null;
  const is3d = dimension === "3d";
  return (
    <button
      type="button"
      className={is3d ? styles.HintOn : styles.HintOff}
      onClick={() => toggleDimension(stores)}
      aria-pressed={is3d}
      title={is3d ? "3D: drag to orbit, scroll to zoom, click words to select, double-click to reset" : "Switch to the 3D view"}
    >
      {is3d ? "3D" : "2D"}
    </button>
  );
});

/** 3D layout model: the board's embedding distances decide the shape, or the Phase 2 orbits. */
export const LayoutToggle = observer(({ stores }: { stores: RootStore }) => {
  const { spaceActive, layout3d } = stores.gameStore;
  if (!spaceActive) return null;
  const shape = layout3d === "shape";
  return (
    <button
      type="button"
      className={shape ? styles.HintOn : styles.HintOff}
      onClick={() => toggleLayout3d(stores)}
      aria-pressed={shape}
      title={shape
        ? "Shape: the board's own embedding distances decide the 3D shape (lines, rings, clusters). Click for orbits."
        : "Orbits: related words orbit their core word. Click for the embedding-shaped layout."}
    >
      {shape ? "Shape" : "Orbits"}
    </button>
  );
});

const formatClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Minimal countdown for the collapsed dashboard. */
export const CompactClock = observer(({ gameStore }: { gameStore: GameStore }) => {
  const { game, remainingMs } = gameStore;
  if (!game || game.phase !== "running") return null;
  return <span className={styles.Clock} aria-label="Time left">{formatClock(remainingMs)}</span>;
});

/** Countdown, word-supply progress, and best score for the running round. */
export const GameHud = observer(({ gameStore }: { gameStore: GameStore }) => {
  const { game, rules, remainingMs, bestScore } = gameStore;
  if (!game || game.phase !== "running") return null;
  const fraction = remainingMs / rules.durationMs;
  const nextAt = nextRewardAt(game, rules);
  return (
    <div className={styles.GameHud} data-testid="game-hud">
      <div className={styles.TimerTrack}>
        <div className={fraction < 0.2 ? styles.TimerFillLow : styles.TimerFill} style={{ width: `${fraction * 100}%` }} />
      </div>
      <div className={styles.HudRow}>
        <span className={styles.Clock}>{formatClock(remainingMs)}</span>
        {gameStore.relationDeal && (
          <span data-testid="round-relation" title="Three dealt pairs share this relation: pick a → b, then c → d from another pair of the same relation, for 100 points">
            relation: <strong>{categoryLabel(gameStore.relationDeal.category)}</strong>
          </span>
        )}
        <span>{countLabel(game.analogies, "analogy", "analogies")} · {countLabel(game.dealt, "word", "words")} dealt</span>
        <span>{nextAt !== undefined ? `+${rules.wordsPerReward} words at ${nextAt} pts` : "no more words this round"}</span>
        <span>best {bestScore}</span>
        <span data-testid="player-rating" title="Your Guess rating: it rises with correct guesses (more for harder relations) and picks how hard each round's relation is">
          rating {gameStore.rating}
          {gameStore.lastRatingChange !== null && gameStore.lastRatingChange !== 0 && (
            <span className={gameStore.lastRatingChange > 0 ? styles.Points : styles.PointsNegative}> {gameStore.lastRatingChange > 0 ? "+" : ""}{gameStore.lastRatingChange}</span>
          )}
        </span>
      </div>
    </div>
  );
});

export const GameOverCard = observer(({ stores }: { stores: RootStore }) => {
  const { game, bestScore, lastRoundWasBest } = stores.gameStore;
  if (!game || game.phase !== "over") return null;
  return (
    <div className={styles.GameOver} data-testid="game-over">
      <div className={styles.GameOverTitle}>{lastRoundWasBest ? "New best!" : "Time's up"}</div>
      <div className={styles.GameOverStats}>
        <span><strong>{game.score}</strong> points</span>
        <span>{countLabel(game.analogies, "analogy", "analogies")}</span>
        <span>best <strong>{bestScore}</strong></span>
      </div>
      <button type="button" className={styles.WordButton} onClick={() => startTimedRound(stores)}>Play again</button>
    </div>
  );
});
