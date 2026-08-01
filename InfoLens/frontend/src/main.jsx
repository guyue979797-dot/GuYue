import { App } from "./App.jsx";

const React = window.React;
const { createRoot } = window.ReactDOMClient;

createRoot(document.getElementById("root")).render(
  React.createElement(App),
);
