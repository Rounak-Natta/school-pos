"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { createPosInvoiceAction } from "@/features/pos/actions";

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

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function compact(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function money(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(safeValue);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatPaymentMode(mode: string) {
  return mode
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );
}

function productLabel(product: PosProductOption) {
  return product.displayName || product.productName;
}

function productMeta(product: PosProductOption) {
  return [
    product.category,
    product.sku ? `SKU: ${product.sku}` : "",
    product.barcode ? `Barcode: ${product.barcode}` : "",
    product.unit ? `Unit: ${product.unit}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function getProductScore(product: PosProductOption, keyword: string) {
  if (!keyword) {
    return 0;
  }

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

function SubmitButton({
  disabled,
}: {
  disabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="mt-5 w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {pending ? "Creating Invoice..." : "Create Invoice"}
    </button>
  );
}

export function PosBillingForm({
  schools,
  products,
  paymentModes,
}: PosBillingFormProps) {
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");

  const productByStockId = useMemo(() => {
    return new Map(products.map((product) => [product.inventoryStockId, product]));
  }, [products]);

  const schoolProducts = useMemo(() => {
    return products.filter((product) => product.schoolId === schoolId);
  }, [products, schoolId]);

  const filterOptions = useMemo(() => {
    return {
      categories: uniqueSorted(schoolProducts.map((product) => product.category)),
      classes: uniqueSorted(schoolProducts.map((product) => product.className)),
      sections: uniqueSorted(schoolProducts.map((product) => product.sectionName)),
    };
  }, [schoolProducts]);

  const filteredProducts = useMemo(() => {
    const keyword = normalize(search);
    const tokens = keyword.split(" ").filter(Boolean);

    return schoolProducts
      .filter((product) => {
        if (categoryFilter && product.category !== categoryFilter) {
          return false;
        }

        if (classFilter && product.className !== classFilter) {
          return false;
        }

        if (sectionFilter && product.sectionName !== sectionFilter) {
          return false;
        }

        if (tokens.length === 0) {
          return true;
        }

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
      })
      .sort((a, b) => {
        const scoreDifference =
          getProductScore(b, search) - getProductScore(a, search);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return productLabel(a).localeCompare(productLabel(b));
      })
      .slice(0, MAX_VISIBLE_PRODUCTS);
  }, [
    schoolProducts,
    search,
    categoryFilter,
    classFilter,
    sectionFilter,
  ]);

  const cartProductIds = useMemo(() => {
    return new Set(cart.map((item) => item.inventoryStockId));
  }, [cart]);

  const subtotal = roundMoney(
    cart.reduce((total, item) => {
      const product = productByStockId.get(item.inventoryStockId);

      if (!product) {
        return total;
      }

      return total + product.salePrice * item.quantity;
    }, 0),
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
    schools.find((school) => school.id === schoolId)?.name ?? "Selected School";

  function handleSchoolChange(value: string) {
    setSchoolId(value);
    setSearch("");
    setCategoryFilter("");
    setClassFilter("");
    setSectionFilter("");
    setCart([]);
    setDiscountAmount("0");
    setPaidAmount("");
  }

  function clearFilters() {
    setSearch("");
    setCategoryFilter("");
    setClassFilter("");
    setSectionFilter("");
  }

  function addItem(inventoryStockId: string, quantity = 1) {
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

    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (item) => item.inventoryStockId === inventoryStockId,
      );

      if (!existingItem && currentCart.length >= MAX_CART_ITEMS) {
        alert(`You can add up to ${MAX_CART_ITEMS} different products in one invoice.`);
        return currentCart;
      }

      const existingQuantity = existingItem?.quantity ?? 0;
      const nextQuantity = existingQuantity + safeQuantity;

      if (nextQuantity > product.stockQty) {
        alert(`Only ${product.stockQty} stock available for ${productLabel(product)}.`);
        return currentCart;
      }

      if (existingItem) {
        return currentCart.map((item) =>
          item.inventoryStockId === inventoryStockId
            ? {
                ...item,
                quantity: nextQuantity,
              }
            : item,
        );
      }

      return [
        ...currentCart,
        {
          inventoryStockId,
          quantity: safeQuantity,
        },
      ];
    });
  }

  function addFirstFilteredProduct() {
    if (filteredProducts.length === 0) {
      return;
    }

    addItem(filteredProducts[0].inventoryStockId);
  }

  function updateQuantity(inventoryStockId: string, quantity: number) {
    const product = productByStockId.get(inventoryStockId);

    if (!product) {
      return;
    }

    if (!Number.isFinite(quantity)) {
      return;
    }

    const safeQuantity = Math.min(
      Math.max(Math.trunc(quantity), 1),
      product.stockQty,
    );

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.inventoryStockId === inventoryStockId
          ? {
              ...item,
              quantity: safeQuantity,
            }
          : item,
      ),
    );
  }

  function removeItem(inventoryStockId: string) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.inventoryStockId !== inventoryStockId),
    );
  }

  const submitDisabled =
    cart.length === 0 || !schoolId || discountInvalid || paidInvalid;

  return (
    <form action={createPosInvoiceAction} className="space-y-6">
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
        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-900">
                Customer Details
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Select school and enter customer details for the invoice.
              </p>
            </div>

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
                  onChange={(event) => handleSchoolChange(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                >
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear Filters
              </button>
            </div>

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
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addFirstFilteredProduct();
                    }
                  }}
                  placeholder="Type product / SKU / barcode and press Enter"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Category
                </label>

                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                >
                  <option value="">All Categories</option>
                  {filterOptions.categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
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
                  onChange={(event) => setClassFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                >
                  <option value="">All Classes</option>
                  {filterOptions.classes.map((className) => (
                    <option key={className} value={className}>
                      {className}
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
                  onChange={(event) => setSectionFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                >
                  <option value="">All Sections</option>
                  {filterOptions.sections.map((sectionName) => (
                    <option key={sectionName} value={sectionName}>
                      {sectionName}
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
                        className="grid gap-3 px-4 py-4 hover:bg-slate-50 md:grid-cols-[1fr_110px_90px]"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {productLabel(product)}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {productMeta(product) || "No product metadata"}
                          </p>

                          {inCart ? (
                            <p className="mt-1 text-xs font-medium text-emerald-700">
                              In cart: {cartQty}
                            </p>
                          ) : null}
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
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
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
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Billing Cart
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {cart.length} item{cart.length === 1 ? "" : "s"} added.
                </p>
              </div>

              {cart.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  Clear Cart
                </button>
              ) : null}
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
                      const product = productByStockId.get(item.inventoryStockId);

                      if (!product) {
                        return null;
                      }

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
                              onChange={(event) =>
                                updateQuantity(
                                  item.inventoryStockId,
                                  Number(event.target.value),
                                )
                              }
                              className="mx-auto w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm outline-none focus:border-slate-900"
                            />
                          </td>

                          <td className="px-6 py-4 text-right font-medium">
                            {money(lineTotal)}
                          </td>

                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(item.inventoryStockId)}
                              className="text-sm font-medium text-red-600 hover:text-red-700"
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
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
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
                  onChange={(event) => setDiscountAmount(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                />

                {discountInvalid ? (
                  <p className="mt-1 text-xs text-red-600">
                    Discount must be between 0 and {money(subtotal)}.
                  </p>
                ) : null}
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
                  onChange={(event) => setPaidAmount(event.target.value)}
                  placeholder="Leave blank for full payable amount"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                />

                {paidInvalid ? (
                  <p className="mt-1 text-xs text-red-600">
                    Paid amount must be between 0 and {money(payable)}.
                  </p>
                ) : null}
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
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
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
            />

            <SubmitButton disabled={submitDisabled} />
          </div>
        </div>
      </div>
    </form>
  );
}