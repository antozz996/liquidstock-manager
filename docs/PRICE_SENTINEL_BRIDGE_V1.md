# LiquidStock → Price Sentinel Bridge v1

## Scope

This contract describes events produced by LiquidStock after an operator confirms,
receives, or cancels a supplier sub-order. Sprint 3 only persists events in the
LiquidStock transactional outbox. It does not call Price Sentinel and it does not
change Price Sentinel code.

Integration version: `1.0`

Events:

- `supplier_order_confirmed`
- `supplier_order_received`
- `supplier_order_cancelled`

Prices are deliberately absent. LiquidStock manual orders do not contain purchase
prices and the bridge must not infer them.

## Price Sentinel compatibility

The Price Sentinel repository is located at `/root/PRICE SENTINEL`.

Its current data model uses:

- integer `fornitori.id`, with VAT number as the unique business identifier;
- integer canonical `products.id`, with optional internal SKU;
- supplier-specific aliases in `supplier_product_aliases`;
- invoices in `fatture` and immutable source XML in `xml_raw`;
- invoice lines in `righe_fattura`;
- append-only price lists in `listino_master`;
- anomaly workflow records in `anomalie`;
- integer `location.id`.

The existing `/api/v1/ordini` endpoints optimize price and supplier routing. They
must not receive this payload because LiquidStock requires operator-selected
suppliers and no automatic optimization. Price Sentinel currently has no
service-to-service endpoint for this bridge.

LiquidStock identifiers remain authoritative for event identity. Optional Price
Sentinel identifiers are strings because the two systems use different native ID
types and future receivers must validate them explicitly. No name-based match is
created automatically.

## Envelope

```json
{
  "integration_version": "1.0",
  "event_type": "supplier_order_confirmed",
  "liquidstock_order_id": "uuid",
  "liquidstock_supplier_order_id": "uuid",
  "venue_id": "uuid",
  "venue_name_snapshot": "Locale",
  "supplier_id": "uuid",
  "price_sentinel_supplier_id": null,
  "supplier_name_snapshot": "Fornitore",
  "sent_at": "2026-07-23T12:00:00Z",
  "requested_delivery_date": "2026-07-30",
  "order_version": 3,
  "rows": [
    {
      "product_id": "uuid-or-null",
      "price_sentinel_product_id": null,
      "product_name_snapshot": "Prodotto",
      "quantity": 4,
      "unit": "cartoni",
      "package_note": "6 x 1 L",
      "supplier_note": "Consegna mattina"
    }
  ]
}
```

Only populated optional fields are semantically meaningful. JSON keys remain
stable so consumers can validate one schema. `sent_at` is non-null for confirmed
and received events; it can be null when a never-confirmed supplier sub-order is
cancelled.

For `supplier_order_received`, the envelope additionally contains:

```json
{
  "received_at": "2026-07-24T08:30:00Z",
  "receipt": {
    "status": "complete",
    "items": [
      {
        "supplier_order_item_id": "uuid",
        "ordered_quantity": 4,
        "received_quantity": 5,
        "missing_quantity": 0,
        "line_status": "over_received",
        "note": "Una unità extra"
      }
    ]
  }
}
```

For `supplier_order_cancelled`, the envelope additionally contains
`cancelled_at`.

## Delivery and idempotency

`integration_outbox.id` is the delivery event ID. A future dispatcher must send
it as the idempotency key. Price Sentinel must persist that key before applying
an event and return success for duplicates.

The future receiver must:

1. accept only supported `integration_version` values;
2. authenticate a service identity, not a browser;
3. reject venue, supplier, or product mappings that are not explicitly stored;
4. never infer a Price Sentinel ID from a name;
5. process events in `created_at` order per `aggregate_id`;
6. treat cancellation and receipt as state transitions, not invoice matching;
7. keep invoice matching as a separate, future workflow.

## LiquidStock lifecycle rules

- Opening WhatsApp records `whatsapp_opened`, but is not proof of sending.
- Saving a draft keeps one provisional `pending` sub-order for every assigned
  supplier. Rewriting the draft can replace that provisional identity.
- Confirming a supplier sub-order captures immutable header and line snapshots.
- The first confirmation changes the general order from `draft` to `sent`.
- From that moment the draft is immutable. Remaining suppliers can still be
  confirmed, received, or cancelled against the same order version.
- WhatsApp cannot be reopened through the tracked action after confirmation;
  confirmed and terminal supplier records cannot have their snapshots rewritten.
- Receipt submissions are cumulative declarations and are immutable history.
- Over-receipt is accepted and marked `over_received`.
- No lifecycle action reads or updates `products.current_stock`.
