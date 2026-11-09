import { App } from "./app/App.jsx";
import React from "./lib/react.js";

const { createRoot } = window.ReactDOMClient;

createRoot(document.getElementById("root")).render(
  React.createElement(App),
);
