import { useEffect, useRef, useState } from "react";

// Colours she wants, kept on the server (shown in the Wishlist under "צבעים")
export function useWishColors(wardrobeId) {
  const [colors, setColors] = useState([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/import/wish-colors", { headers: { "x-wardrobe-id": wardrobeId } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (alive && Array.isArray(data?.colors)) setColors(data.colors); })
      .catch(() => {});
    return () => { alive = false; };
  }, [wardrobeId]);
  // One request at a time, so adding several colours quickly keeps them all
  const queue = useRef(Promise.resolve());
  const send = (request) => {
    queue.current = queue.current.then(request).then((res) => (res.ok ? res.json() : null)).then((data) => { if (Array.isArray(data?.colors)) setColors(data.colors); }).catch(() => {});
  };
  const add = (entry) => {
    send(() => fetch("/api/import/wish-colors", { method: "POST", headers: { "Content-Type": "application/json", "x-wardrobe-id": wardrobeId }, body: JSON.stringify(entry) }));
    setColors((current) => (current.some((wish) => wish.hex.toLowerCase() === entry.hex.toLowerCase()) ? current : [{ id: `tmp-${entry.hex}`, ...entry }, ...current]));
  };
  const remove = (id) => {
    setColors((current) => current.filter((wish) => wish.id !== id));
    send(() => fetch(`/api/import/wish-colors/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-wardrobe-id": wardrobeId } }));
  };
  return [colors, add, remove];
}

