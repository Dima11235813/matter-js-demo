import { inject, observer } from "mobx-react";
import React from "react";

// import { inject, observer } from "mobx-react";

//Material UI

import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import Paper from "@material-ui/core/Paper";
import MenuItem from "@material-ui/core/MenuItem";
import MenuList from "@material-ui/core/MenuList";
import { makeStyles, createStyles, Theme } from "@material-ui/core/styles";

import styles from "./MainMenu.module.scss";

//Icons
import AddIcon from "@material-ui/icons/Add";
import PanToolIcon from "@material-ui/icons/PanTool";
import { MenuStore } from "../stores/MenuStore";
import { AppModes } from "../matterJsComp/models/appMode";
//https://material-ui.com/components/material-icons/#material-icons

const menuBackgroundPrimary = "blue";

interface MainMenuProps {
  menuStore?: MenuStore;
}
// function MainMenu() {
const MainMenu = (props: MainMenuProps) => {
  const useStyles = makeStyles((theme: Theme) =>
    createStyles({
      root: {
        display: "flex",
      },
      paper: {
        marginRight: theme.spacing(2),
      },
    })
  );
  const classes = useStyles();
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

  const { setMode, mode } = props.menuStore!;

  const handleCreateMode = (
    event: React.MouseEvent<EventTarget, MouseEvent>
  ) => {
    console.log("Create Mode");
    setMode(AppModes.CREATE);
    handleClose(event);
  };
  const handleDragMode = (event: React.MouseEvent<EventTarget, MouseEvent>) => {
    console.log("Drag Mode");
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
          </MenuList>
        </ClickAwayListener>
      </Paper>
    </div>
  );
};

export default inject("menuStore")(observer(MainMenu));
