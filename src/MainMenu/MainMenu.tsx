import { inject, observer } from "mobx-react";
import React from "react";
import { logger } from "../utils/logger";

// import { inject, observer } from "mobx-react";

//Material UI

import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import Paper from "@material-ui/core/Paper";
import MenuItem from "@material-ui/core/MenuItem";
import MenuList from "@material-ui/core/MenuList";

import styles from "./MainMenu.module.scss";

//Icons
import AddIcon from "@material-ui/icons/Add";
import PanToolIcon from "@material-ui/icons/PanTool";
import BubbleChartIcon from "@material-ui/icons/BubbleChart";
import ExtensionIcon from "@material-ui/icons/Extension";
import EmojiEventsIcon from "@material-ui/icons/EmojiEvents";
import SecurityIcon from "@material-ui/icons/Security";
import PersonIcon from "@material-ui/icons/Person";
import PersonOutlineIcon from "@material-ui/icons/PersonOutline";
import TimerIcon from "@material-ui/icons/Timer";
import WbIncandescentIcon from "@material-ui/icons/WbIncandescent";
import { MenuStore, isWordView } from "../stores/MenuStore";
import { GameStore } from "../stores/GameStore";
import { stores } from "../stores";
import { toggleHintMode } from "../services/playground";
import { AppModes } from "../matterJsComp/models/appMode";
//https://material-ui.com/components/material-icons/#material-icons

const menuBackgroundPrimary = "blue";

interface MainMenuProps {
  menuStore?: MenuStore;
  gameStore?: GameStore;
}

const inactiveIconStyle = { color: "rgba(255, 255, 255, 0.5)" };
// function MainMenu() {
const MainMenu = (props: MainMenuProps) => {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement>(null);

  const handleClose = (event: React.MouseEvent<EventTarget>) => {
    if (
      anchorRef.current &&
      anchorRef.current.contains(event.target as HTMLElement)
    ) {
      return;
    }

    setOpen(false);
  };

  function handleListKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Tab") {
      event.preventDefault();
      setOpen(false);
    }
  }

  // return focus to the button when we transitioned from !open -> open
  const prevOpen = React.useRef(open);
  React.useEffect(() => {
    if (prevOpen.current === true && open === false) {
      anchorRef.current!.focus();
    }

    prevOpen.current = open;
  }, [open]);

  const { setMode, mode, setView, view } = props.menuStore!;
  const { hintMode } = props.gameStore!;

  const handleCreateMode = (
    event: React.MouseEvent<EventTarget, MouseEvent>
  ) => {
    logger.log("Create Mode");
    setMode(AppModes.CREATE);
    handleClose(event);
  };
  const handleDragMode = (event: React.MouseEvent<EventTarget, MouseEvent>) => {
    logger.log("Drag Mode");
    setMode(AppModes.MOVE);
    handleClose(event);
  };
  return (
    <div className={styles.MenuRoot}>
      <Paper>
        <ClickAwayListener onClickAway={handleClose}>
          <MenuList
            autoFocusItem={open}
            id="menu-list-grow"
            onKeyDown={handleListKeyDown}
          >
            {
              (mode === AppModes.CREATE ? (
                <MenuItem onClick={handleCreateMode}>
                  <AddIcon 
                   color="primary"
                   htmlColor={menuBackgroundPrimary}
                  />
                </MenuItem>
              ) : (
                <MenuItem onClick={handleCreateMode}>
                  <AddIcon />
                </MenuItem>
              ))
            }
            {
              (mode === AppModes.MOVE ? (
                <MenuItem onClick={handleDragMode}>
                  <PanToolIcon 
                   color="primary"
                   htmlColor={menuBackgroundPrimary}
                  />
                </MenuItem>
              ) : (
                <MenuItem onClick={handleDragMode}>
                  <PanToolIcon />
                </MenuItem>
              ))
            }
            <hr style={{ margin: "8px 0", border: "none", borderTop: "1px solid rgba(255, 255, 255, 0.12)" }} />
            {
              (view === "fountain" ? (
                <MenuItem id="fountain-toggle" onClick={() => setView("fountain")}>
                  <BubbleChartIcon 
                   color="primary"
                   htmlColor={menuBackgroundPrimary}
                  />
                </MenuItem>
              ) : (
                <MenuItem id="fountain-toggle" onClick={() => setView("fountain")}>
                  <BubbleChartIcon style={{ color: "rgba(255, 255, 255, 0.5)" }} />
                </MenuItem>
              ))
            }
            {
              (view === "sandbox" ? (
                <MenuItem id="sandbox-toggle" onClick={() => setView("sandbox")}>
                  <ExtensionIcon 
                   color="primary"
                   htmlColor={menuBackgroundPrimary}
                  />
                </MenuItem>
              ) : (
                <MenuItem id="sandbox-toggle" onClick={() => setView("sandbox")}>
                  <ExtensionIcon style={{ color: "rgba(255, 255, 255, 0.5)" }} />
                </MenuItem>
              ))
            }
            <MenuItem id="game-toggle" title="Timed game" onClick={() => setView("game")}>
              {view === "game"
                ? <TimerIcon color="primary" htmlColor={menuBackgroundPrimary} />
                : <TimerIcon style={inactiveIconStyle} />}
            </MenuItem>
            {isWordView(view) && (
              <MenuItem id="hint-toggle" title={hintMode ? "Hint mode on" : "Hint mode off"} onClick={() => toggleHintMode(stores)}>
                {hintMode
                  ? <WbIncandescentIcon htmlColor="#ffb020" />
                  : <WbIncandescentIcon style={inactiveIconStyle} />}
              </MenuItem>
            )}
          </MenuList>
        </ClickAwayListener>
      </Paper>
    </div>
  );
};

export default inject("menuStore", "gameStore")(observer(MainMenu));
