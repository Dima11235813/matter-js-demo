import React, { useEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import { WorldContainer } from "./matterJsComp/WorldContainer";
import MainMenu from "./MainMenu/MainMenu";
import WordWorld from "./WordWorld";

function App() {
  return (
    <div className="App">
      <MainMenu/>
      <WordWorld/>
    </div>
  );
}

export default App;
