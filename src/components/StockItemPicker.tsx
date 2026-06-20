import { useEffect, useRef, useState } from 'react';
import type { InventoryItem } from '../types';

interface Props {
  itemId: number;
  inventory: InventoryItem[];
  onChange: (itemId: number, item?: InventoryItem) => void;
}

const absDropdownStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, zIndex: 1000,
  background: 'var(--panel-bg, #fff)', border: '1px solid var(--border, #ccc)',
  borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
  minWidth: 260, maxHeight: 220, overflowY: 'auto',
};

function fixedDropStyle(rect: DOMRect | null, minWidth = 220): React.CSSProperties {
  return {
    position: 'fixed',
    top: rect ? rect.bottom + 2 : 0,
    left: rect ? rect.left : 0,
    width: rect ? Math.max(rect.width, minWidth) : minWidth,
    zIndex: 9999,
    background: 'var(--panel-bg, #fff)',
    border: '1px solid var(--border, #ccc)',
    borderRadius: 4,
    boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
    maxHeight: 220,
    overflowY: 'auto',
  };
}

function DropItem({ inv, onSelect }: { inv: InventoryItem; onSelect: (inv: InventoryItem) => void }) {
  return (
    <div
      onMouseDown={() => onSelect(inv)}
      style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border, #f0f0f0)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg, #f5f5f5)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
    >
      <div style={{ fontWeight: 600 }}>{inv.item}</div>
      {(inv.stockId || inv.partNo || inv.category) && (
        <div style={{ fontSize: 11, color: '#888' }}>
          {[inv.stockId, inv.partNo, inv.category].filter(Boolean).join(' | ')}
        </div>
      )}
    </div>
  );
}

/**
 * Form-grid variant: renders two <label> elements (Stock ID + Part Name) with display:contents
 * so they participate directly as cells in the parent CSS grid.
 */
export function StockItemPicker({ itemId, inventory, onChange }: Props) {
  const inv = inventory.find((i) => i.id === itemId) ?? null;
  const [stockQuery, setStockQuery] = useState(inv?.stockId ?? '');
  const [nameQuery, setNameQuery] = useState(inv?.item ?? '');
  const [stockOpen, setStockOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [stockRect, setStockRect] = useState<DOMRect | null>(null);
  const [nameRect, setNameRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stockInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const found = inventory.find((i) => i.id === itemId) ?? null;
    setStockQuery(found?.stockId ?? '');
    setNameQuery(found?.item ?? '');
  }, [itemId, inventory]);

  const stockMatches = stockQuery.trim()
    ? inventory.filter((i) => (i.stockId ?? '').toLowerCase().includes(stockQuery.trim().toLowerCase()))
    : [];
  const nameMatches = nameQuery.trim()
    ? inventory.filter((i) => i.item.toLowerCase().includes(nameQuery.trim().toLowerCase()))
    : [];

  function select(item: InventoryItem) {
    setStockQuery(item.stockId ?? '');
    setNameQuery(item.item);
    setStockOpen(false);
    setNameOpen(false);
    onChange(item.id, item);
  }

  function onStockChange(e: React.ChangeEvent<HTMLInputElement>) {
    setStockQuery(e.target.value);
    if (stockInputRef.current) setStockRect(stockInputRef.current.getBoundingClientRect());
    setStockOpen(true);
    if (!e.target.value.trim()) { setNameQuery(''); onChange(0); }
  }

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNameQuery(e.target.value);
    if (nameInputRef.current) setNameRect(nameInputRef.current.getBoundingClientRect());
    setNameOpen(true);
    if (!e.target.value.trim()) { setStockQuery(''); onChange(0); }
  }

  function handleBlur(e: React.FocusEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setTimeout(() => { setStockOpen(false); setNameOpen(false); }, 150);
    }
  }

  return (
    <div ref={containerRef} style={{ display: 'contents' }} onBlur={handleBlur}>
      <label>
        Stock ID
        <div style={{ position: 'relative' }}>
          <input ref={stockInputRef} style={{ width: '100%', boxSizing: 'border-box' }}
            value={stockQuery} onChange={onStockChange}
            onFocus={() => {
              if (stockInputRef.current) setStockRect(stockInputRef.current.getBoundingClientRect());
              if (stockQuery.trim()) setStockOpen(true);
            }}
            placeholder="Stock ID" />
          {stockOpen && stockMatches.length > 0 && (
            <div style={fixedDropStyle(stockRect)}>
              {stockMatches.map((i) => <DropItem key={i.id} inv={i} onSelect={select} />)}
            </div>
          )}
        </div>
      </label>
      <label>
        Part Name
        <div style={{ position: 'relative' }}>
          <input ref={nameInputRef} style={{ width: '100%', boxSizing: 'border-box' }}
            value={nameQuery} onChange={onNameChange}
            onFocus={() => {
              if (nameInputRef.current) setNameRect(nameInputRef.current.getBoundingClientRect());
              if (nameQuery.trim()) setNameOpen(true);
            }}
            placeholder="Type part name..." />
          {nameOpen && nameMatches.length > 0 && (
            <div style={fixedDropStyle(nameRect)}>
              {nameMatches.map((i) => <DropItem key={i.id} inv={i} onSelect={select} />)}
            </div>
          )}
        </div>
      </label>
    </div>
  );
}

/**
 * Table variant: renders two <td> cells (Stock ID + Part Name).
 * Uses position:fixed dropdowns so they escape overflow:auto on .table-wrap.
 */
export function StockItemPickerCells({ itemId, inventory, onChange }: Props) {
  const inv = inventory.find((i) => i.id === itemId) ?? null;
  const [stockQuery, setStockQuery] = useState(inv?.stockId ?? '');
  const [nameQuery, setNameQuery] = useState(inv?.item ?? '');
  const [stockOpen, setStockOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stockRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [stockRect, setStockRect] = useState<DOMRect | null>(null);
  const [nameRect, setNameRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const found = inventory.find((i) => i.id === itemId) ?? null;
    setStockQuery(found?.stockId ?? '');
    setNameQuery(found?.item ?? '');
  }, [itemId, inventory]);

  // Search: stock ID field matches stockId OR partNo; name field matches item name
  const stockMatches = stockQuery.trim()
    ? inventory.filter((i) =>
        (i.stockId ?? '').toLowerCase().includes(stockQuery.trim().toLowerCase()) ||
        (i.partNo ?? '').toLowerCase().includes(stockQuery.trim().toLowerCase())
      )
    : [];
  const nameMatches = nameQuery.trim()
    ? inventory.filter((i) => i.item.toLowerCase().includes(nameQuery.trim().toLowerCase()))
    : [];

  function select(item: InventoryItem) {
    setStockQuery(item.stockId ?? '');
    setNameQuery(item.item);
    setStockOpen(false);
    setNameOpen(false);
    onChange(item.id, item);
  }

  function onStockChange(e: React.ChangeEvent<HTMLInputElement>) {
    setStockQuery(e.target.value);
    if (stockRef.current) setStockRect(stockRef.current.getBoundingClientRect());
    setStockOpen(true);
    if (!e.target.value.trim()) { setNameQuery(''); onChange(0); }
  }

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNameQuery(e.target.value);
    if (nameRef.current) setNameRect(nameRef.current.getBoundingClientRect());
    setNameOpen(true);
    if (!e.target.value.trim()) { setStockQuery(''); onChange(0); }
  }

  function onCellBlur() {
    blurTimer.current = setTimeout(() => { setStockOpen(false); setNameOpen(false); }, 150);
  }

  function onCellFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }

  return (
    <>
      <td onBlur={onCellBlur} onFocus={onCellFocus}>
        <input ref={stockRef}
          style={{ width: '100%', boxSizing: 'border-box' }}
          value={stockQuery} onChange={onStockChange}
          onFocus={() => {
            onCellFocus();
            if (stockRef.current) setStockRect(stockRef.current.getBoundingClientRect());
            if (stockQuery.trim()) setStockOpen(true);
          }}
          placeholder="" />
        {stockOpen && stockMatches.length > 0 && (
          <div style={fixedDropStyle(stockRect)}>
            {stockMatches.map((i) => <DropItem key={i.id} inv={i} onSelect={select} />)}
          </div>
        )}
      </td>
      <td onBlur={onCellBlur} onFocus={onCellFocus}>
        <input ref={nameRef}
          style={{ width: '100%', boxSizing: 'border-box' }}
          value={nameQuery} onChange={onNameChange}
          onFocus={() => {
            onCellFocus();
            if (nameRef.current) setNameRect(nameRef.current.getBoundingClientRect());
            if (nameQuery.trim()) setNameOpen(true);
          }}
          placeholder="" />
        {nameOpen && nameMatches.length > 0 && (
          <div style={fixedDropStyle(nameRect)}>
            {nameMatches.map((i) => <DropItem key={i.id} inv={i} onSelect={select} />)}
          </div>
        )}
      </td>
    </>
  );
}
