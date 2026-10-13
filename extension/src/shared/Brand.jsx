// Marque et icônes en composants Preact (panneau, blocs intégrés, popup).
import {ICONS, markInner, strokeFor} from "./brand.mjs";

export function Icon({name, size = 16, class: cls = "", label}) {
  return (
    <svg
      class={`i${cls ? ` ${cls}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeFor(size)}
      stroke-linecap="square"
      stroke-linejoin="miter"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      dangerouslySetInnerHTML={{__html: ICONS[name] || ""}}
    />
  );
}

export const Mark = ({size = 20}) => <svg class="mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{__html: markInner()}} />;
