import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate, formatNumber } from './formatters';
import type { Event, ReportSummary, Product } from '../types';

/**
 * Genera il PDF del report di fine serata.
 */
export const generateReportPDF = (event: Event, summary: ReportSummary) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(40);
  doc.text('LiquidStock Manager', 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Report Serata: ${event.name}`, 14, 30);
  doc.text(`Data Evento: ${formatDate(event.date)}`, 14, 35);
  doc.text(`Generato il: ${formatDate(new Date())}`, 14, 40);

  // Totali Riassuntivi
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text('Riepilogo Economico', 14, 55);
  
  const summaryData = [
    ['Costo Consumato', formatCurrency(summary.total_cost_consumed)],
    ['Ricavo Stimato', formatCurrency(summary.total_revenue_est)],
    ['Margine Lordo', formatCurrency(summary.total_margin)],
  ];

  autoTable(doc, {
    startY: 60,
    head: [['Voce', 'Valore']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] }, // primary blue
  });

  // Dettaglio Prodotti
  doc.text('Dettaglio Consumi', 14, (doc as any).lastAutoTable.finalY + 15);

  const productData = summary.details_json.map((row: any) => [
    row.product?.name || 'N/A',
    formatNumber(row.initial_qty),
    formatNumber(row.final_qty),
    formatNumber(row.consumed),
    formatCurrency(row.cost_value),
    formatCurrency(row.rev_value),
  ]);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Prodotto', 'Inizio', 'Fine', 'Cons.', 'Costo', 'Ricavo']],
    body: productData,
    theme: 'grid',
    headStyles: { fillColor: [31, 41, 55] }, // dark gray
    styles: { fontSize: 8 },
  });

  // Footer Valore Magazzino
  const finalY = (doc as any).lastAutoTable.finalY;
  doc.setFontSize(12);
  doc.text(`Valore Magazzino Residuo (Costo): ${formatCurrency(summary.total_stock_value_cost)}`, 14, finalY + 15);
  doc.text(`Valore Magazzino Residuo (Vendita): ${formatCurrency(summary.total_stock_value_sell)}`, 14, finalY + 22);

  if (event.status === 'closed') {
     doc.setFontSize(8);
     doc.setTextColor(150);
     doc.text('Questo documento è un report ufficiale generato dal sistema LiquidStock.', 14, 285);
  }

  doc.save(`Report_${event.name.replace(/\s+/g, '_')}_${event.date}.pdf`);
};

/**
 * Genera il PDF per l'ordine di acquisto basato sulle soglie.
 */
export const generateReorderPDF = (reorderItems: any[]) => {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.text('Ordine di Acquisto', 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Data: ${formatDate(new Date())}`, 14, 30);

  const tableData = reorderItems.map(item => [
    item.name,
    item.category,
    formatNumber(item.current_stock),
    formatNumber(item.min_threshold),
    formatNumber(item.qty_to_order),
    formatCurrency(item.cost_price),
    formatCurrency(item.order_cost),
  ]);

  const totalCost = reorderItems.reduce((acc, item) => acc + item.order_cost, 0);

  autoTable(doc, {
    startY: 40,
    head: [['Prodotto', 'Cat.', 'Stock', 'Soglia', 'Ordine', 'Costo Un.', 'Totale']],
    body: tableData,
    foot: [['', '', '', '', '', 'TOTALE STIMATO', formatCurrency(totalCost)]],
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11] }, // orange accent
    footStyles: { fillColor: [245, 158, 11] },
  });

  doc.save(`Ordine_Acquisto_${formatDate(new Date()).replace(/\//g, '-')}.pdf`);
};
