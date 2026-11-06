"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { parseProfileBio } from "./actions";
import { refreshPreviews } from "./sections";

// Quick start: paste or drop an existing profile (Psychology Today, a
// practice website, LinkedIn, a CV) and the form below fills itself in.
// Everything that changed is highlighted, the photo and initials update at
// once, and nothing is kept until Save profile. Reads nothing from and
// writes nothing to the database itself.

type Fields = NonNullable<Awaited<ReturnType<typeof parseProfileBio>>["fields"]>;

const initialsOf = (name: string) =>
  name
    .replace(/^(dr\.?)\s+/i, "")
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

function mark(el: Element | null) {
  if (!el) return;
  el.classList.add("autofilled");
  const label = el.closest("label");
  if (label) label.classList.add("autofilled");
  const section = el.closest("details");
  if (section instanceof HTMLDetailsElement) {
    section.open = true;
    section.classList.add("has-autofill");
  }
}

// The headshot in pasted web content: a Psychology Today photo first, then
// any reasonably sized image.
function imageFromHtml(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = Array.from(doc.querySelectorAll("img"))
      .map((i) => ({ src: i.getAttribute("src") || "", w: Number(i.getAttribute("width") || 0) }))
      .filter((i) => /^https:\/\//i.test(i.src));
    const pt = imgs.find((i) => /psychologytoday\.com/i.test(i.src) && !/logo|icon|badge|sprite/i.test(i.src));
    if (pt) return pt.src;
    const big = imgs.find((i) => (i.w === 0 || i.w >= 80) && !/logo|icon|badge|sprite|\.svg/i.test(i.src));
    return big?.src || null;
  } catch {
    return null;
  }
}

// For the demos: the same screen part-way through (text pasted, or filled
// in and highlighted). Real pages never pass it.
export type ImportDemo = { text: string; applied?: string[]; marks?: string[]; ranks?: number };

// Highlights fields as "Fill in from this text" does, on a demo screen.
export function AutofillMarks({ ids, ranks = 0 }: { ids: string[]; ranks?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    ids.forEach((id) => mark(form.querySelector(`#${CSS.escape(id)}`)));
    for (let n = 1; n <= ranks; n += 1) mark(form.querySelector(`select[name="spec_rank_${n}"]`));
    const ask = form.querySelector<HTMLElement>("#rank-confirm");
    if (ask && ranks) ask.hidden = false;
  }, [ids, ranks]);
  return <span ref={ref} hidden />;
}

// A value the new text would change (Nick, 4 Nov): the member keeps what they saved or takes the new one.
type Conflict = { key: string; label: string; current: string; proposed: string; apply: () => void; done?: "kept" | "used" };

export default function BioImportBox({ prominent = true, demo, mode = "setup" }: { prominent?: boolean; demo?: ImportDemo; mode?: "setup" | "update" }) {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [bioText, setBioText] = useState(demo?.text || "");
  const [isPending, startTransition] = useTransition();
  const [applied, setApplied] = useState<string[] | null>(demo?.applied || null);
  const [message, setMessage] = useState<string | null>(demo?.applied ? "Filled in and highlighted below. Check each part, then press Save profile." : null);
  const [isError, setIsError] = useState(false);
  const [photo, setPhoto] = useState<{ src: string; file?: File; url?: string } | null>(null);
  const [lowRes, setLowRes] = useState(false);
  const open = true;
  void prominent;
  const fileField = useRef<HTMLInputElement>(null);
  const urlField = useRef<HTMLInputElement>(null);

  const takeImageFile = (f: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024) return;
    setPhoto({ src: URL.createObjectURL(f), file: f });
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files || []);
    const img = files.find((f) => f.type.startsWith("image/"));
    if (img) takeImageFile(img);
    const html = e.clipboardData.getData("text/html");
    if (html && !img) {
      const src = imageFromHtml(html);
      if (src) setPhoto({ src, url: src });
    }
  };

  const onDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer.files || []);
    const img = files.find((f) => f.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      takeImageFile(img);
      return;
    }
    const html = e.dataTransfer.getData("text/html");
    if (html) {
      const src = imageFromHtml(html);
      if (src) setPhoto({ src, url: src });
    }
    const text = e.dataTransfer.getData("text/plain");
    if (text) {
      e.preventDefault();
      setBioText((t) => (t ? `${t}\n${text}` : text));
    }
  };

  function applyPhoto(p: { src: string; file?: File; url?: string }) {
    // Carried with the profile form, saved with Save profile.
    if (p.file && fileField.current) {
      const dt = new DataTransfer();
      dt.items.add(p.file);
      fileField.current.files = dt.files;
    }
    if (urlField.current) urlField.current.value = p.url || "";
    document.querySelectorAll<HTMLElement>("[data-self-avatar]").forEach((slot) => {
      const size = Number(slot.dataset.size || 48);
      slot.innerHTML = "";
      const img = document.createElement("img");
      img.src = p.src;
      img.alt = "";
      img.className = "avatar autofilled";
      img.style.cssText = `width:${size}px;height:${size}px;flex-basis:${size}px;object-fit:cover`;
      slot.appendChild(img);
    });
    const probe = new Image();
    probe.onload = () => setLowRes(Math.min(probe.naturalWidth, probe.naturalHeight) < 400);
    probe.src = p.src;
  }

  function applyFields(fields: Fields, list: string[], found: Conflict[]) {
    // New information is filled in; a value already saved that the text would change becomes a choice, never a
    // silent overwrite. Anything saved that the new text doesn't mention is left as it is.
    const setValue = (id: string, value: string | null | undefined, label: string) => {
      if (!value) return;
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (!el || el.value === value) return;
      const put = () => {
        el.value = value;
        mark(el);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      if (mode === "update" && el.value.trim() && el.value.trim().toLowerCase() !== value.trim().toLowerCase()) {
        const shown = (v: string) => (el instanceof HTMLSelectElement ? Array.from(el.options).find((o) => o.value === v)?.textContent || v : v);
        found.push({ key: id, label, current: shown(el.value), proposed: shown(value), apply: put });
        return;
      }
      put();
      list.push(label);
    };
    setValue("full_name", fields.full_name, "Name");
    setValue("credential_prefix", fields.credential_prefix, "Title");
    setValue("qualification_level", fields.qualification_level, "Qualification");
    setValue("primary_practice_city", fields.primary_practice_city, "Practice city");
    if (fields.states_qualified.length > 0) setValue("primary_state", fields.states_qualified[0].toUpperCase(), "Practice state");
    setValue("practice_website", fields.practice_website, "Website");
    setValue("bio", fields.bio, "Short bio");
    setValue("pronoun", fields.pronoun, "Pronouns");
    setValue("contact_phone", fields.contact_phone, "Phone");
    setValue("contact_email", fields.contact_email, "Email");
    // Initials and name update straight away, before saving.
    const name = (document.getElementById("full_name") as HTMLInputElement | null)?.value || "";
    if (name) {
      document.querySelectorAll<HTMLElement>("[data-self-avatar] span.avatar").forEach((s) => (s.textContent = initialsOf(name)));
      document.querySelectorAll<HTMLElement>("[data-self-name]").forEach((s) => (s.textContent = name));
    }
  }

  function applyLookups(ids: number[], ranked: number[], list: string[], found: Conflict[]) {
    let ticked = 0;
    for (const id of ids) {
      const box = document.getElementById(`lv_${id}`) as HTMLInputElement | null;
      if (box && !box.checked) {
        box.checked = true;
        mark(box);
        ticked += 1;
      }
    }
    if (ticked) list.push(`${ticked} specialt${ticked === 1 ? "y" : "ies"}, approaches and other details ticked`);
    if (ranked.length) {
      const sels = [1, 2, 3, 4, 5].map((n) => document.querySelector<HTMLSelectElement>(`select[name="spec_rank_${n}"]`));
      const name = (s: HTMLSelectElement | null, v: string) => (s ? Array.from(s.options).find((o) => o.value === v)?.textContent || "" : "");
      const current = sels.map((s) => (s?.value ? name(s, s.value) : "")).filter(Boolean);
      const proposed = ranked.map((id, i) => name(sels[i], String(id))).filter(Boolean);
      const put = () => {
        ranked.forEach((id, i) => {
          const sel = sels[i];
          if (sel) {
            sel.value = String(id);
            mark(sel);
          }
        });
        const ask = document.getElementById("rank-confirm");
        if (ask) ask.hidden = false;
        sels[0]?.dispatchEvent(new Event("change", { bubbles: true }));
      };
      if (mode === "update" && current.length && current.join("|") !== proposed.join("|")) {
        found.push({ key: "ranks", label: "Top specialties", current: current.join(" · "), proposed: proposed.join(" · "), apply: put });
      } else if (!current.length || mode === "setup") {
        put();
        list.push(`Your top ${ranked.length} specialties ranked: check the order`);
      }
    }
  }

  function handleParse() {
    setMessage(null);
    setIsError(false);
    setApplied(null);
    startTransition(async () => {
      const result = await parseProfileBio(bioText);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      const list: string[] = [];
      const found: Conflict[] = [];
      document.querySelectorAll(".autofilled").forEach((el) => el.classList.remove("autofilled"));
      if (result.fields) {
        // A city that already carries the state ("Austin, TX") is stored as the city alone.
        if (result.fields.primary_practice_city) result.fields.primary_practice_city = result.fields.primary_practice_city.replace(/,\s*[A-Z]{2}$/, "").trim();
        applyFields(result.fields, list, found);
      }
      applyLookups(result.matchedLookupIds || [], result.rankedSpecialtyIds || [], list, found);
      setConflicts(found);
      setNotes(result.conflicts || []);
      refreshPreviews();
      if (photo) {
        applyPhoto(photo);
        list.push("Photo");
      }
      setApplied(list);
      setMessage(
        list.length > 0 || found.length > 0
          ? `${list.length ? "New details are filled in below and marked Not saved yet." : "Nothing new to add."}${found.length ? ` ${found.length} saved value${found.length === 1 ? "" : "s"} would change: choose below.` : ""} Check each part, then press Save profile.`
          : mode === "update"
            ? "Everything in that text is already on your profile. Nothing was changed."
            : "We couldn't find anything to fill in from that text. You can still complete the form below."
      );
    });
  }

  return (
    <section className={`card quick-start${open ? " open" : ""}`} id="quick-start">
      <div className="quick-start-head">
        <div>
          <div className="eyebrow">{mode === "update" ? "Update from your profile" : "Quick start"}</div>
          <h3>{mode === "update" ? "Paste an updated profile" : "Start from a profile you already have"}</h3>
          <p className="small" style={{ margin: 0 }}>
            {mode === "update"
              ? "Paste your updated Psychology Today link or text, your website or CV. We add anything new, show anything that has changed so you can choose, and keep everything you've saved that the new text doesn't mention. Nothing is saved until you press Save."
              : "Paste a link to your Psychology Today profile, or the text of your profile, practice website or CV. We fill in the fields, your photo and your top specialties for you to check. Nothing is saved until you press Save."}
          </p>
        </div>

      </div>
      {open && (
        <>
          <textarea
            className="quick-start-drop"
            value={bioText}
            onChange={(e) => setBioText(e.target.value)}
            onPaste={onPaste}
            onDrop={onDrop}
            rows={4}
            placeholder="https://www.psychologytoday.com/us/therapists/… or paste your profile text"
            aria-label="Your existing profile"
          />
          {photo && (
            <div className="quick-start-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.src} alt="Photo found in your profile" />
              <span className="small">Photo found. It becomes your profile photo when you save.</span>
            </div>
          )}
          <div className="row wrap" style={{ marginTop: 10, gap: 12 }}>
            <button type="button" className="btn" onClick={handleParse} disabled={isPending || !bioText.trim()}>
              {isPending ? "Reading..." : /^https?:\/\/\S+$/i.test(bioText.trim()) ? "Fill in from this link" : "Fill in from this text"}
            </button>
            {message && (
              <span className="small" role="status" style={{ color: isError ? "#9b2c22" : undefined }}>
                {message}
              </span>
            )}
          </div>
          {applied && applied.length > 0 && (
            <ul className="quick-start-applied" aria-label="What was filled in">
              {applied.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          {conflicts.length > 0 && (
            <div className="import-conflicts" role="group" aria-label="Changes to choose">
              <p className="label-line">These are already on your profile. Keep them, or use the new text:</p>
              {conflicts.map((c) => (
                <div key={c.key} className={`import-conflict${c.done ? " is-done" : ""}`}>
                  <b>{c.label}</b>
                  <span className="ic-now"><small>On your profile</small>{c.current}</span>
                  <span className="ic-new"><small>In the new text</small>{c.proposed}</span>
                  {c.done ? (
                    <span className="ic-choice">{c.done === "used" ? "Using the new text (not saved yet)" : "Keeping what you saved"}</span>
                  ) : (
                    <span className="ic-buttons">
                      <button type="button" className="btn secondary small-btn" onClick={() => setConflicts((xs) => xs.map((x) => (x.key === c.key ? { ...x, done: "kept" } : x)))}>Keep</button>
                      <button type="button" className="btn small-btn" onClick={() => { c.apply(); refreshPreviews(); setConflicts((xs) => xs.map((x) => (x.key === c.key ? { ...x, done: "used" } : x))); }}>Use new</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {notes.length > 0 && (
            <div className="notice-line warn" role="note">
              <b>Worth checking:</b> {notes.join(" ")} Nothing was decided for you; open the section to choose.
            </div>
          )}
          {lowRes && (
            <p className="notice-line warn">
              The photo from your profile is low resolution. It works for now; upload a photo directly in Photo below for a sharper picture.
            </p>
          )}
        </>
      )}
      <input ref={fileField} type="file" name="avatar_import_file" form="profile-form" accept="image/jpeg,image/png,image/webp" hidden />
      <input ref={urlField} type="hidden" name="avatar_import_url" form="profile-form" />
    </section>
  );
}
