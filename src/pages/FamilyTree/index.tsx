import React from 'react';
import { ExternalLink } from 'lucide-react';

export function FamilyTree() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Thin banner */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-border text-sm">
        <span className="text-lg">🌳</span>
        <span className="font-medium text-primary">עץ המשפחה</span>
        <a
          href="/family-tree.html"
          target="_blank"
          rel="noopener noreferrer"
          className="mr-auto flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
          aria-label="פתח בחלון חדש"
        >
          <ExternalLink size={13} />
          פתח בחלון חדש
        </a>
      </div>
      <iframe
        src="/family-tree.html?v=2"
        title="עץ המשפחה"
        className="flex-1 w-full border-0"
      />
    </div>
  );
}
