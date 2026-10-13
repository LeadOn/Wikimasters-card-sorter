// Bloc de la Toolbox inséré dans une page du site (« îlot »), isolé dans son propre Shadow DOM :
// les styles du site ne l'atteignent pas, et les siens ne débordent pas sur le site.
// Renvoie update(props) pour re-rendre le bloc avec de nouvelles données.
import {render} from "preact";
import panelCss from "../panel.css";

export function mountIsland(host, Component) {
  const root = host.attachShadow({mode: "open"});
  const style = document.createElement("style");
  style.textContent = panelCss;
  root.append(style);
  const mount = document.createElement("div");
  root.append(mount);
  return (props = {}) => render(<Component {...props} />, mount);
}
