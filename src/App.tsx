import React, { useMemo } from "react";
import { observer } from "mobx-react";
import { createMuiTheme, ThemeProvider } from "@material-ui/core/styles";
import "./App.css";
import MainMenu from "./MainMenu/MainMenu";
import WordWorld from "./WordWorld";
import { AnalogyDashboard } from "./matterJsComp/AnalogyDashboard";
import { BoardAnalogies } from "./matterJsComp/BoardAnalogies";
import { PrivacyPanel } from "./matterJsComp/PrivacyPanels";
import { SessionsPanel } from "./matterJsComp/SessionsPanel";
import { stores } from "./stores";
import { uiPalettes } from "./theme/palette";

/** MUI components (the side menu, tooltips) follow the same palette as the rest of the app. */
const App = observer(() => {
  const { theme } = stores.menuStore;
  const muiTheme = useMemo(() => {
    const ui = uiPalettes[theme];
    return createMuiTheme({
      palette: {
        type: theme,
        primary: { main: ui.accent },
        background: { paper: ui.surface, default: ui.surface },
        text: { primary: ui.text, secondary: ui.textMuted },
      },
    });
  }, [theme]);

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="App">
        <MainMenu />
        <AnalogyDashboard />
        <BoardAnalogies />
        <PrivacyPanel />
        <SessionsPanel />
        <WordWorld />
      </div>
    </ThemeProvider>
  );
});

export default App;
