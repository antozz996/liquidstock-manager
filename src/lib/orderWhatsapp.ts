import type { PurchaseOrder, PurchaseOrderItem } from '../types/orders';

interface BuildWhatsappMessageInput {
  venueName: string;
  departmentName: string;
  requestedDeliveryDate: string | null;
  generalNotes: string | null;
  items: PurchaseOrderItem[];
}

const displayDate = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

export const normalizeWhatsappNumber = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() || '';
  if (!trimmed || !/^[+\d\s()./-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits || null;
};

export const buildWhatsappUrl = (number: string, message: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

export const buildWhatsappMessage = ({
  venueName,
  departmentName,
  requestedDeliveryDate,
  generalNotes,
  items,
}: BuildWhatsappMessageInput): string => {
  const lines = [`ORDINE — ${venueName.trim() || 'Locale'}`];
  if (departmentName.trim()) lines.push(`Reparto: ${departmentName.trim()}`);
  if (requestedDeliveryDate) lines.push(`Consegna richiesta: ${displayDate(requestedDeliveryDate)}`);

  lines.push('');
  for (const item of items) {
    const quantityAndUnit = [String(item.quantity), item.unit.trim()].filter(Boolean).join(' ');
    let line = `- ${quantityAndUnit} ${item.product_name_snapshot.trim()}`.trim();
    if (item.package_note?.trim()) line += ` — ${item.package_note.trim()}`;
    if (item.supplier_note?.trim()) line += ` (${item.supplier_note.trim()})`;
    lines.push(line);
  }

  if (generalNotes?.trim()) {
    lines.push('', `Note: ${generalNotes.trim()}`);
  }
  return lines.join('\n');
};

export const groupOrderItemsBySupplier = (order: PurchaseOrder) => {
  const assigned = new Map<string, PurchaseOrderItem[]>();
  const unassigned: PurchaseOrderItem[] = [];
  for (const item of order.items || []) {
    if (!item.supplier_id) {
      unassigned.push(item);
      continue;
    }
    const group = assigned.get(item.supplier_id) || [];
    group.push(item);
    assigned.set(item.supplier_id, group);
  }
  return { assigned, unassigned };
};
