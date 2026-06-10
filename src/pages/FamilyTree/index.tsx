import React from 'react';
import { ExternalLink } from 'lucide-react';

export function FamilyTree() {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Page header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface shrink-0"
        style={{ minHeight: 52 }}
      >
        {/* RTL: title on the right (inline-start) */}
        <h1 className="text-xl font-bold text-primary" style={{ fontFamily: 'Rubik, sans-serif' }}>
          עץ המשפחה
        </h1>

        {/* "Open in new window" button */}
        <a
          href="/tree-only.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-btn text-sm font-semibold transition-colors border"
          style={{
            color: '#0EA5A4',
            borderColor: '#0EA5A4',
            background: 'transparent',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = '#E6F7F7';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
          }}
          aria-label="פתח עץ המשפחה בחלון חדש"
        >
          <ExternalLink size={14} aria-hidden="true" />
          פתח בחלון חדש
        </a>
      </div>

      {/* Tree iframe — fills all remaining height */}
      <iframe
        src="/tree-only.html"
        title="עץ המשפחה"
        className="flex-1 w-full border-0"
        allow="fullscreen"
      />
    </div>
  );
}
