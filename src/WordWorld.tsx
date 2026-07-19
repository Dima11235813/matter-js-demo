import React, { useEffect } from "react";
import "./App.css";
import { WorldContainer } from "./matterJsComp/WorldContainer";

function WordWorld() {
  useEffect(() => {
    let world: WorldContainer | null = null;
    const worldDomContainer = document.getElementById("worldContainter");
    if (worldDomContainer) {
      world = new WorldContainer(worldDomContainer);
    }
    return () => {
      if (world) {
        world.destroy();
      }
    };
  }, []);

  return <div id="worldContainter"></div>;
}

export default WordWorld;
