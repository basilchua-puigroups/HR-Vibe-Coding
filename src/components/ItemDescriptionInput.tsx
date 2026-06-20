import { useEffect, useRef, useState } from 'react';
import type { InventoryItem } from '../types';

export function ItemDescriptionInput({
  value,
  inventory,
  onChange,
}: {
  value: string;
  inventory: InventoryItem[];
  onChange: (description: string, selected?: InventoryItem) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const matches = query.trim().length > 0
    ? inventory.filter((it) => it.item.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  function updateRect() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    updateRect();
    setOpen(true);
    onChange(e.target.value);
  }

  function handleSelect(item: InventoryItem) {
    setQuery(item.item);
    setOpen(false);
    onChange(item.item, item);
  }

  function handleBlur(e: React.FocusEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setTimeout(() => setOpen(false), 150);
    }
  }

  // Use position:fixed so the dropdown escapes any parent overflow:hidden / overflow:auto
  // (e.g. .table-wrap). Falls back to absolute if rect hasn't been measured yet.
  const dropStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 240),
        zIndex: 9999,
        background: 'var(--panel-bg, #fff)',
        border: '1px solid var(--border, #ccc)',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        maxHeight: 220,
        overflowY: 'auto',
      }
    : {
        position: 'absolute', top: '100%', left: 0, zIndex: 9999,
        background: 'var(--panel-bg, #fff)', border: '1px solid var(--border, #ccc)',
        borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        minWidth: 240, maxHeight: 220, overflowY: 'auto',
      };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        style={{ width: '100%', boxSizing: 'border-box' }}
        value={query}
        onChange={handleInput}
        onFocus={() => { if (query.trim()) { updateRect(); setOpen(true); } }}
        onBlur={handleBlur}
        placeholder="Type item name..."
      />
      {open && matches.length > 0 && (
        <div style={dropStyle}>
          {matches.map((item) => (
            <div
              key={item.id}
              onMouseDown={() => handleSelect(item)}
              style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border, #f0f0f0)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg, #f5f5f5)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              <div style={{ fontWeight: 600 }}>{item.item}</div>
              {(item.partNo || item.stockId || item.category) && (
                <div style={{ fontSize: 11, color: '#888' }}>
                  {[item.partNo, item.stockId, item.category].filter(Boolean).join(' | ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
