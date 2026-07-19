import React from "react";
import { inject, observer } from "mobx-react";
import { MenuStore } from "../stores/MenuStore";
import styles from "./AnalogyDashboard.module.scss";

interface AnalogyDashboardProps {
  menuStore?: MenuStore;
}

const AnalogyDashboardComponent = (props: AnalogyDashboardProps) => {
  const { score, selectedWordTexts, lastAnalogy, view } = props.menuStore!;

  if (view !== "fountain") {
    return null;
  }

  const renderFormula = () => {
    const wordA = selectedWordTexts[0] || "?";
    const wordB = selectedWordTexts[1] || "?";
    const wordC = selectedWordTexts[2] || "?";

    return (
      <div className={styles.Formula}>
        <span className={wordA !== "?" ? styles.ActiveWord : styles.EmptyWord}>{wordA}</span>
        <span className={styles.Connector}>is to</span>
        <span className={wordB !== "?" ? styles.ActiveWord : styles.EmptyWord}>{wordB}</span>
        <span className={styles.Connector}>as</span>
        <span className={wordC !== "?" ? styles.ActiveWord : styles.EmptyWord}>{wordC}</span>
        <span className={styles.Connector}>is to</span>
        <span className={styles.EmptyWord}>?</span>
      </div>
    );
  };

  return (
    <div className={styles.DashboardRoot}>
      <div className={styles.TopRow}>
        <div className={styles.Logo}>Lexical Fountain</div>
        <div className={styles.ScoreCard}>
          <span className={styles.ScoreLabel}>SCORE</span>
          <span className={styles.ScoreValue}>{score}</span>
        </div>
      </div>
      
      <div className={styles.AnalogyRow}>
        {renderFormula()}
      </div>

      {lastAnalogy && (
        <div className={styles.LogCard}>
          <span className={styles.LogText}>{lastAnalogy}</span>
        </div>
      )}
    </div>
  );
};

export const AnalogyDashboard = inject("menuStore")(observer(AnalogyDashboardComponent));
