import { useEffect } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

// Previous / next arrows at the sides of an open window, to move through the
// list it was opened from without closing it. In a right-to-left page the arrow
// on the right goes back and the one on the left goes forward; the keyboard
// arrows do the same (not while typing).
export function ModalArrows({ onPrev, onNext, label = "" }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".lightbox")) return;
      if (event.key === "ArrowLeft" && onNext) { event.preventDefault(); onNext(); }
      if (event.key === "ArrowRight" && onPrev) { event.preventDefault(); onPrev(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onPrev, onNext]);
  if (!onPrev && !onNext) return null;
  return (
    <>
      <button type="button" className="modal-arrow is-prev" disabled={!onPrev} onClick={(event) => { event.stopPropagation(); onPrev?.(); }} onMouseDown={(event) => event.stopPropagation()} aria-label={`${label} הקודם`.trim()}>
        <CaretRight size={20} weight="bold" />
      </button>
      <button type="button" className="modal-arrow is-next" disabled={!onNext} onClick={(event) => { event.stopPropagation(); onNext?.(); }} onMouseDown={(event) => event.stopPropagation()} aria-label={`${label} הבא`.trim()}>
        <CaretLeft size={20} weight="bold" />
      </button>
    </>
  );
}

// Previous / next of `id` in `list` (by `key`), or nothing at the ends
export function stepsIn(list, id, open, key = (entry) => entry.id) {
  const index = list.findIndex((entry) => key(entry) === id);
  if (index < 0) return {};
  return {
    onPrev: index > 0 ? () => open(key(list[index - 1])) : undefined,
    onNext: index < list.length - 1 ? () => open(key(list[index + 1])) : undefined,
  };
}
