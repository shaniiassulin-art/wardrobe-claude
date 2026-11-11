import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise, Camera, CaretDown, Check, Funnel, Heart, ImageSquare, MagicWand, MagnifyingGlass, Plus, Sparkle, X } from "@phosphor-icons/react";
import { COLOR_FAMILIES, colorFamily } from "./colors.js";
import { CLOSE, SAMPLE_CLOSE, deltaE, deltaE2000, hexToLab } from "./color-match.js";
import { WADA_COLORS, WADA_PALETTES } from "./wada-palettes.js";
import { ModalArrows, stepsIn } from "./ModalArrows.jsx";
import { useWishColors } from "./wish-colors.js";
import { MYTHERESA_COLOR_KEYS, MYTHERESA_COLORS, MYTHERESA_PALETTES } from "./mytheresa-palettes.js";

const toHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

// The colour of a spot on a photo: the median of a small patch, so a thread,
// a shadow or a highlight does not change the result
function sampleColor(canvas, x, y, radius) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const left = Math.max(0, Math.round(x - radius));
  const top = Math.max(0, Math.round(y - radius));
  const size = Math.max(1, Math.round(radius * 2));
  const { data } = context.getImageData(left, top, Math.min(size, canvas.width - left), Math.min(size, canvas.height - top));
  const channels = [[], [], []];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
  const median = (list) => { const sorted = list.sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] || 0; };
  return toHex(median(channels[0]), median(channels[1]), median(channels[2]));
}

// Two existing collections: the colours that appear together in Mytheresa's
// official looks (Garments2Look dataset), and the Japanese colour book
export const SOURCES = [
  { id: "all", label: "הכל" },
  { id: "mytheresa", label: "לוקים של Mytheresa" },
  { id: "wada", label: "ספר הצבעים היפני" },
];
const color = (source) => ([name, hex]) => ({ name, hex, source, lab: hexToLab(hex), family: colorFamily(hex) });
const WADA = WADA_COLORS.map(color("wada"));
const MYTHERESA = MYTHERESA_COLORS.map(color("mytheresa")).map((entry, index) => ({ ...entry, search: { lightblue: "light blue" }[MYTHERESA_COLOR_KEYS[index]] || MYTHERESA_COLOR_KEYS[index] }));
// A plain English colour word for searching looks (the book's names are too rare)
const FAMILY_WORDS = { black: "black", white: "white", gray: "grey", beige: "beige", brown: "brown", red: "red", pink: "pink", orange: "orange", yellow: "yellow", green: "green", turquoise: "teal", blue: "blue", purple: "purple" };
const searchWord = (entry) => entry.search || FAMILY_WORDS[entry.family] || entry.name;
// Pinterest search for outfits in a combination's colours
const pinterestUrl = (palette) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(`${[...new Set(palette.colors.map(searchWord))].join(" ")} outfit`)}`;
const COLORS = [...MYTHERESA, ...WADA];
// The colours for filtering: near-identical ones (ΔE under 8) become one
// swatch, grouped by family and ordered light to dark
const SHADES = (() => {
  const groups = [];
  COLORS.forEach((color, index) => {
    const group = groups.find((entry) => entry.members.every((i) => deltaE(COLORS[i].lab, color.lab) < 8));
    if (group) group.members.push(index); else groups.push({ members: [index] });
  });
  return groups.map((group, id) => ({ id, members: group.members, hex: COLORS[group.members[0]].hex, name: COLORS[group.members[0]].name, names: group.members.map((i) => COLORS[i].name).join(" / "), family: COLORS[group.members[0]].family, lab: COLORS[group.members[0]].lab }));
})();
const SHADE_OF = new Map(SHADES.flatMap((shade) => shade.members.map((i) => [COLORS[i], shade.id])));
const SHADE_ROWS = COLOR_FAMILIES
  .map((family) => ({ ...family, shades: SHADES.filter((shade) => shade.family === family.id).sort((a, b) => b.lab[0] - a.lab[0]) }))
  .filter((row) => row.shades.length);

// `key` is unique across both collections (favourites are kept by it)
const PALETTES = [
  ...MYTHERESA_PALETTES.map(([number, indexes, outfits]) => ({ key: 3000 + number, number, outfits, source: "mytheresa", label: `Mytheresa ${number}`, colors: indexes.map((i) => MYTHERESA[i]) })),
  ...WADA_PALETTES.map(([number, indexes]) => ({ key: number, number, source: "wada", label: `#${number}`, colors: indexes.map((i) => WADA[i]) })),
];
const inSource = (source) => (palette) => source === "all" || palette.source === source;
const forLook = (palette) => ({ number: palette.number, label: palette.label, colors: palette.colors.map((entry) => ({ hex: entry.hex, name: entry.name })) });
// How many combinations each shade appears in, per collection
const SHADE_COUNTS = Object.fromEntries(SOURCES.map((source) => {
  const counts = new Map();
  for (const palette of PALETTES.filter(inSource(source.id))) {
    for (const id of new Set(palette.colors.map((entry) => SHADE_OF.get(entry)))) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [source.id, counts];
}));


// Every recommended combination from Sanzo Wada's "A Dictionary of Colour
// Combinations", filtered by a colour of the book or a scanned garment, with the
// wardrobe pieces that match each colour and a quick way to make a look of them
// Favourite combinations, kept on the server with the profile (so on every device)
function useComboFavorites(wardrobeId) {
  const [favorites, setFavorites] = useState([]);
  const latest = useRef([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/import/combo-favorites", { headers: { "x-wardrobe-id": wardrobeId } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (alive && Array.isArray(data?.favorites)) { latest.current = data.favorites; setFavorites(data.favorites); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [wardrobeId]);
  const toggle = (number) => {
    const before = latest.current;
    const next = before.includes(number) ? before.filter((n) => n !== number) : [...before, number];
    latest.current = next;
    setFavorites(next);
    fetch("/api/import/combo-favorites", { method: "PUT", headers: { "Content-Type": "application/json", "x-wardrobe-id": wardrobeId }, body: JSON.stringify({ favorites: next }) })
      .then((res) => { if (!res.ok) throw new Error(); })
      .catch(() => { latest.current = before; setFavorites(before); });
  };
  return [favorites, toggle];
}

function HeartButton({ on, onClick, className = "" }) {
  return (
    <button type="button" className={`combo__heart${on ? " is-on" : ""} ${className}`} aria-pressed={on} aria-label={on ? "הסרה מהמועדפים" : "הוספה למועדפים"} onClick={onClick}>
      <Heart size={17} weight={on ? "fill" : "regular"} />
    </button>
  );
}

export function ColorCombos({ items, wardrobeId = "user-shani", onCreateLook }) {
  const [favorites, toggleFavorite] = useComboFavorites(wardrobeId);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [source, setSourceState] = useState("all");
  const setSource = (value) => { setSourceState(value); setShadeIds([]); setFamilyIds([]); };
  // A combination opened from its card: its colours large, to add one to the Wishlist
  const [openKey, setOpenKey] = useState(null);
  const [wishColors, addWishColor] = useWishColors(wardrobeId);
  // Several colours can be chosen: a combination has to have all of them. A shade
  // chosen within a colour narrows that colour to the shade.
  const [shadeIds, setShadeIds] = useState([]);
  const [familyIds, setFamilyIds] = useState([]);
  const toggleFamily = (id) => {
    setFamilyIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    setShadeIds((current) => current.filter((sid) => SHADES[sid].family !== id));
    setSamples([]);
  };
  const toggleShade = (id) => setShadeIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Cleared with the site's other filters after being away a while (see App)
  useEffect(() => {
    const reset = () => { setSourceState("all"); setShadeIds([]); setFamilyIds([]); setSize(0); setOnlyFavorites(false); setSamples([]); setPieceId(null); setFiltersOpen(false); };
    window.addEventListener("wardrobe:reset-filters", reset);
    return () => window.removeEventListener("wardrobe:reset-filters", reset);
  }, []);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [pieceId, setPieceId] = useState(null);
  const [size, setSize] = useState(0);
  // A garment photo (camera or gallery): its colour, picked by touching it
  const [scan, setScan] = useState(null); // { photo, hex, x, y }
  // Colours sampled from one or more photos; combinations are found for them together
  const [samples, setSamples] = useState([]); // [{ id, hex, lab }]
  const fileRef = useRef(null);
  const galleryRef = useRef(null);
  // The last photo sampled, to sample another colour from it
  const lastPhotoRef = useRef(null);
  const scannedRef = useRef(null);
  // A sample matches the book's colours that look the same as it (ΔE2000). When the
  // book has none that close, the ones nearest to it, so there is always an answer.
  const addSample = (hex) => setSamples((current) => {
    if (current.some((sample) => sample.hex === hex)) return current;
    const lab = hexToLab(hex);
    const nearest = Math.min(...COLORS.filter((entry) => source === "all" || entry.source === source).map((entry) => deltaE2000(lab, entry.lab)));
    return [...current, { id: `${hex}-${Date.now()}`, hex, lab, exact: nearest <= SAMPLE_CLOSE, within: Math.max(SAMPLE_CLOSE, nearest + 2.5) }];
  });
  const removeSample = (id) => setSamples((current) => current.filter((sample) => sample.id !== id));
  const canvasRef = useRef(null);
  const openPhoto = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvasRef.current = canvas;
      // Starts from the middle of the photo, where the garment usually is
      const x = canvas.width / 2;
      const y = canvas.height / 2;
      setScan({ photo: canvas.toDataURL("image/jpeg", 0.85), hex: sampleColor(canvas, x, y, Math.min(canvas.width, canvas.height) * 0.08), x: 0.5, y: 0.5 });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };
  const pickAt = (event) => {
    const canvas = canvasRef.current;
    if (!canvas || !scan) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fx = (event.clientX - box.left) / box.width;
    const fy = (event.clientY - box.top) / box.height;
    setScan({ ...scan, x: fx, y: fy, hex: sampleColor(canvas, fx * canvas.width, fy * canvas.height, Math.min(canvas.width, canvas.height) * 0.03) });
  };
  const pieces = useMemo(() => items
    .map((item) => ({ item, lab: hexToLab(item.color), lab2: hexToLab(item.secondaryColor) }))
    .filter((entry) => entry.lab), [items]);
  const piece = pieces.find((entry) => entry.item.id === pieceId) || null;

  // For one colour of a combination: the wardrobe pieces close to it, closest first
  const matchesFor = (color) => pieces
    .map((entry) => ({ ...entry, d: Math.min(deltaE(entry.lab, color.lab), deltaE(entry.lab2, color.lab)) }))
    .filter((entry) => entry.d <= CLOSE)
    .sort((a, b) => a.d - b.d);

  const candidates = useMemo(() => PALETTES
    .filter(inSource(source))
    .filter((palette) => !onlyFavorites || favorites.includes(palette.key))
    .filter((palette) => !size || palette.colors.length === size)
    .filter((palette) => familyIds.every((family) => {
      const shadesHere = shadeIds.filter((sid) => SHADES[sid].family === family);
      return shadesHere.length
        ? palette.colors.some((color) => shadesHere.includes(SHADE_OF.get(color)))
        : palette.colors.some((color) => color.family === family);
    }))
    .filter((palette) => !piece || palette.colors.some((color) => Math.min(deltaE(piece.lab, color.lab), deltaE(piece.lab2, color.lab)) <= CLOSE))
    .map((palette) => {
      // The colour of the combination closest to each sampled colour, when close enough
      const sampledAt = samples.map((sample) => {
        let best = -1;
        palette.colors.forEach((color, index) => { const d = deltaE2000(sample.lab, color.lab); if (d <= sample.within && (best < 0 || d < deltaE2000(sample.lab, palette.colors[best].lab))) best = index; });
        return best;
      });
      return { ...palette, sampledAt, sampled: sampledAt.filter((index) => index >= 0).length, matches: palette.colors.map(matchesFor) };
    }),
  [shadeIds, familyIds, piece, samples, size, pieces, onlyFavorites, favorites, source]); // eslint-disable-line react-hooks/exhaustive-deps
  // With sampled colours: the combinations that have all of them, or if there are
  // none, the ones that have the most of them
  const bestSampled = samples.length ? Math.max(0, ...candidates.map((palette) => palette.sampled)) : 0;
  const shown = samples.length ? candidates.filter((palette) => bestSampled > 0 && palette.sampled === bestSampled) : candidates;

  const active = Boolean(familyIds.length || piece || samples.length || size || onlyFavorites);

  return (
    <section className="combos" aria-label="שילובי צבעים">
      <div className="combos__intro">
        <h2>שילובי צבעים</h2>
        <div className="combos__row combos__actions">
          <button type="button" className="combos__daily-btn" onClick={() => setDailyOpen(true)}>
            <Sparkle size={16} aria-hidden="true" /> השילוב היומי
          </button>
          {!scan && !samples.length && (
            <>
              <button type="button" className="combos__scan-btn" onClick={() => fileRef.current?.click()} aria-label="צילום בגד לדגימת צבע">
                <Camera size={17} aria-hidden="true" /> צילום
              </button>
              <button type="button" className="combos__scan-btn is-light" onClick={() => galleryRef.current?.click()} aria-label="תמונה מהגלריה לדגימת צבע">
                <ImageSquare size={17} aria-hidden="true" /> גלריה
              </button>
            </>
          )}
        </div>
      </div>

      <div className="combos__filters">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { openPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(event) => { openPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        {scan && (
          <div className="combos__scan">
            <div className="combos__scan-top">
              <p className="combos__scan-hint">געי בצבע בתמונה ולחצי "הוספת הצבע"</p>
              <button type="button" className="lb-close combos__scanned-x" onClick={() => setScan(null)} aria-label="סגירת התמונה"><X size={14} /></button>
            </div>
            <div className="combos__scan-photo" onClick={pickAt} role="button" tabIndex={0} aria-label="בחירת הצבע בתמונה">
              <img src={scan.photo} alt="התמונה לדגימה" />
              <span className="combos__scan-mark" style={{ left: `${scan.x * 100}%`, top: `${scan.y * 100}%`, background: scan.hex }} aria-hidden="true" />
            </div>
            <div className="combos__scan-actions">
              <span className="combos__scan-swatch" style={{ background: scan.hex }} aria-hidden="true" />
              <button type="button" className="combo__look" disabled={samples.some((sample) => sample.hex === scan.hex)} onClick={() => {
                addSample(scan.hex); setPieceId(null); setShadeIds([]); setFamilyIds([]);
                lastPhotoRef.current = { ...scan, canvas: canvasRef.current };
                setScan(null);
                requestAnimationFrame(() => scannedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}>
                <Plus size={13} aria-hidden="true" /> {samples.some((sample) => sample.hex === scan.hex) ? "נוסף" : "הוספת הצבע"}
              </button>
            </div>
            <div className="combos__scan-actions">
              <button type="button" className="filter-chip" onClick={() => fileRef.current?.click()}><Camera size={13} aria-hidden="true" /> צילום אחר</button>
              <button type="button" className="filter-chip" onClick={() => galleryRef.current?.click()}><ImageSquare size={13} aria-hidden="true" /> תמונה אחרת מהגלריה</button>
            </div>
            <p className="combos__scan-note">כדאי לצלם באור יום, בלי פלאש. תאורה חמה או צל משנים את הגוון.</p>
          </div>
        )}
        {!scan && samples.length > 0 && (
          <div className="combos__scanned" ref={scannedRef}>
            <div className="combos__scanned-top">
              <p>
                <strong>{samples.length === 1 ? "שילובים לצבע שדגמת" : `שילובים ל-${samples.length} הצבעים שדגמת`}</strong>
                <span>
                  {bestSampled === samples.length || samples.length === 1
                    ? (samples.length === 1 ? "הצבע הקרוב אליו מסומן בכל שילוב בנקודה לבנה" : "בכל שילוב יש את כל הצבעים שדגמת, מסומנים בנקודה לבנה")
                    : bestSampled > 0 ? `אין שילוב עם כל הצבעים. אלה השילובים עם ${bestSampled} מהם` : "אין שילוב עם הצבעים האלה"}
                </span>
              </p>
              <button type="button" className="lb-close combos__scanned-x" onClick={() => setSamples([])} aria-label="ניקוי הדגימות"><X size={14} /></button>
            </div>
            {samples.some((sample) => !sample.exact) && (
              <p className="combos__similar" role="status">
                {samples.length === 1
                  ? "אין שילובים לצבע הזה. מוצגים שילובים לצבעים דומים לו."
                  : "לחלק מהצבעים (מסומנים ב-≈) אין שילובים. מוצגים שילובים לצבעים דומים להם."}
              </p>
            )}
            <div className="combos__samples">
              {samples.map((sample) => (
                <button key={sample.id} type="button" className={`combos__sample${sample.exact ? "" : " is-similar"}`} style={{ background: sample.hex }} onClick={() => removeSample(sample.id)} aria-label={sample.exact ? "הסרת הצבע" : "הסרת הצבע (אין לו שילובים, מוצגים צבעים דומים)"}><X size={11} weight="bold" />{!sample.exact && <span className="combos__sample-similar" aria-hidden="true">≈</span>}</button>
              ))}
              {lastPhotoRef.current && (
                <button type="button" className="filter-chip" onClick={() => { canvasRef.current = lastPhotoRef.current.canvas; setScan(lastPhotoRef.current); }}><Plus size={13} aria-hidden="true" /> מאותה תמונה</button>
              )}
              <button type="button" className="filter-chip" onClick={() => fileRef.current?.click()}><Camera size={13} aria-hidden="true" /> צילום</button>
              <button type="button" className="filter-chip" onClick={() => galleryRef.current?.click()}><ImageSquare size={13} aria-hidden="true" /> גלריה</button>
            </div>
          </div>
        )}
        {(() => {
          const count = (source !== "all" ? 1 : 0) + (onlyFavorites ? 1 : 0) + (size ? 1 : 0) + familyIds.length;
          const inThis = PALETTES.filter(inSource(source));
          const families = COLOR_FAMILIES.map((entry) => ({ ...entry, count: inThis.filter((palette) => palette.colors.some((c) => c.family === entry.id)).length })).filter((entry) => entry.count);
          const shadesOf = (id) => (SHADE_ROWS.find((row) => row.id === id)?.shades || []).filter((entry) => SHADE_COUNTS[source].get(entry.id));
          const chip = (label, onRemove, extra = null) => (
            <button key={label} type="button" className="filter-chip is-on" onClick={onRemove}>{extra}{label}<X size={11} aria-label="הסרה" /></button>
          );
          return (
            <section className="wardrobe-filters combos__filter-box" aria-label="סינון השילובים">
              <div className="wardrobe-filters__bar">
                <button type="button" className={`wardrobe-filters__toggle${count ? " is-active" : ""}`} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}>
                  <Funnel size={15} aria-hidden="true" />
                  <span>{count ? `סינון (${count})` : "סינון"}</span>
                </button>
                {active && (
                  <button type="button" className="wardrobe-filters__clear" onClick={() => { setShadeIds([]); setFamilyIds([]); setPieceId(null); setSamples([]); setSize(0); setOnlyFavorites(false); setSource("all"); }}>
                    <X size={13} aria-hidden="true" /> ניקוי
                  </button>
                )}
                {!filtersOpen && count > 0 && (
                  <div className="wardrobe-filters__summary">
                    {source !== "all" && chip(SOURCES.find((entry) => entry.id === source).label, () => setSource("all"))}
                    {onlyFavorites && chip("מועדפים", () => setOnlyFavorites(false), <Heart size={11} weight="fill" aria-hidden="true" />)}
                    {size > 0 && chip(`${size} צבעים`, () => setSize(0))}
                    {familyIds.map((id) => {
                      const entry = COLOR_FAMILIES.find((f) => f.id === id);
                      const picked = shadeIds.filter((sid) => SHADES[sid].family === id);
                      return chip(picked.length ? `${entry.label} (${picked.length} גוונים)` : entry.label, () => toggleFamily(id), <span className="filter-chip__dot" style={{ background: picked.length === 1 ? SHADES[picked[0]].hex : entry.swatch }} />);
                    })}
                  </div>
                )}
              </div>
              {filtersOpen && (
                <div className="wardrobe-filters__panel">
                  <fieldset className="wardrobe-filters__group">
                    <legend>מאגר</legend>
                    <div className="wardrobe-filters__chips">
                      {SOURCES.map((entry) => (
                        <button key={entry.id} type="button" className={`filter-chip${source === entry.id ? " is-on" : ""}`} aria-pressed={source === entry.id} onClick={() => setSource(entry.id)}>
                          {entry.label}<small>{PALETTES.filter(inSource(entry.id)).length}</small>
                        </button>
                      ))}
                      <button type="button" className={`filter-chip combos__fav-chip${onlyFavorites ? " is-on" : ""}`} aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites((value) => !value)}>
                        <Heart size={13} weight={onlyFavorites ? "fill" : "regular"} aria-hidden="true" /> מועדפים<small>{favorites.length}</small>
                      </button>
                    </div>
                  </fieldset>
                  <fieldset className="wardrobe-filters__group">
                    <legend>מספר צבעים</legend>
                    <div className="wardrobe-filters__chips">
                      {[[0, "הכל"], [2, "2 צבעים"], [3, "3 צבעים"], [4, "4 צבעים"]].map(([value, label]) => (
                        <button key={value} type="button" className={`filter-chip${size === value ? " is-on" : ""}`} aria-pressed={size === value} onClick={() => setSize(value)}>{label}</button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="wardrobe-filters__group">
                    <legend>צבע</legend>
                    <div className="wardrobe-filters__chips">
                      {families.map((entry) => (
                        <button key={entry.id} type="button" className={`filter-chip${familyIds.includes(entry.id) ? " is-on" : ""}`} aria-pressed={familyIds.includes(entry.id)} onClick={() => toggleFamily(entry.id)}>
                          <span className="filter-chip__dot" style={{ background: entry.swatch }} />{entry.label}<small>{entry.count}</small>
                        </button>
                      ))}
                    </div>
                    {familyIds.length > 1 && <p className="combos__multi-note">מוצגים שילובים שיש בהם את כל הצבעים שבחרת</p>}
                    {familyIds.filter((id) => shadesOf(id).length > 1).map((id) => {
                      const entry = COLOR_FAMILIES.find((f) => f.id === id);
                      return (
                        <div key={id} className="combos__family-shades" role="group" aria-label={`גוונים של ${entry.label}`}>
                          <span>{entry.label}:</span>
                          {shadesOf(id).map((shadeEntry) => (
                            <button key={shadeEntry.id} type="button" className={`filter-chip combos__shade-chip${shadeIds.includes(shadeEntry.id) ? " is-on" : ""}`} aria-pressed={shadeIds.includes(shadeEntry.id)} title={shadeEntry.names} aria-label={`${shadeEntry.names}, ב-${SHADE_COUNTS[source].get(shadeEntry.id)} שילובים`} onClick={() => toggleShade(shadeEntry.id)}>
                              <span className="filter-chip__dot" style={{ background: shadeEntry.hex }} /><small>{SHADE_COUNTS[source].get(shadeEntry.id)}</small>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </fieldset>
                  <button type="button" className="secondary-button wardrobe-filters__done" onClick={() => setFiltersOpen(false)}>סיום</button>
                </div>
              )}
            </section>
          );
        })()}
        <p className="combos__count">{shown.length} שילובים</p>
      </div>

      <div className="combos__grid">
        {shown.map((palette) => {
          const owned = palette.matches.filter((list) => list.length).length;
          const sampledColors = new Set(palette.sampledAt.filter((index) => index >= 0));
          return (
            <article key={palette.key} className="combo">
              <HeartButton on={favorites.includes(palette.key)} onClick={() => toggleFavorite(palette.key)} className="is-over" />
              <button type="button" className="combo__swatches" onClick={() => setOpenKey(palette.key)} aria-label={`פתיחת שילוב ${palette.label}`}>
                {palette.colors.map((color, index) => (
                  <span key={index} className={`combo__swatch${shadeIds.includes(SHADE_OF.get(color)) || familyIds.includes(color.family) || sampledColors.has(index) ? " is-picked" : ""}`} style={{ background: color.hex }} title={color.name} />
                ))}
              </button>
              <div className="combo__foot">
                <span className="combo__number">{palette.source === "mytheresa" ? "Mytheresa" : palette.label}</span>
                {owned > 0 && (
                  <button type="button" className="combo__look" onClick={() => onCreateLook(forLook(palette))}>
                    <MagicWand size={13} aria-hidden="true" /> לוק מהשילוב
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!shown.length && <p className="look-filters__empty combos__none">{onlyFavorites && !favorites.length ? "עוד אין שילובים מועדפים. אפשר לסמן שילוב בלב." : "אין שילובים שמתאימים לסינון."}</p>}
      {(dailyOpen || openKey !== null) && (
        <ComboWindow
          fixed={openKey !== null ? PALETTES.find((palette) => palette.key === openKey) : null}
          nav={openKey !== null ? stepsIn(shown, openKey, setOpenKey, (palette) => palette.key) : {}}
          source={source}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          wishColors={wishColors}
          onAddColor={addWishColor}
          canLook={(palette) => palette.colors.some((entry) => matchesFor(entry).length > 0)}
          onClose={() => { setDailyOpen(false); setOpenKey(null); }}
          onCreateLook={(palette) => { setDailyOpen(false); setOpenKey(null); onCreateLook(forLook(palette)); }}
        />
      )}
    </section>
  );
}

const SIZE_KEY = "daily-combo-size";
const readSize = () => { try { return Number(localStorage.getItem(SIZE_KEY)) || 3; } catch { return 3; } };
// The same combination all day, a different one each day (per number of colours)
const dayIndex = (count) => {
  const day = new Date().toLocaleDateString("en-CA");
  let hash = 0;
  for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % count;
};

// One combination large, with each colour's name and a way to add it to the
// Wishlist: the combination of the day (2, 3 or 4 colours, "ערבוב" for another),
// or a combination opened from its card (`fixed`)
function ComboWindow({ fixed, nav = {}, source, favorites, onToggleFavorite, wishColors, onAddColor, canLook, onClose, onCreateLook }) {
  const [size, setSize] = useState(readSize);
  const pool = useMemo(() => PALETTES.filter(inSource(source)).filter((palette) => palette.colors.length === size), [size, source]);
  const [shuffled, setShuffled] = useState(null); // a palette key, after "ערבוב"
  const palette = fixed || (shuffled !== null && pool.find((entry) => entry.key === shuffled)) || pool[dayIndex(pool.length)];
  const chooseSize = (value) => {
    setSize(value);
    setShuffled(null);
    try { localStorage.setItem(SIZE_KEY, String(value)); } catch { /* not kept */ }
  };
  const shuffle = () => {
    const others = pool.filter((entry) => entry.key !== palette.key);
    setShuffled(others[Math.floor(Math.random() * others.length)].key);
  };
  const wished = (entry) => wishColors.some((wish) => wish.hex.toLowerCase() === entry.hex.toLowerCase());
  return (
    <div className="builder-modal-overlay look-builder-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <ModalArrows onPrev={nav.onPrev} onNext={nav.onNext} label="השילוב" />
      <div className="builder-modal look-builder daily-combo" role="dialog" aria-modal="true" aria-labelledby="daily-title">
        <header className="lb-header">
          <h2 id="daily-title">{fixed ? `שילוב ${palette.label}` : shuffled === null ? "השילוב היומי" : "שילוב אחר"}</h2>
          <button className="lb-close" type="button" onClick={onClose} aria-label="סגירה"><X size={18} /></button>
        </header>
        <div className="lb-body">
          {!fixed && (
            <div className="styling-choice__options daily-combo__sizes" role="radiogroup" aria-label="מספר הצבעים">
              {[2, 3, 4].map((value) => (
                <button key={value} type="button" role="radio" aria-checked={size === value} className={size === value ? "is-on" : ""} onClick={() => chooseSize(value)}>{value} צבעים</button>
              ))}
            </div>
          )}
          <div key={palette.key} className="daily-combo__colors">
            {palette.colors.map((entry, index) => (
              <div key={index} className="daily-combo__color" style={{ background: entry.hex }}>
                <span className={entry.lab[0] > 62 ? "is-dark" : ""}>{entry.name}<small dir="ltr">{entry.hex.toUpperCase()}</small></span>
              </div>
            ))}
          </div>
          <div className="daily-combo__wish" role="group" aria-label="הוספת צבע לווישליסט">
            {palette.colors.map((entry, index) => {
              const on = wished(entry);
              return (
                <button key={index} type="button" className={`daily-combo__wish-btn${on ? " is-on" : ""}`} disabled={on} onClick={() => onAddColor({ hex: entry.hex, name: entry.name, combo: palette.label })} aria-label={on ? `${entry.name} כבר בווישליסט` : `הוספת ${entry.name} לווישליסט`}>
                  {on ? <Check size={13} weight="bold" aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
                  <span>{on ? "בווישליסט" : "לווישליסט"}</span>
                </button>
              );
            })}
          </div>
          <a className="daily-combo__pinterest" href={pinterestUrl(palette)} target="_blank" rel="noopener noreferrer">
            <MagnifyingGlass size={15} aria-hidden="true" /> לוקים בצבעים האלה בפינטרסט
            <small dir="ltr">{[...new Set(palette.colors.map(searchWord))].join(" ")} outfit</small>
          </a>
          <div className="daily-combo__meta">
            <p className="daily-combo__number">{fixed ? (palette.source === "mytheresa" ? "מהלוקים של Mytheresa" : "מספר הצבעים היפני") : `שילוב ${palette.label} מתוך ${pool.length} שילובים של ${size} צבעים`}</p>
            <HeartButton on={favorites.includes(palette.key)} onClick={() => onToggleFavorite(palette.key)} className="is-big" />
          </div>
        </div>
        <footer className="lb-footer">
          <div className="lb-footer__actions">
            {!fixed && <button className="lb-button" type="button" onClick={shuffle}><ArrowsClockwise size={15} /> ערבוב</button>}
            {canLook(palette) && <button className="lb-button is-primary" type="button" onClick={() => onCreateLook(palette)}>
              <MagicWand size={15} /> לוק מהשילוב
            </button>}
          </div>
        </footer>
      </div>
    </div>
  );
}
