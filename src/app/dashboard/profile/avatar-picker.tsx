"use client";

import { useEffect, useRef, useState } from "react";

// A calmer photo chooser than the native file input: one button to pick,
// an instant preview, the file's name and size, and Upload only once
// something acceptable is chosen.
const MAX = 5 * 1024 * 1024;

export function AvatarPicker({ action, hasPhoto }: { action: (fd: FormData) => void | Promise<void>; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const tooBig = !!file && file.size > MAX;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <form action={action} encType="multipart/form-data" className="avatar-picker">
      <input
        ref={input}
        id="avatar-file"
        name="avatar"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          setFile(f);
          setPreview(f ? URL.createObjectURL(f) : null);
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview && <img src={preview} alt="Preview of your new photo" className="avatar-preview" />}
      <div className="stack" style={{ gap: 6 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <label htmlFor="avatar-file" className="btn secondary small-btn" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}>
            {file ? "Choose another" : hasPhoto ? "Choose a new photo" : "Choose a photo"}
          </label>
          {file && !tooBig && <button type="submit" className="btn small-btn">Upload</button>}
        </div>
        <span className="micro-note" role={tooBig ? "alert" : undefined} style={tooBig ? { color: "var(--danger)" } : undefined}>
          {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB${tooBig ? ". Too large: keep it under 5 MB." : ""}` : "JPG, PNG or WebP, up to 5 MB. A square headshot works best."}
        </span>
      </div>
    </form>
  );
}
