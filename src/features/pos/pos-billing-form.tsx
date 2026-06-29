"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { createPosInvoiceAction } from "@/features/pos/actions";

// ==============================
// Constants & Types
// ==============================

const MAX_VISIBLE_PRODUCTS = 200;
const MAX_CART_ITEMS = 50;

export type PosSchoolOption = {
  id: string;
  name: string;
};

export type PosProductOption = {
  inventoryStockId: string;
  productVariantId: string;
  schoolId: string;
  schoolName: string;

  productName: string;
  displayName: string;
  variantName: string;
  category: string;

  sku: string;
  barcode: string;
  unit: string;

  className: string;
  sectionName: string;
  size: string;
  color: string;

  salePrice: number;
  stockQty: number;
  searchText: string;
};

type CartItem = {
  inventoryStockId: string;
  quantity: number;
};

type PosBillingFormProps = {
  schools: PosSchoolOption[];
  products: PosProductOption[];
  paymentModes: string[];
};

// ==============================
// Pure Helpers
// ==============================

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function compact(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function money(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(safe);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatPaymentMode(mode: string): string {
  return mode
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function productLabel(product: PosProductOption): string {
  return product.displayName || product.productName;
}

function productMeta(product: PosProductOption): string {
  return [
    product.category,
    product.sku ? `SKU: ${product.sku}` : "",
    product.barcode ? `Barcode: ${product.barcode}` : "",
    product.unit ? `Unit: ${product.unit}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function getProductScore(product: PosProductOption, keyword: string): number {
  if (!keyword) return 0;
  const normalKeyword = normalize(keyword);
  const compactKeyword = compact(keyword);
  const name = normalize(product.productName);
  const label = normalize(productLabel(product));
  const sku = compact(product.sku);
  const barcode = compact(product.barcode);
  const searchText = normalize(product.searchText);

  let score = 0;
  if (sku && sku === compactKeyword) score += 1000;
  if (barcode && barcode === compactKeyword) score += 1000;
  if (sku && sku.includes(compactKeyword)) score += 500;
  if (barcode && barcode.includes(compactKeyword)) score += 500;
  if (name.startsWith(normalKeyword)) score += 300;
  if (label.startsWith(normalKeyword)) score += 250;
  if (searchText.includes(normalKeyword)) score += 100;
  return score;
}

// ==============================
// Submit Button (with useFormStatus)
// ==============================

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="mt-5 w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 transition-colors"
    >
      {pending ? "Creating Invoice..." : "Create Invoice"}
    </button>
  );
}

// ==============================
// Main Component
// ==============================

export function PosBillingForm({
  schools,
  products,
  paymentModes,
}: PosBillingFormProps) {
  // ---------- State ----------
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");

  // Defer search updates to keep UI responsive
  const deferredSearch = useDeferredValue(search);

  // ---------- Memoized derived data ----------
  const productByStockId = useMemo(
    () => new Map(products.map((p) => [p.inventoryStockId, p])),
    [products],
  );

  const schoolProducts = useMemo(
    () => products.filter((p) => p.schoolId === schoolId),
    [products, schoolId],
  );

  const filterOptions = useMemo(
    () => ({
      categories: uniqueSorted(schoolProducts.map((p) => p.category)),
      classes: uniqueSorted(schoolProducts.map((p) => p.className)),
      sections: uniqueSorted(schoolProducts.map((p) => p.sectionName)),
    }),
    [schoolProducts],
  );

  const filteredProducts = useMemo(() => {
    const keyword = normalize(deferredSearch);
    const tokens = keyword.split(" ").filter(Boolean);

    let result = schoolProducts;

    // Apply category/class/section filters
    if (categoryFilter) {
      result = result.filter((p) => p.category === categoryFilter);
    }
    if (classFilter) {
      result = result.filter((p) => p.className === classFilter);
    }
    if (sectionFilter) {
      result = result.filter((p) => p.sectionName === sectionFilter);
    }

    // Apply search
    if (tokens.length > 0) {
      result = result.filter((product) => {
        const searchable = normalize(
          [
            product.searchText,
            product.productName,
            product.displayName,
            product.variantName,
            product.category,
            product.sku,
            product.barcode,
            product.className,
            product.sectionName,
            product.size,
            product.color,
          ]
            .filter(Boolean)
            .join(" "),
        );
        return tokens.every((token) => searchable.includes(token));
      });
    }

    // Sort by relevance
    result.sort((a, b) => {
      const scoreA = getProductScore(a, deferredSearch);
      const scoreB = getProductScore(b, deferredSearch);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return productLabel(a).localeCompare(productLabel(b));
    });

    return result.slice(0, MAX_VISIBLE_PRODUCTS);
  }, [
    schoolProducts,
    deferredSearch,
    categoryFilter,
    classFilter,
    sectionFilter,
  ]);

  const cartProductIds = useMemo(
    () => new Set(cart.map((item) => item.inventoryStockId)),
    [cart],
  );

  // ---------- Cart calculations ----------
  const subtotal = useMemo(
    () =>
      roundMoney(
        cart.reduce((total, item) => {
          const product = productByStockId.get(item.inventoryStockId);
          return total + (product ? product.salePrice * item.quantity : 0);
        }, 0),
      ),
    [cart, productByStockId],
  );

  const discountNumber = Number(discountAmount || 0);
  const discountInvalid =
    !Number.isFinite(discountNumber) ||
    discountNumber < 0 ||
    discountNumber > subtotal;
  const discount = discountInvalid ? 0 : roundMoney(discountNumber);
  const payable = Math.max(0, roundMoney(subtotal - discount));

  const paidNumber = paidAmount.trim() ? Number(paidAmount) : payable;
  const paidInvalid =
    paidAmount.trim() !== "" &&
    (!Number.isFinite(paidNumber) || paidNumber < 0 || paidNumber > payable);
  const paid = paidInvalid ? 0 : roundMoney(paidNumber);
  const balance = Math.max(0, roundMoney(payable - paid));

  const selectedSchoolName =
    schools.find((s) => s.id === schoolId)?.name ?? "Selected School";

  const submitDisabled =
    cart.length === 0 || !schoolId || discountInvalid || paidInvalid;

  // ---------- Event handlers (useCallback) ----------
  const handleSchoolChange = useCallback(
    (value: string) => {
      setSchoolId(value);
      setSearch("");
      setCategoryFilter("");
      setClassFilter("");
      setSectionFilter("");
      setCart([]);
      setDiscountAmount("0");
      setPaidAmount("");
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setCategoryFilter("");
    setClassFilter("");
    setSectionFilter("");
  }, []);

  const addItem = useCallback(
    (inventoryStockId: string, quantity = 1) => {
      const product = productByStockId.get(inventoryStockId);
      if (!product) {
        alert("Product not found. Please refresh and try again.");
        return;
      }
      const safeQuantity = Math.trunc(quantity);
      if (!Number.isInteger(safeQuantity) || safeQuantity <= 0) {
        alert("Quantity must be greater than 0.");
        return;
      }

      setCart((current) => {
        const existing = current.find(
          (item) => item.inventoryStockId === inventoryStockId,
        );
        if (!existing && current.length >= MAX_CART_ITEMS) {
          alert(
            `You can add up to ${MAX_CART_ITEMS} different products in one invoice.`,
          );
          return current;
        }
        const existingQty = existing?.quantity ?? 0;
        const nextQty = existingQty + safeQuantity;
        if (nextQty > product.stockQty) {
          alert(
            `Only ${product.stockQty} stock available for ${productLabel(product)}.`,
          );
          return current;
        }
        if (existing) {
          return current.map((item) =>
            item.inventoryStockId === inventoryStockId
              ? { ...item, quantity: nextQty }
              : item,
          );
        }
        return [...current, { inventoryStockId, quantity: safeQuantity }];
      });
    },
    [productByStockId],
  );

  const addFirstFilteredProduct = useCallback(() => {
    if (filteredProducts.length) {
      addItem(filteredProducts[0].inventoryStockId);
    }
  }, [filteredProducts, addItem]);

  const updateQuantity = useCallback(
    (inventoryStockId: string, quantity: number) => {
      const product = productByStockId.get(inventoryStockId);
      if (!product) return;
      if (!Number.isFinite(quantity)) return;
      const safeQty = Math.min(
        Math.max(Math.trunc(quantity), 1),
        product.stockQty,
      );
      setCart((current) =>
        current.map((item) =>
          item.inventoryStockId === inventoryStockId
            ? { ...item, quantity: safeQty }
            : item,
        ),
      );
    },
    [productByStockId],
  );

  const removeItem = useCallback((inventoryStockId: string) => {
    setCart((current) =>
      current.filter((item) => item.inventoryStockId !== inventoryStockId),
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // ---------- Render ----------
  return (
    <form action={createPosInvoiceAction} className="space-y-6">
      {/* Hidden cart fields */}
      {cart.map((item, index) => (
        <div key={item.inventoryStockId}>
          <input
            type="hidden"
            name={`inventoryStockId_${index}`}
            value={item.inventoryStockId}
          />
          <input
            type="hidden"
            name={`quantity_${index}`}
            value={item.quantity}
          />
        </div>
      ))}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Customer Details */}
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <header className="mb-5">
              <h2 className="text-base font-semibold text-slate-900">
                Customer Details
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Select school and enter customer details for the invoice.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="schoolId"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  School
                </label>
                <select
                  id="schoolId"
                  name="schoolId"
                  required
                  value={schoolId}
                  onChange={(e) => handleSchoolChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="customerName"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Customer Name
                </label>
                <input
                  id="customerName"
                  name="customerName"
                  type="text"
                  required
                  placeholder="Enter customer name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="customerPhone"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Phone
                </label>
                <input
                  id="customerPhone"
                  name="customerPhone"
                  type="tel"
                  placeholder="Enter phone number"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="customerClassName"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Class
                  </label>
                  <input
                    id="customerClassName"
                    name="customerClassName"
                    type="text"
                    placeholder="Class"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                  />
                </div>
                <div>
                  <label
                    htmlFor="customerSectionName"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Section
                  </label>
                  <input
                    id="customerSectionName"
                    name="customerSectionName"
                    type="text"
                    placeholder="Section"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Products */}
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Products
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Showing stock for {selectedSchoolName}. Search supports name,
                  SKU, barcode, class, section, size, colour, and category.
                </p>
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Clear Filters
              </button>
            </header>

            <div className="grid gap-3 lg:grid-cols-[1fr_160px_140px_140px]">
              <div>
                <label
                  htmlFor="productSearch"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Search Product
                </label>
                <input
                  id="productSearch"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFirstFilteredProduct();
                    }
                  }}
                  placeholder="Type product / SKU / barcode and press Enter"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                >
                  <option value="">All Categories</option>
                  {filterOptions.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Class
                </label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                >
                  <option value="">All Classes</option>
                  {filterOptions.classes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Section
                </label>
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                >
                  <option value="">All Sections</option>
                  {filterOptions.sections.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-700">
                  {filteredProducts.length} product
                  {filteredProducts.length === 1 ? "" : "s"} found
                </p>
                <p className="text-xs text-slate-500">
                  Press Enter to add the first result
                </p>
              </div>

              {schoolProducts.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    No sellable stock found for this school.
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Check product status, variant status, and inventory quantity.
                  </p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    No product matched your search or filters.
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Clear filters or try SKU/barcode/product name.
                  </p>
                </div>
              ) : (
                <div className="max-h-[460px] divide-y overflow-y-auto">
                  {filteredProducts.map((product) => {
                    const inCart = cartProductIds.has(product.inventoryStockId);
                    const cartQty =
                      cart.find(
                        (item) =>
                          item.inventoryStockId === product.inventoryStockId,
                      )?.quantity ?? 0;
                    const cannotAdd = cartQty >= product.stockQty;

                    return (
                      <div
                        key={product.inventoryStockId}
                        className="grid gap-3 px-4 py-4 hover:bg-slate-50 transition-colors md:grid-cols-[1fr_110px_90px]"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {productLabel(product)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {productMeta(product) || "No product metadata"}
                          </p>
                          {inCart && (
                            <p className="mt-1 text-xs font-medium text-emerald-700">
                              In cart: {cartQty}
                            </p>
                          )}
                        </div>
                        <div className="text-sm md:text-right">
                          <p className="font-semibold text-slate-900">
                            {money(product.salePrice)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Stock: {product.stockQty}
                          </p>
                        </div>
                        <div className="flex items-center md:justify-end">
                          <button
                            type="button"
                            onClick={() => addItem(product.inventoryStockId)}
                            disabled={cannotAdd}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 transition-colors"
                          >
                            {cannotAdd ? "Added" : "Add"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Cart */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Billing Cart
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {cart.length} item{cart.length === 1 ? "" : "s"} added.
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-900">
                  No items added yet.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Search a product above and click Add.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Item</th>
                      <th className="px-6 py-3 text-right">Rate</th>
                      <th className="px-6 py-3 text-center">Qty</th>
                      <th className="px-6 py-3 text-right">Total</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cart.map((item) => {
                      const product = productByStockId.get(
                        item.inventoryStockId,
                      );
                      if (!product) return null;
                      const lineTotal = roundMoney(
                        product.salePrice * item.quantity,
                      );
                      return (
                        <tr key={item.inventoryStockId}>
                          <td className="px-6 py-4">
                            <p className="font-medium text-slate-900">
                              {productLabel(product)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {productMeta(product)}
                              {productMeta(product) ? " · " : ""}
                              Stock: {product.stockQty}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {money(product.salePrice)}
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              min="1"
                              max={product.stockQty}
                              step="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateQuantity(
                                  item.inventoryStockId,
                                  Number(e.target.value),
                                )
                              }
                              className="mx-auto w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm outline-none focus:border-slate-900 transition-colors"
                            />
                          </td>
                          <td className="px-6 py-4 text-right font-medium">
                            {money(lineTotal)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(item.inventoryStockId)}
                              className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN – Payment & Summary */}
        <div className="space-y-6">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Payment
            </h2>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="paymentMode"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Payment Mode
                </label>
                <select
                  id="paymentMode"
                  name="paymentMode"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                >
                  {paymentModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {formatPaymentMode(mode)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="discountAmount"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Discount
                </label>
                <input
                  id="discountAmount"
                  name="discountAmount"
                  type="number"
                  min="0"
                  max={subtotal}
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                />
                {discountInvalid && (
                  <p className="mt-1 text-xs text-red-600">
                    Discount must be between 0 and {money(subtotal)}.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="paidAmount"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Paid Amount
                </label>
                <input
                  id="paidAmount"
                  name="paidAmount"
                  type="number"
                  min="0"
                  max={payable}
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="Leave blank for full payable amount"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                />
                {paidInvalid && (
                  <p className="mt-1 text-xs text-red-600">
                    Paid amount must be between 0 and {money(payable)}.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="transactionRef"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Transaction Ref
                </label>
                <input
                  id="transactionRef"
                  name="transactionRef"
                  type="text"
                  placeholder="UPI/Card/Bank reference"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Summary
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-900">
                  {money(subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Discount</span>
                <span className="font-medium text-slate-900">
                  {money(discount)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <span>Payable</span>
                <span>{money(payable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paid</span>
                <span className="font-medium text-slate-900">{money(paid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Balance</span>
                <span className="font-medium text-slate-900">
                  {money(balance)}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <label
              htmlFor="note"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Note
            </label>
            <textarea
              id="note"
              name="note"
              rows={3}
              placeholder="Optional note"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 transition-colors"
            />
            <SubmitButton disabled={submitDisabled} />
          </section>
        </div>
      </div>
    </form>
  );
}