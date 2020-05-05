import React from "react";
import { Route } from "react-router";

//Views
// import Template from './Template'

// const accountRoute = `/${APP_ROUTES.ACCOUNT}`;
// const loginRoute = `/${APP_ROUTES.LOGIN}`;
// const mazeRoute = `/${APP_ROUTES.MAZE}`;

export function AppRoutes() {
  return [
    <Route
      key=""
      exact
      path="/"
      render={() => {
        return <div></div>;
      }}
    />,
  ];
}
