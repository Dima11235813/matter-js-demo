import React, { useEffect } from "react";
import "./App.css";
import { WorldContainer } from "./matterJsComp/WorldContainer";
import { inject, observer } from "mobx-react";
import { MenuStore } from "./stores/MenuStore";

interface WordWorldProps {
  menuStore?: MenuStore;
}

const WordWorld = inject("menuStore")(observer((props: WordWorldProps) => {
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
  }, [props.menuStore?.view]);

  return <div id="worldContainter"></div>;
}));

export default WordWorld;
