import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import * as Sentry from "@sentry/browser";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import { Provider } from "mobx-react";
import { stores } from "./stores";
import { bootSemanticPlayground } from "./services/playground";
import { installDevtools } from "./devtools";

Sentry.init({
  dsn: "https://a21df14579c147e3b7aff794b0bc763a@sentry.io/5172530",
});

bootSemanticPlayground(stores);
if (import.meta.env.DEV) installDevtools();

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <Provider {...stores}>
      <App />
    </Provider>
  </React.StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
