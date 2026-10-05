"use client";

import { useEffect, useRef, useState } from "react";
import type { BookResult } from "@/app/api/books/route";

type Props = {
  /** Imports the book and starts reading it. Rejects with a readable message. */
  onPick: (book: BookResult) => Promise<void>;
};

/** "Find a book": searches Project Gutenberg as you type. */
export function BookSearch({ onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const latest = useRef(0);

  const search = async (q: string, p: number) => {
    const ticket = ++latest.current;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/books?q=${encodeURIComponent(q)}&page=${p}`);
      const data = await res.json();
      if (ticket !== latest.current) return; // a newer search already started
      if (!res.ok) throw new Error(data.error ?? "Search failed.");
      setResults((prev) => (p === 1 ? data.results : [...prev, ...data.results]));
      setHasMore(data.hasMore);
      setPage(p);
    } catch (e) {
      if (ticket === latest.current) setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      if (ticket === latest.current) setSearching(false);
    }
  };

  // Search as you type, once typing pauses.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => search(q, 1), 450);
    return () => clearTimeout(t);
  }, [query]);

  const onType = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      latest.current++; // drop any search still in flight
      setResults([]);
      setHasMore(false);
      setSearching(false);
    }
  };

  const pick = async (book: BookResult) => {
    setLoadingId(book.id);
    setError(null);
    try {
      await onPick(book);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that book.");
    } finally {
      setLoadingId(null);
    }
  };

  const q = query.trim();

  return (
    <div className="finder">
      <div className="finder__bar">
        <SearchIcon />
        <input
          type="search"
          placeholder="Find a book: title or author (Project Gutenberg)"
          value={query}
          onChange={(e) => onType(e.target.value)}
          aria-label="Find a book"
          // The native attribute (not React's autoFocus): <dialog>.showModal()
          // focuses it, so opening the library lands you in the search box.
          ref={(el) => el?.setAttribute("autofocus", "")}
        />
        {searching && <span className="finder__spinner" aria-label="Searching" />}
      </div>

      {error && <p className="add__status add__status--error">{error}</p>}

      {q.length >= 2 && (
        <div className="finder__results">
          {!searching && results.length === 0 && !error && (
            <p className="library__empty">No books found for “{q}”.</p>
          )}
          {results.map((book) => (
            <button
              key={book.id}
              className="finder__book"
              onClick={() => pick(book)}
              disabled={loadingId !== null}
            >
              {/* Small remote thumbnails straight from Gutenberg; no need to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={book.cover} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              <span className="finder__text">
                <span className="library__title">{book.title}</span>
                <span className="library__meta">{book.author || "Unknown author"}</span>
              </span>
              <span className="finder__go">{loadingId === book.id ? "Loading…" : "Read"}</span>
            </button>
          ))}
          {hasMore && (
            <button className="btn btn--ghost finder__more" disabled={searching} onClick={() => search(q, page + 1)}>
              {searching ? "Loading…" : "More results"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
