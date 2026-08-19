import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { Prisma } from "@/generated/prisma/client";

export type InvoiceWithDetails = Prisma.InvoiceGetPayload<{
  include: {
    school: true;
    payments: true;
    items: {
      include: {
        productVariant: { include: { product: true } };
      };
    };
  };
}>;

type InvoiceItem = InvoiceWithDetails["items"][number];
type InvoicePayment = InvoiceWithDetails["payments"][number];

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E1",
    paddingBottom: 12,
    marginBottom: 18,
  },
  brand: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  muted: { color: "#64748B" },
  invoiceTitle: { fontSize: 15, fontWeight: 700, textAlign: "right" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  infoBox: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 10,
  },
  infoTitle: { fontSize: 10, fontWeight: 700, marginBottom: 8 },
  infoLine: { marginBottom: 5 },
  label: { fontSize: 7, color: "#64748B", marginBottom: 1 },
  value: { fontSize: 9 },
  table: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tableHeadText: { fontSize: 7, fontWeight: 700, color: "#475569" },
  colItem: { width: "38%" },
  colQty: { width: "8%", textAlign: "center" },
  colRate: { width: "16%", textAlign: "right" },
  colTaxable: { width: "16%", textAlign: "right" },
  colGst: { width: "12%", textAlign: "right" },
  colTotal: { width: "10%", textAlign: "right" },
  itemName: { fontSize: 9, marginBottom: 2 },
  itemMeta: { fontSize: 7, color: "#64748B" },
  summaryWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  note: {
    width: "50%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 9,
    minHeight: 78,
  },
  summary: { width: "42%" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
    paddingTop: 7,
    marginTop: 2,
    marginBottom: 7,
    fontSize: 11,
    fontWeight: 700,
  },
  payment: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
  },
  paymentHeader: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 6,
  },
  paymentRow: {
    flexDirection: "row",
    padding: 6,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  payDate: { width: "30%" },
  payMode: { width: "25%" },
  payRef: { width: "25%" },
  payAmount: { width: "20%", textAlign: "right" },
  footer: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 10,
    textAlign: "center",
    fontSize: 7,
    color: "#64748B",
  },
});

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(typeof value === "object" ? String(value) : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `Rs. ${toNumber(value).toFixed(2)}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function getPaymentModes(payments: InvoicePayment[]) {
  return payments.length
    ? payments.map((payment) => payment.mode.replaceAll("_", " ")).join(", ")
    : "-";
}

function getItemMeta(item: InvoiceItem) {
  const variant = item.productVariant;
  return [
    variant.sku ? `SKU: ${variant.sku}` : "",
    variant.hsnCode ? `HSN: ${variant.hsnCode}` : "",
    variant.className ? `Class: ${variant.className}` : "",
    variant.sectionName ? `Section: ${variant.sectionName}` : "",
    variant.size ? `Size: ${variant.size}` : "",
    variant.color ? `Color: ${variant.color}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function createInvoicePdfDocument(invoice: InvoiceWithDetails) {
  const classSection = [
    invoice.customerClassName ? `Class ${invoice.customerClassName}` : "",
    invoice.customerSectionName ? `Section ${invoice.customerSectionName}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{invoice.school.name}</Text>
            <Text style={styles.muted}>School Billing POS · Tax Invoice / Receipt</Text>
            {invoice.school.address ? <Text style={styles.muted}>{invoice.school.address}</Text> : null}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={[styles.muted, { textAlign: "right", marginTop: 3 }]}>{invoice.status}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Invoice Details</Text>
            <View style={styles.infoLine}><Text style={styles.label}>Invoice No.</Text><Text style={styles.value}>{invoice.invoiceNo}</Text></View>
            <View style={styles.infoLine}><Text style={styles.label}>Date</Text><Text style={styles.value}>{formatDate(invoice.createdAt)}</Text></View>
            <View style={styles.infoLine}><Text style={styles.label}>Payment</Text><Text style={styles.value}>{getPaymentModes(invoice.payments)}</Text></View>
            <View style={styles.infoLine}><Text style={styles.label}>School Code</Text><Text style={styles.value}>{invoice.school.code}</Text></View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Customer / Student</Text>
            <View style={styles.infoLine}><Text style={styles.label}>Name</Text><Text style={styles.value}>{invoice.customerName || "-"}</Text></View>
            <View style={styles.infoLine}><Text style={styles.label}>Contact Number</Text><Text style={styles.value}>{invoice.customerPhone || "-"}</Text></View>
            <View style={styles.infoLine}><Text style={styles.label}>Class / Section</Text><Text style={styles.value}>{classSection || "-"}</Text></View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colItem, styles.tableHeadText]}>ITEM</Text>
            <Text style={[styles.colQty, styles.tableHeadText]}>QTY</Text>
            <Text style={[styles.colRate, styles.tableHeadText]}>BASE RATE</Text>
            <Text style={[styles.colTaxable, styles.tableHeadText]}>TAXABLE</Text>
            <Text style={[styles.colGst, styles.tableHeadText]}>GST</Text>
            <Text style={[styles.colTotal, styles.tableHeadText]}>TOTAL</Text>
          </View>

          {invoice.items.map((item) => {
            const meta = getItemMeta(item);
            return (
              <View key={item.id} style={styles.tableRow}>
                <View style={styles.colItem}>
                  <Text style={styles.itemName}>{item.productVariant.product.name}</Text>
                  {meta ? <Text style={styles.itemMeta}>{meta}</Text> : null}
                </View>
                <Text style={styles.colQty}>{item.quantity}</Text>
                <Text style={styles.colRate}>{money(item.unitPrice)}</Text>
                <Text style={styles.colTaxable}>{money(item.taxableAmount)}</Text>
                <Text style={styles.colGst}>{money(item.gstAmount)} ({toNumber(item.gstRate).toFixed(2)}%)</Text>
                <Text style={styles.colTotal}>{money(item.lineTotal)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.summaryWrap}>
          <View style={styles.note}>
            <Text style={styles.infoTitle}>Note</Text>
            <Text style={styles.muted}>{invoice.note || "No additional note."}</Text>
          </View>
          <View style={styles.summary}>
            <View style={styles.summaryRow}><Text>Taxable subtotal</Text><Text>{money(invoice.subtotalAmount)}</Text></View>
            <View style={styles.summaryRow}><Text>GST amount</Text><Text>{money(invoice.gstAmount)}</Text></View>
            <View style={styles.summaryRow}><Text>Gross total</Text><Text>{money(invoice.totalAmount)}</Text></View>
            <View style={styles.summaryRow}><Text>Discount</Text><Text>- {money(invoice.discountAmount)}</Text></View>
            {toNumber(invoice.exchangeCreditAmount) > 0 ? (
              <View style={styles.summaryRow}><Text>Exchange credit</Text><Text>- {money(invoice.exchangeCreditAmount)}</Text></View>
            ) : null}
            <View style={styles.grand}><Text>Payable</Text><Text>{money(invoice.payableAmount)}</Text></View>
            <View style={styles.summaryRow}><Text>Paid</Text><Text>{money(invoice.paidAmount)}</Text></View>
            <View style={styles.summaryRow}><Text>Balance</Text><Text>{money(invoice.balanceAmount)}</Text></View>
          </View>
        </View>

        {invoice.payments.length ? (
          <View style={styles.payment}>
            <View style={styles.paymentHeader}>
              <Text style={[styles.payDate, styles.tableHeadText]}>DATE</Text>
              <Text style={[styles.payMode, styles.tableHeadText]}>MODE</Text>
              <Text style={[styles.payRef, styles.tableHeadText]}>REFERENCE</Text>
              <Text style={[styles.payAmount, styles.tableHeadText]}>AMOUNT</Text>
            </View>
            {invoice.payments.map((payment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <Text style={styles.payDate}>{formatDate(payment.paidAt)}</Text>
                <Text style={styles.payMode}>{payment.mode.replaceAll("_", " ")}</Text>
                <Text style={styles.payRef}>{payment.transactionRef || "-"}</Text>
                <Text style={styles.payAmount}>{money(payment.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer}>
          This is a system generated invoice. GST is calculated from the product-level GST rate configured at the time of billing.
        </Text>
      </Page>
    </Document>
  );
}
