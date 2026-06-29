import type { Prisma } from "@/generated/prisma/client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

export type InvoiceWithDetails = Prisma.InvoiceGetPayload<{
  include: {
    school: true;
    payments: true;
    items: {
      include: {
        productVariant: {
          include: {
            product: true;
          };
        };
      };
    };
  };
}>;

type InvoiceItem = InvoiceWithDetails["items"][number];
type InvoicePayment = InvoiceWithDetails["payments"][number];

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },

  header: {
    marginBottom: 22,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E1",
  },

  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  brandBlock: {
    width: "65%",
  },

  brand: {
    fontSize: 22,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 10,
    color: "#64748B",
  },

  invoiceBadge: {
    width: "30%",
    textAlign: "right",
  },

  invoiceBadgeText: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 4,
  },

  invoiceStatus: {
    fontSize: 9,
    color: "#475569",
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  box: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#F8FAFC",
  },

  boxTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 10,
  },

  infoRow: {
    marginBottom: 7,
  },

  label: {
    fontSize: 8,
    color: "#64748B",
    marginBottom: 2,
  },

  value: {
    fontSize: 10,
    color: "#0F172A",
  },

  table: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    marginTop: 4,
  },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },

  tableHeaderText: {
    fontSize: 8,
    fontWeight: 700,
    color: "#475569",
  },

  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },

  colItem: {
    width: "43%",
  },

  colQty: {
    width: "12%",
    textAlign: "center",
  },

  colRate: {
    width: "15%",
    textAlign: "right",
  },

  colDiscount: {
    width: "15%",
    textAlign: "right",
  },

  colTotal: {
    width: "15%",
    textAlign: "right",
  },

  itemName: {
    fontSize: 10,
    color: "#0F172A",
    marginBottom: 2,
  },

  itemMeta: {
    fontSize: 8,
    color: "#64748B",
  },

  totalsWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },

  noteBox: {
    width: "50%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 10,
    minHeight: 80,
  },

  noteTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 6,
  },

  noteText: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.4,
  },

  totals: {
    width: "40%",
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },

  totalLabel: {
    fontSize: 10,
    color: "#475569",
  },

  totalValue: {
    fontSize: 10,
    color: "#0F172A",
  },

  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 8,
  },

  grandTotalLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
  },

  grandTotalValue: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
  },

  paymentTable: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
  },

  paymentHeader: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },

  paymentRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },

  payDate: {
    width: "30%",
  },

  payMode: {
    width: "25%",
  },

  payRef: {
    width: "25%",
  },

  payAmount: {
    width: "20%",
    textAlign: "right",
  },

  footer: {
    marginTop: 34,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    textAlign: "center",
    fontSize: 8,
    color: "#64748B",
  },
});

function toNumber(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value === "object") {
    const decimalValue = value as {
      toNumber?: () => number;
      toString?: () => string;
    };

    if (typeof decimalValue.toNumber === "function") {
      return decimalValue.toNumber();
    }

    if (typeof decimalValue.toString === "function") {
      const parsed = Number(decimalValue.toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }

  return 0;
}

function money(value: unknown) {
  return `Rs. ${toNumber(value).toFixed(2)}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPaymentMode(mode: string) {
  return mode.split("_").join(" ");
}

function getPaymentModes(payments: InvoicePayment[]) {
  if (payments.length === 0) {
    return "-";
  }

  return payments.map((payment) => formatPaymentMode(payment.mode)).join(", ");
}

function getCustomerName(invoice: InvoiceWithDetails) {
  return invoice.customerName || "Walk-in Customer";
}

function getCustomerPhone(invoice: InvoiceWithDetails) {
  return invoice.customerPhone || "-";
}

function getCustomerClass(invoice: InvoiceWithDetails) {
  const classParts = [
    invoice.customerClassName,
    invoice.customerSectionName,
  ].filter(Boolean);

  if (classParts.length === 0) {
    return "-";
  }

  return classParts.join(" - ");
}

function getItemName(item: InvoiceItem) {
  const productName = item.productVariant.product.name;

  const variantParts = [
    item.productVariant.className,
    item.productVariant.sectionName,
    item.productVariant.size,
    item.productVariant.color,
  ].filter(Boolean);

  if (variantParts.length === 0) {
    return productName;
  }

  return `${productName} - ${variantParts.join(", ")}`;
}

function getItemMeta(item: InvoiceItem) {
  const metaParts = [
    item.productVariant.sku ? `SKU: ${item.productVariant.sku}` : null,
    item.productVariant.barcode
      ? `Barcode: ${item.productVariant.barcode}`
      : null,
    item.productVariant.unit ? `Unit: ${item.productVariant.unit}` : null,
  ].filter(Boolean);

  return metaParts.join(" | ");
}

export function createInvoicePdfDocument(invoice: InvoiceWithDetails) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandBlock}>
              <Text style={styles.brand}>School Billing POS</Text>
              <Text style={styles.subtitle}>
                Official Invoice / Payment Receipt
              </Text>
            </View>

            <View style={styles.invoiceBadge}>
              <Text style={styles.invoiceBadgeText}>INVOICE</Text>
              <Text style={styles.invoiceStatus}>{invoice.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.topRow}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Invoice Details</Text>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Invoice No.</Text>
              <Text style={styles.value}>{invoice.invoiceNo}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Invoice Date</Text>
              <Text style={styles.value}>{formatDate(invoice.createdAt)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Payment Mode</Text>
              <Text style={styles.value}>{getPaymentModes(invoice.payments)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>School</Text>
              <Text style={styles.value}>{invoice.school.name}</Text>
            </View>
          </View>

          <View style={styles.box}>
            <Text style={styles.boxTitle}>Customer Details</Text>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Customer Name</Text>
              <Text style={styles.value}>{getCustomerName(invoice)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Phone</Text>
              <Text style={styles.value}>{getCustomerPhone(invoice)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Class / Section</Text>
              <Text style={styles.value}>{getCustomerClass(invoice)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colItem, styles.tableHeaderText]}>ITEM</Text>
            <Text style={[styles.colQty, styles.tableHeaderText]}>QTY</Text>
            <Text style={[styles.colRate, styles.tableHeaderText]}>RATE</Text>
            <Text style={[styles.colDiscount, styles.tableHeaderText]}>
              DISCOUNT
            </Text>
            <Text style={[styles.colTotal, styles.tableHeaderText]}>TOTAL</Text>
          </View>

          {invoice.items.map((item: InvoiceItem) => {
            const itemMeta = getItemMeta(item);

            return (
              <View key={item.id} style={styles.tableRow}>
                <View style={styles.colItem}>
                  <Text style={styles.itemName}>{getItemName(item)}</Text>

                  {itemMeta ? (
                    <Text style={styles.itemMeta}>{itemMeta}</Text>
                  ) : null}
                </View>

                <Text style={styles.colQty}>{item.quantity}</Text>
                <Text style={styles.colRate}>{money(item.unitPrice)}</Text>
                <Text style={styles.colDiscount}>
                  {money(item.discountAmount)}
                </Text>
                <Text style={styles.colTotal}>{money(item.lineTotal)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Note</Text>
            <Text style={styles.noteText}>
              {invoice.note || "No additional note."}
            </Text>
          </View>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>{money(invoice.totalAmount)}</Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={styles.totalValue}>
                {money(invoice.discountAmount)}
              </Text>
            </View>

            <View style={styles.grandTotal}>
              <Text style={styles.grandTotalLabel}>Payable</Text>
              <Text style={styles.grandTotalValue}>
                {money(invoice.payableAmount)}
              </Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Paid</Text>
              <Text style={styles.totalValue}>{money(invoice.paidAmount)}</Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Balance</Text>
              <Text style={styles.totalValue}>
                {money(invoice.balanceAmount)}
              </Text>
            </View>
          </View>
        </View>

        {invoice.payments.length > 0 ? (
          <View style={styles.paymentTable}>
            <View style={styles.paymentHeader}>
              <Text style={[styles.payDate, styles.tableHeaderText]}>DATE</Text>
              <Text style={[styles.payMode, styles.tableHeaderText]}>MODE</Text>
              <Text style={[styles.payRef, styles.tableHeaderText]}>
                REFERENCE
              </Text>
              <Text style={[styles.payAmount, styles.tableHeaderText]}>
                AMOUNT
              </Text>
            </View>

            {invoice.payments.map((payment: InvoicePayment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <Text style={styles.payDate}>{formatDate(payment.paidAt)}</Text>

                <Text style={styles.payMode}>
                  {formatPaymentMode(payment.mode)}
                </Text>

                <Text style={styles.payRef}>
                  {payment.transactionRef || "-"}
                </Text>

                <Text style={styles.payAmount}>{money(payment.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer}>
          This is a system generated invoice. No signature is required.
        </Text>
      </Page>
    </Document>
  );
}