"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/rsvp";
import { countWords, deleteDoc, listDocs, renameDoc, type DocMeta } from "@/lib/library";
import { importFile } from "@/lib/import-file";
import { cleanGutenberg } from "@/lib/gutenberg";

type Tab = "library" | "add";

type Props = {
  open: boolean;
  currentId: string | null;
  wpm: number;
  onOpenDoc: (id: string) => void;
  onAdd: (title: string, text: string, source?: string) => Promise<void>;
  onDeleted: (id: string) => void;
  onClose: () => void;
};

export function LibraryPanel({ open, currentId, wpm, onOpenDoc, onAdd, onDeleted, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("library");
  const [docs, setDocs] = useState<DocMeta[]>([]);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<string | undefined>();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listDocs();
    setDocs(list);
    return list;
  }, []);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      refresh().then((list) => setTab(list.length ? "library" : "add"));
      setError(null);
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, refresh]);

  const resetForm = () => {
    setTitle("");
    setText("");
    setSource(undefined);
    setLink("");
    setError(null);
  };

  const fromFile = async (file: File) => {
    setBusy(`Reading ${file.name}…`);
    setError(null);
    try {
      const got = await importFile(file);
      setTitle(got.title);
      setText(got.text);
      setSource(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(null);
    }
  };

  const fromLink = async () => {
    if (!link.trim()) return;
    setBusy("Fetching the article…");
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't import that link.");
      setTitle(data.title);
      setText(data.text);
      setSource(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import that link.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("Saving…");
    try {
      const book = cleanGutenberg(text);
      await onAdd(title || book.title || "", book.text, source);
      resetForm();
      onClose();
    } catch {
      setError("Couldn't save that. Your browser storage may be full.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (doc: DocMeta) => {
    if (!window.confirm(`Delete “${doc.title}” from your library?`)) return;
    await deleteDoc(doc.id);
    onDeleted(doc.id);
    refresh();
  };

  const rename = async (doc: DocMeta) => {
    const next = window.prompt("Rename", doc.title);
    if (next && next.trim()) {
      await renameDoc(doc.id, next);
      refresh();
    }
  };

  const words = countWords(text);

  return (
    <dialog
      ref={ref}
      className="paste"
      onClose={onClose}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          setTab("add");
          fromFile(file);
        }
      }}
    >
      <header className="paste__head">
        <div className="segmented segmented--tabs" role="tablist">
          <button role="tab" aria-selected={tab === "library"} className={tab === "library" ? "on" : ""}
            onClick={() => setTab("library")}>
            Library{docs.length ? ` (${docs.length})` : ""}
          </button>
          <button role="tab" aria-selected={tab === "add"} className={tab === "add" ? "on" : ""}
            onClick={() => setTab("add")}>
            Add text
          </button>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>

      {tab === "library" ? (
        <div className="library">
          {docs.length === 0 && <p className="library__empty">Nothing saved yet. Add something to read.</p>}
          {docs.map((doc) => {
            const pct = doc.wordCount ? Math.min(100, Math.round(((doc.pos + 1) / doc.wordCount) * 100)) : 0;
            const left = ((doc.wordCount - doc.pos) / wpm) * 60000;
            return (
              <div key={doc.id} className={`library__row${doc.id === currentId ? " library__row--current" : ""}`}>
                <button className="library__open" onClick={() => { onOpenDoc(doc.id); onClose(); }}>
                  <span className="library__title">{doc.title}</span>
                  <span className="library__meta">
                    {doc.wordCount.toLocaleString()} words · {pct}% read · {formatDuration(left)} left
                    {doc.id === currentId ? " · reading now" : ""}
                  </span>
                  <span className="library__bar"><span style={{ width: `${pct}%` }} /></span>
                </button>
                <button className="text-btn library__action" onClick={() => rename(doc)}>Rename</button>
                <button className="text-btn library__action" onClick={() => remove(doc)}>Delete</button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="add">
          <div className="add__link">
            <input
              type="url"
              placeholder="Paste a link to an article…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fromLink()}
            />
            <button className="btn" onClick={fromLink} disabled={!link.trim() || !!busy}>Import</button>
            <label className="btn">
              Open file
              <input type="file" accept=".txt,.md,.pdf,.epub,text/plain,application/pdf,application/epub+zip"
                className="visually-hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) fromFile(f);
                  e.target.value = "";
                }} />
            </label>
          </div>
          <input className="add__title" placeholder="Title (optional)" value={title}
            onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className={dragging ? "dragging" : ""}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSource(undefined);
            }}
            placeholder="Paste an article, a chapter, an essay… or drop a .txt, .pdf or .epub file anywhere here."
          />
          {(busy || error) && <p className={`add__status${error ? " add__status--error" : ""}`}>{error ?? busy}</p>}
          <footer className="paste__foot">
            <span className="paste__stats">
              {words.toLocaleString()} words · about {formatDuration((words / wpm) * 60000)} at {wpm} wpm
            </span>
            <button className="btn btn--ghost" onClick={resetForm}>Clear</button>
            <button className="btn btn--primary" disabled={!words || !!busy} onClick={save}>
              Save &amp; read
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
