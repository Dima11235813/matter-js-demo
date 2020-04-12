import React from "react";

// import { inject, observer } from "mobx-react";

//Material UI

import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import Paper from "@material-ui/core/Paper";
import MenuItem from "@material-ui/core/MenuItem";
import MenuList from "@material-ui/core/MenuList";
import { makeStyles, createStyles, Theme } from "@material-ui/core/styles";

import styles from './MainMenu.module.scss'

//Icons
import AddIcon from "@material-ui/icons/Add";
import PanToolIcon from "@material-ui/icons/PanTool";
//https://material-ui.com/components/material-icons/#material-icons

// interface MainMenuProps {
// }
// const MainMenu = (props: MainMenuProps) => {
const MainMenu = () => {
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

  const handleCreateMode = (
    event: React.MouseEvent<EventTarget, MouseEvent>
  ) => {
    console.log("Create Mode");
    handleClose(event);
  };
  const handleDragMode = (event: React.MouseEvent<EventTarget, MouseEvent>) => {
    console.log("Drag Mode");
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
            <MenuItem onClick={handleCreateMode}>
              <AddIcon />
            </MenuItem>
            <MenuItem onClick={handleDragMode}>
              <PanToolIcon />
            </MenuItem>
          </MenuList>
        </ClickAwayListener>
      </Paper>
    </div>
  );
};
export default MainMenu;
// export default inject("webPaintStore")(observer(MainMenu));
