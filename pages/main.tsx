// Entrada estática solo para GitHub Pages: monta el juego sin SSR/auth. No afecta al build web (vite.config.ts).
import { createRoot } from "react-dom/client";
import "./pages.css";
import { Microcosmos } from "../src/components/microcosmos";

createRoot(document.getElementById("root")!).render(<Microcosmos />);
