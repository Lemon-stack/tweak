import { createRoot } from "react-dom/client";
import { Overlay } from "./Overlay";

function mount() {
  if (document.getElementById("tweak-root")) return;

  const container = document.createElement("div");
  container.id = "tweak-root";
  container.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483644;";
  document.body.appendChild(container);

  createRoot(container).render(<Overlay />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
