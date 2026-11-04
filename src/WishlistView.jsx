import { useState } from "react";
import { ArrowClockwise, Check, MagicWand, MagnifyingGlassPlus, Plus, Trash, X } from "@phosphor-icons/react";
import { ImageLightbox } from "./ImageLightbox.jsx";
import { WishlistAddModal } from "./WishlistAddModal.jsx";
import { PRICES } from "./prices.js";
import { useWishColors } from "./wish-colors.js";
import { hexToLab, deltaE2000 } from "./color-match.js";
import { fittedImage, imageFallback, thumbUrl } from "./image-files.js";

const PART_LABELS = {
  upperbody: "חולצה",
  wholebody_up: "עליונית",
  lowerbody: "מכנסיים / חצאית",
  dress: "שמלה",
  shoes: "נעליים",
  accessories_up: "אקססורי",
};

// The Wishlist in two parts: pieces she wants (from photos) and colours she wants
// (from colour combinations)
export function WishlistView({ wardrobe = [], ...props }) {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("wishlist-tab") === "colors" ? "colors" : "items"; } catch { return "items"; } });
  const [colors, , removeColor] = useWishColors(props.wardrobeId);
  const choose = (value) => { setTab(value); try { localStorage.setItem("wishlist-tab", value); } catch { /* not kept */ } };
  return (
    <>
      <div className="styling-choice__options wishlist-tabs" role="tablist" aria-label="חלקי ה-Wishlist">
        {[["items", "פריטים", props.items.length], ["colors", "צבעים", colors.length]].map(([id, label, count]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => choose(id)}>
            {label}{count > 0 && <small className="wishlist-tabs__count">{count}</small>}
          </button>
        ))}
      </div>
      {tab === "items" ? <WishlistItems {...props} /> : <WishlistColors colors={colors} wardrobe={wardrobe} onRemove={removeColor} />}
    </>
  );
}

const WISH_CLOSE = 9;
// Colours she wants, each with the pieces she already has in a close shade
function WishlistColors({ colors, wardrobe, onRemove }) {
  if (!colors.length) {
    return (
      <div className="empty-wardrobe-container">
        <div className="empty-wardrobe-card">
          <h2 className="empty-wardrobe-title">עוד אין צבעים ב-Wishlist</h2>
          <p className="empty-wardrobe-text">בעמוד שילובי הצבעים, פתחי שילוב (או את השילוב היומי) ולחצי "לווישליסט" מתחת לצבע שאת רוצה.</p>
        </div>
      </div>
    );
  }
  return (
    <section className="wishlist-view wish-colors" aria-label="צבעים שאני רוצה">
      <div className="wish-colors__grid">
        {colors.map((entry) => {
          const lab = hexToLab(entry.hex);
          // Pieces whose main colour looks the same (ΔE2000, as the eye sees it)
          const close = wardrobe.filter((item) => deltaE2000(hexToLab(item.color), lab) <= WISH_CLOSE);
          const light = lab && lab[0] > 62;
          return (
            <article key={entry.id} className="wish-color">
              <div className="wish-color__swatch" style={{ background: entry.hex }}>
                <button type="button" className={`wish-color__remove${light ? " is-dark" : ""}`} onClick={() => onRemove(entry.id)} aria-label={`הסרת ${entry.name || "הצבע"} מה-Wishlist`}><X size={14} /></button>
              </div>
              <div className="wish-color__body">
                <strong>{entry.name || entry.hex.toUpperCase()}</strong>
                <small><bdi dir="ltr">{entry.hex.toUpperCase()}</bdi>{entry.combo ? ` · משילוב ${entry.combo}` : ""}</small>
                {close.length > 0 ? (
                  <div className="wish-color__have" title="בגדים שיש לך בגוון קרוב">
                    {close.slice(0, 4).map((item) => <img key={item.id} src={thumbUrl(fittedImage(item.thumbnail || item.image), 120)} onError={imageFallback(item.thumbnail || item.image)} alt={item.name} title={item.name} loading="lazy" decoding="async" />)}
                    <span>יש לך {close.length === 1 ? "בגד אחד" : `${close.length} בגדים`} בגוון קרוב</span>
                  </div>
                ) : <span className="wish-color__none">אין לך עדיין בגד בגוון הזה</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// The pieces part: one card per saved photo, with the pieces she wants from it
function WishlistItems({ items, wardrobeId, onChange, onRemoved, selecting = false, checkedIds = [], onToggleCheck }) {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const open = items.find((entry) => entry.id === openId) || null;
  const addModal = adding && <WishlistAddModal wardrobeId={wardrobeId} onAdded={onChange} onClose={() => setAdding(false)} />;
  const addButton = (
    <button type="button" className="create-look-btn wishlist-add-btn" onClick={() => setAdding(true)}>
      <Plus size={15} aria-hidden="true" /> הוספת פריטים
    </button>
  );

  if (!items.length) {
    return (
      <div className="empty-wardrobe-container">
        <div className="empty-wardrobe-card">
          <h2 className="empty-wardrobe-title">ה-Wishlist ריק</h2>
          <p className="empty-wardrobe-text">אפשר להוסיף כאן צילומי מסך ותמונות של פריטים שאת רוצה, או לשמור פריטים מתמונת השראה בעמוד הלוקים.</p>
          {addButton}
        </div>
        {addModal}
      </div>
    );
  }

  return (
    <section className="wishlist-view" aria-label="Wishlist">
      {!selecting && <div className="wishlist-bar">{addButton}</div>}
      <div className="gallery-grid wishlist-grid">
        {items.map((entry) => (
          <article key={entry.id} className={`gallery-item wishlist-item${selecting && checkedIds.includes(entry.id) ? " is-checked" : ""}`}>
            <button type="button" className="wishlist-item__img" onClick={() => (selecting ? onToggleCheck?.(entry.id) : setOpenId(entry.id))} aria-label={selecting ? "בחירת התמונה" : "פתיחת התמונה"} aria-pressed={selecting ? checkedIds.includes(entry.id) : undefined}>
              {selecting && <span className="gallery-item__check" aria-hidden="true">{checkedIds.includes(entry.id) && <Check size={16} weight="bold" />}</span>}
              {entry.photo ? <img src={entry.photo} alt="" loading="lazy" decoding="async" /> : <span className="wishlist-item__swatch" aria-hidden="true" />}
              {entry.pieces.length > 1 && <span className="wishlist-item__count">{entry.pieces.length} פריטים</span>}
            </button>
            <ul className="wishlist-item__pieces">
              {entry.pieces.map((piece) => (
                <li key={piece.pid}>
                  {piece.color && <span className="inspo-dot" style={{ background: piece.color }} aria-hidden="true" />}
                  <span>
                    <strong className="wishlist-item__piece-name">{piece.name}</strong>
                    {piece.colorName && <small>{piece.colorName}</small>}
                    {piece.description && <em className="wishlist-item__piece-desc">{piece.description}</em>}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {addModal}
      {open && <WishlistEntryModal entry={open} wardrobeId={wardrobeId} onChange={onChange} onRemoved={onRemoved} onClose={() => setOpenId(null)} />}
    </section>
  );
}

// One saved photo: zoom in and out, the pieces with their details, an AI catalog
// photo of a chosen piece at low or medium quality, and "bought" / remove per piece
function WishlistEntryModal({ entry, wardrobeId, onChange, onRemoved, onClose }) {
  const [zoomAt, setZoomAt] = useState(-1);
  const [making, setMaking] = useState(null); // `${pid}:${quality}`
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  // Notes for the AI, per piece
  const [notes, setNotes] = useState({});
  const gallery = [
    ...(entry.photo ? [{ src: entry.photo, alt: "תמונת ההשראה" }] : []),
    ...entry.pieces.filter((piece) => piece.aiImage).map((piece) => ({ src: piece.aiImage, alt: piece.name })),
  ];

  const make = async (piece, quality) => {
    setMaking(`${piece.pid}:${quality}`);
    setError("");
    try {
      const res = await fetch(`/api/import/wishlist/${entry.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wardrobe-id": wardrobeId },
        body: JSON.stringify({ pieceId: piece.pid, quality, note: notes[piece.pid] || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "לא ניתן להכין תמונה כרגע");
      onChange?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setMaking(null);
    }
  };

  const removePiece = async (piece, bought) => {
    if (!bought && !window.confirm(`להסיר את "${piece.name}" מה-Wishlist?`)) return;
    setBusy(piece.pid);
    setError("");
    try {
      const res = await fetch(`/api/import/wishlist/${entry.id}/pieces/${piece.pid}`, { method: "DELETE", headers: { "x-wardrobe-id": wardrobeId } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "לא ניתן להסיר כרגע");
      if (data.deleted) { onRemoved?.(entry.id); onClose(); } else onChange?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="builder-modal-overlay look-builder-overlay" onMouseDown={(event) => event.target === event.currentTarget && !making && onClose()}>
      <div className="builder-modal look-builder wish-modal" role="dialog" aria-modal="true" aria-labelledby="wish-title">
        <header className="lb-header">
          <h2 id="wish-title">Wishlist</h2>
          <button className="lb-close" type="button" onClick={onClose} aria-label="סגירה"><X size={18} /></button>
        </header>
        <div className="lb-body">
          {entry.photo && (
            <button type="button" className="wish-view" onClick={() => setZoomAt(0)} aria-label="הגדלת התמונה">
              <img src={entry.photo} alt="תמונת ההשראה" />
              <span className="wish-view__zoom" aria-hidden="true"><MagnifyingGlassPlus size={16} /></span>
            </button>
          )}
          {entry.pieces.map((piece) => (
            <section key={piece.pid} className="lb-section wish-piece">
              <div className="wish-piece__head">
                <h3>
                  {piece.color && <span className="inspo-dot" style={{ background: piece.color }} aria-hidden="true" />}
                  {piece.name}
                </h3>
                <div className="wish-piece__actions">
                  <button type="button" className="wishlist-item__btn" disabled={busy === piece.pid} onClick={() => removePiece(piece, true)}>
                    <Check size={13} aria-hidden="true" /> קניתי
                  </button>
                  <button type="button" className="wishlist-item__btn is-icon" disabled={busy === piece.pid} onClick={() => removePiece(piece, false)} aria-label={`הסרת ${piece.name}`}>
                    <Trash size={13} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="wishlist-item__part">{[PART_LABELS[piece.part], piece.colorName].filter(Boolean).join(" · ")}</p>
              {piece.description && <p className="wish-desc">{piece.description}</p>}
              {piece.aiImage && (
                <button type="button" className="wish-ai" onClick={() => setZoomAt(gallery.findIndex((entryImage) => entryImage.src === piece.aiImage))} aria-label={`הגדלת תמונת ה-AI של ${piece.name}`}>
                  <img src={piece.aiImage} alt={piece.name} />
                </button>
              )}
              <label className="wish-note">
                <span>הערות ל-AI לתמונה <small>אופציונלי</small></span>
                <textarea className="lb-input" rows={2} value={notes[piece.pid] || ""} disabled={Boolean(making)} onChange={(event) => setNotes((current) => ({ ...current, [piece.pid]: event.target.value }))} placeholder="למשל: שרוולים ארוכים, בלי החגורה, לשמור על הכפתורים הזהובים" />
              </label>
              <div className="wish-make">
                {["low", "medium"].map((quality) => {
                  const on = making === `${piece.pid}:${quality}`;
                  return (
                    <button key={quality} type="button" className="lb-button" disabled={Boolean(making)} onClick={() => make(piece, quality)}>
                      {on ? <ArrowClockwise size={15} className="spin" /> : <MagicWand size={15} />}
                      <span>{on ? "מכין..." : `${piece.aiImage ? "שוב" : "תמונת AI"} · ${quality === "low" ? "נמוכה" : "בינונית"}`}</span>
                      {!on && <small>{quality === "low" ? PRICES.catalogLow : PRICES.catalogMedium}</small>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {error && <p className="lb-error" role="alert">{error}</p>}
        </div>
      </div>
      {zoomAt >= 0 && gallery.length > 0 && <ImageLightbox images={gallery} startIndex={Math.max(0, zoomAt)} onClose={() => setZoomAt(-1)} />}
    </div>
  );
}
