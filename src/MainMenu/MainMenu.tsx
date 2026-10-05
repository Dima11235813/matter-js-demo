import { inject, observer } from "mobx-react";
import React from "react";
import { logger } from "../utils/logger";

//Material UI
import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import Paper from "@material-ui/core/Paper";
import MenuItem from "@material-ui/core/MenuItem";
import MenuList from "@material-ui/core/MenuList";
import Divider from "@material-ui/core/Divider";
import Tooltip from "@material-ui/core/Tooltip";

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
import Brightness4Icon from "@material-ui/icons/Brightness4";
import Brightness7Icon from "@material-ui/icons/Brightness7";
import ThreeDRotationIcon from "@material-ui/icons/ThreeDRotation";
import ListAltIcon from "@material-ui/icons/ListAlt";
import PolicyIcon from "@material-ui/icons/Policy";
import PaletteIcon from "@material-ui/icons/Palette";
import DeviceHubIcon from "@material-ui/icons/DeviceHub";
import { MenuStore, isWordView } from "../stores/MenuStore";
import { GameStore } from "../stores/GameStore";
import { stores } from "../stores";
import { toggleColorHints, toggleDimension, toggleHintMode, toggleTheme } from "../services/playground";
import { AppModes } from "../matterJsComp/models/appMode";
//https://material-ui.com/components/material-icons/#material-icons

interface MainMenuProps {
  menuStore?: MenuStore;
  gameStore?: GameStore;
}

interface MenuButtonProps {
  id?: string;
  tooltip: string;
  active: boolean;
  onClick: (event: React.MouseEvent<EventTarget>) => void;
  icon: React.ReactElement;
}

/**
 * One icon button with a tooltip and an accessible name. Colors come from the MUI theme
 * (primary = active, action = inactive), so icons stay visible in both dark and light mode.
 */
const MenuButton = ({ id, tooltip, active, onClick, icon }: MenuButtonProps) => (
  <Tooltip title={tooltip} placement="right" arrow>
    <MenuItem id={id} aria-label={tooltip} aria-pressed={active} selected={active} onClick={onClick}>
      {React.cloneElement(icon, { color: active ? "primary" : "action" })}
    </MenuItem>
  </Tooltip>
);

const MainMenu = (props: MainMenuProps) => {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement>(null);

  const handleClose = (event: React.MouseEvent<EventTarget>) => {
    if (anchorRef.current && anchorRef.current.contains(event.target as HTMLElement)) {
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
      anchorRef.current?.focus();
    }
    prevOpen.current = open;
  }, [open]);

  const { setMode, mode, setView, view, theme, analogiesOpen, boardAnalogies, setAnalogiesOpen, privacyOpen, setPrivacyOpen } = props.menuStore!;
  const { hintMode, dimension } = props.gameStore!;

  const handleCreateMode = (event: React.MouseEvent<EventTarget>) => {
    logger.log("Create Mode");
    setMode(AppModes.CREATE);
    handleClose(event);
  };
  const handleDragMode = (event: React.MouseEvent<EventTarget>) => {
    logger.log("Drag Mode");
    setMode(AppModes.MOVE);
    handleClose(event);
  };

  return (
    <div className={styles.MenuRoot}>
      <Paper>
        <ClickAwayListener onClickAway={handleClose}>
          <MenuList autoFocusItem={open} id="menu-list-grow" onKeyDown={handleListKeyDown}>
            <MenuButton tooltip="Create: click the canvas to add words" active={mode === AppModes.CREATE} onClick={handleCreateMode} icon={<AddIcon />} />
            <MenuButton tooltip="Move: drag words around" active={mode === AppModes.MOVE} onClick={handleDragMode} icon={<PanToolIcon />} />
            <Divider />
            <MenuButton id="fountain-toggle" tooltip="Discovery: pick three words and the model answers with a fourth that lands on the board" active={view === "fountain"} onClick={() => setView("fountain")} icon={<BubbleChartIcon />} />
            <MenuButton id="sandbox-toggle" tooltip="Letters: drop letters that combine into words" active={view === "sandbox"} onClick={() => setView("sandbox")} icon={<ExtensionIcon />} />
            <MenuButton id="puzzle-toggle" tooltip="Connect: add words until every word has two connections; beat par" active={view === "puzzle"} onClick={() => setView("puzzle")} icon={<DeviceHubIcon />} />
            <MenuButton id="game-toggle" tooltip="Guess: 2 minutes, dealt relation pairs; pick four words that form an analogy for 100 points" active={view === "game"} onClick={() => setView("game")} icon={<TimerIcon />} />
            <Divider />
            {isWordView(view) && (
              <MenuButton
                id="hint-toggle"
                tooltip={hintMode ? "Hint mode on: related words orbit each other" : "Hint mode off: turn on to see related words orbit"}
                active={hintMode}
                onClick={() => toggleHintMode(stores)}
                icon={<WbIncandescentIcon />}
              />
            )}
            {isWordView(view) && hintMode && (
              <MenuButton
                id="dimension-toggle"
                tooltip={dimension === "3d" ? "3D view on: drag to orbit, scroll to zoom" : "Switch to the 3D view"}
                active={dimension === "3d"}
                onClick={() => toggleDimension(stores)}
                icon={<ThreeDRotationIcon />}
              />
            )}
            {isWordView(view) && (
              <MenuButton
                id="color-hint-toggle"
                tooltip={stores.gameStore.colorHints ? "Color hints on: similar meanings share similar colors" : "Color hints: color words by meaning, so related words share a hue"}
                active={stores.gameStore.colorHints}
                onClick={() => toggleColorHints(stores)}
                icon={<PaletteIcon />}
              />
            )}
            {isWordView(view) && (
              <MenuButton
                id="analogies-toggle"
                tooltip={`Analogies on this board (${boardAnalogies.length}): click one to focus on it`}
                active={analogiesOpen}
                onClick={() => setAnalogiesOpen(!analogiesOpen)}
                icon={<ListAltIcon />}
              />
            )}
            <MenuButton
              id="privacy-toggle"
              tooltip="Account, privacy & your data: sign in and sync, research sharing, export, erase"
              active={privacyOpen}
              onClick={() => setPrivacyOpen(!privacyOpen)}
              icon={<PolicyIcon />}
            />
            <MenuButton
              id="theme-toggle"
              tooltip={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              active={false}
              onClick={() => toggleTheme(stores)}
              icon={theme === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
            />
          </MenuList>
        </ClickAwayListener>
      </Paper>
    </div>
  );
};

export default inject("menuStore", "gameStore")(observer(MainMenu));
