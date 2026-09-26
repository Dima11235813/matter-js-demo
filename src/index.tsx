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
import { applyTheme } from "./theme/palette";

// Sentry only runs when a build supplies a DSN (Epic 7 · Task 7.3.1, Epic 4 · Task 4.5.2): dev and
// e2e builds never report. A DSN is not a secret (it only allows sending events), so a VITE_ variable is fine.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) Sentry.init({ dsn: sentryDsn, environment: import.meta.env.MODE });

applyTheme(stores.menuStore.theme);
bootSemanticPlayground(stores);
// The dev handle (window.__lexical) exists in dev and in the CI e2e build (`vite build --mode e2e`),
// never in production: both conditions are build-time constants, so production drops the module.
// CI checks that "__lexical" does not appear in dist/.
if (import.meta.env.DEV || import.meta.env.MODE === "e2e") installDevtools();

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
