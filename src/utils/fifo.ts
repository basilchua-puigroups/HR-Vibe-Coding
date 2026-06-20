import type { AppState, InventoryItem, ReceiveInRecord, StockLayer, StockLayerConsumption } from '../types';

type IssueLine = {
  itemId: number;
  quantity: number;
};

type FifoSource = {
  sourceType: string;
  sourceRef: string;
  sourceId?: number;
  issueDate: string;
};

const OPENING_DATE = '1900-01-01';

function nextLayerId(layers: StockLayer[]): number {
  return Math.max(0, ...layers.map((l) => Number(l.id) || 0)) + 1;
}

function nextConsumptionId(consumptions: StockLayerConsumption[]): number {
  return Math.max(0, ...consumptions.map((c) => Number(c.id) || 0)) + 1;
}

function layerCost(layer: StockLayer): number {
  const gross = Number(layer.unitPrice || 0);
  return gross + gross * Number(layer.sstPercent || 0) / 100;
}

function itemName(itemId: number, inventory: InventoryItem[]): string {
  return inventory.find((i) => i.id === itemId)?.item ?? `Item ${itemId}`;
}

function ensureOpeningLayer(
  layers: StockLayer[],
  inventory: InventoryItem[],
  itemId: number,
  nextId: number,
): { layers: StockLayer[]; nextId: number } {
  const inv = inventory.find((i) => i.id === itemId);
  if (!inv) return { layers, nextId };

  const remaining = layers.reduce((sum, layer) =>
    layer.itemId === itemId ? sum + Number(layer.quantityRemaining || 0) : sum
  , 0);
  const missing = Number(inv.quantity || 0) - remaining;
  if (missing <= 0) return { layers, nextId };

  return {
    layers: [
      ...layers,
      {
        id: nextId,
        itemId,
        receivedDate: OPENING_DATE,
        sourceType: 'Opening Balance',
        sourceRef: 'Opening Balance',
        quantityReceived: missing,
        quantityRemaining: missing,
        unit: inv.unit,
        unitPrice: 0,
        sstPercent: 0,
      },
    ],
    nextId: nextId + 1,
  };
}

export function receiveInLayers(record: ReceiveInRecord, existingLayers: StockLayer[]): StockLayer[] {
  let id = nextLayerId(existingLayers);
  return record.items.map((item, idx) => ({
    id: id++,
    itemId: item.itemId,
    receivedDate: record.date,
    sourceType: 'Receive In',
    sourceRef: record.receiveNo,
    sourceId: record.id,
    sourceLineIdx: idx,
    supplierId: item.supplierId ?? record.supplierId,
    supplier: item.supplier || record.supplier || '',
    quantityReceived: Number(item.quantity || 0),
    quantityRemaining: Number(item.quantity || 0),
    unit: item.unit,
    unitPrice: Number(item.unitPrice || 0),
    sstPercent: Number(item.sstPercent || 0),
  }));
}

export function consumeFifo(
  state: AppState,
  lines: IssueLine[],
  source: FifoSource,
): { stockLayers: StockLayer[]; stockLayerConsumptions: StockLayerConsumption[]; error?: string } {
  let layers = [...(state.stockLayers ?? [])];
  let consumptions = [...(state.stockLayerConsumptions ?? [])];
  let layerId = nextLayerId(layers);
  let consumptionId = nextConsumptionId(consumptions);

  for (const [lineIdx, line] of lines.entries()) {
    let qty = Number(line.quantity || 0);
    if (!line.itemId || qty <= 0) continue;

    const ensured = ensureOpeningLayer(layers, state.inventory, line.itemId, layerId);
    layers = ensured.layers;
    layerId = ensured.nextId;

    const sorted = layers
      .map((layer, idx) => ({ layer, idx }))
      .filter(({ layer }) => layer.itemId === line.itemId && Number(layer.quantityRemaining || 0) > 0)
      .sort((a, b) =>
        (a.layer.receivedDate || '').localeCompare(b.layer.receivedDate || '') ||
        Number(a.layer.id || 0) - Number(b.layer.id || 0)
      );

    for (const { layer, idx } of sorted) {
      if (qty <= 0) break;
      const available = Number(layer.quantityRemaining || 0);
      const used = Math.min(available, qty);
      layers[idx] = { ...layer, quantityRemaining: available - used };
      consumptions = [
        ...consumptions,
        {
          id: consumptionId++,
          layerId: layer.id,
          itemId: line.itemId,
          issueDate: source.issueDate,
          sourceType: source.sourceType,
          sourceRef: source.sourceRef,
          sourceId: source.sourceId,
          sourceLineIdx: lineIdx,
          quantity: used,
          unitCost: layerCost(layer),
        },
      ];
      qty -= used;
    }

    if (qty > 0.000001) {
      return {
        stockLayers: state.stockLayers ?? [],
        stockLayerConsumptions: state.stockLayerConsumptions ?? [],
        error: `${itemName(line.itemId, state.inventory)} has insufficient FIFO stock layers.`,
      };
    }
  }

  return { stockLayers: layers, stockLayerConsumptions: consumptions };
}

export function restoreFifoSource(
  state: AppState,
  sourceType: string,
  sourceRef: string,
): { stockLayers: StockLayer[]; stockLayerConsumptions: StockLayerConsumption[] } {
  const restore = (state.stockLayerConsumptions ?? []).filter((c) =>
    c.sourceType === sourceType && c.sourceRef === sourceRef
  );
  if (!restore.length) {
    return {
      stockLayers: state.stockLayers ?? [],
      stockLayerConsumptions: state.stockLayerConsumptions ?? [],
    };
  }

  const layers = (state.stockLayers ?? []).map((layer) => {
    const qty = restore.reduce((sum, c) => c.layerId === layer.id ? sum + Number(c.quantity || 0) : sum, 0);
    return qty > 0 ? { ...layer, quantityRemaining: Number(layer.quantityRemaining || 0) + qty } : layer;
  });
  const consumptions = (state.stockLayerConsumptions ?? []).filter((c) =>
    !(c.sourceType === sourceType && c.sourceRef === sourceRef)
  );
  return { stockLayers: layers, stockLayerConsumptions: consumptions };
}

export function receiveInHasFifoConsumption(state: AppState, receiveNo: string): boolean {
  const receiveLayerIds = new Set(
    (state.stockLayers ?? [])
      .filter((layer) => layer.sourceType === 'Receive In' && layer.sourceRef === receiveNo)
      .map((layer) => layer.id),
  );
  return (state.stockLayerConsumptions ?? []).some((c) => receiveLayerIds.has(c.layerId));
}
