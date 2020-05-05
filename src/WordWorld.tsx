import React, { useEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import { WorldContainer } from "./matterJsComp/WorldContainer";
import MainMenu from "./MainMenu/MainMenu";

function WordWorld() {
  let world: WorldContainer | null;
  let worldDomContainer: HTMLElement | null;
  let clearWorld = () => {
    worldDomContainer = null;
    world = null;
  };
  useEffect(() => {
    worldDomContainer = document.getElementById("worldContainter");
    if (worldDomContainer) world = new WorldContainer(worldDomContainer);
    return clearWorld;
  });
  return <div id="worldContainter"></div>;
}

export default WordWorld;
