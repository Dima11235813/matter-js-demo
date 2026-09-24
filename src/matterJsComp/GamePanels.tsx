import React from "react";
import { observer } from "mobx-react";
import { GameStore } from "../stores/GameStore";
import { RootStore } from "../stores/RootStore";
import { nextRewardAt } from "../game/timedGame";
import { startTimedRound } from "../services/timedGameController";
import { toggleHintMode } from "../services/playground";
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
        <span>{countLabel(game.analogies, "analogy", "analogies")} · {countLabel(game.dealt, "word", "words")} dealt</span>
        <span>{nextAt !== undefined ? `+${rules.wordsPerReward} words at ${nextAt} pts` : "no more words this round"}</span>
        <span>best {bestScore}</span>
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
