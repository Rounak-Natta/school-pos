"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createPosInvoiceAction,
  searchPosProductsAction,
} from "@/features/pos/actions";

type PosSchool = {
  id: string;
  name: string;
};

type SearchResult = {
  inventoryStockId: string;
  productVariantId: string;
  code: string;
  barcode: string;
  productName: string;
  category: string;
  size: string;
  color: string;
  unit: string;
  salePrice: number;
  stockQty: number;
};

type CartItem = SearchResult & {
  quantity: number;
};

type PosBillingFormProps = {
  schools: PosSchool[];
  canSelectSchool: boolean;
  defaultSchoolId: string;
};

function money(value: number): string {
  return value.toFixed(2);
}

export function PosBillingForm({
  schools,
  canSelectSchool,
  defaultSchoolId,
}: PosBillingFormProps) {
  const [selectedSchoolId, setSelectedSchoolId] = useState(defaultSchoolId);
  const [code, setCode] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const subtotal = useMemo(() => {
    return cart.reduce(
      (total, item) => total + item.salePrice * item.quantity,
      0
    );
  }, [cart]);

  const payable = Math.max(subtotal - discountAmount, 0);

  function changeSchool(schoolId: string) {
    setSelectedSchoolId(schoolId);
    setCode("");
    setResults([]);
    setCart([]);
    setDiscountAmount(0);
    setMessage("");
  }

  function searchProduct() {
    setMessage("");

    if (!selectedSchoolId) {
      setMessage("Select school first.");
      return;
    }

    if (!code.trim()) {
      setMessage("Enter product shortcode/code.");
      return;
    }

    startTransition(() => {
      void searchPosProductsAction({
        schoolId: selectedSchoolId,
        code,
      })
        .then((data) => {
          setResults(data);

          if (data.length === 0) {
            setMessage("No product found for this code.");
          }
        })
        .catch((error) => {
          setResults([]);
          setMessage(error instanceof Error ? error.message : "Search failed.");
        });
    });
  }

  function addToCart(product: SearchResult) {
    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item.inventoryStockId === product.inventoryStockId
      );

      if (existing) {
        return currentCart.map((item) => {
          if (item.inventoryStockId !== product.inventoryStockId) return item;

          return {
            ...item,
            quantity: Math.min(item.quantity + 1, item.stockQty),
          };
        });
      }

      return [
        ...currentCart,
        {
          ...product,
          quantity: 1,
        },
      ];
    });

    setCode("");
    setResults([]);
    setMessage("");
  }

  function updateQuantity(inventoryStockId: string, quantity: number) {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.inventoryStockId !== inventoryStockId) return item;

        return {
          ...item,
          quantity: Math.max(1, Math.min(quantity, item.stockQty)),
        };
      })
    );
  }

  function removeItem(inventoryStockId: string) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.inventoryStockId !== inventoryStockId)
    );
  }

  return (
    <form
      action={createPosInvoiceAction}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="schoolId" value={selectedSchoolId} />

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

      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">School</label>

          {canSelectSchool ? (
            <select
              value={selectedSchoolId}
              onChange={(event) => changeSchool(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="">Select school</option>

              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={schools[0]?.name || "School"}
              disabled
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">
            Payment Mode
          </label>

          <select
            name="paymentMode"
            defaultValue="CASH"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">
            Discount Amount
          </label>

          <input
            name="discountAmount"
            type="number"
            step="0.01"
            min="0"
            value={discountAmount}
            onChange={(event) =>
              setDiscountAmount(Number(event.target.value) || 0)
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="text-sm font-medium text-slate-700">
          Product Code / Shortcode
        </label>

        <div className="mt-2 flex flex-col gap-3 md:flex-row">
          <input
            value={code}
            disabled={!selectedSchoolId}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchProduct();
              }
            }}
            placeholder="Enter code: HS24, TSR24, BT85"
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold uppercase outline-none focus:border-slate-900 disabled:bg-slate-100"
          />

          <button
            type="button"
            disabled={!selectedSchoolId || isPending}
            onClick={searchProduct}
            className="rounded-md bg-slate-950 px-5 py-2 text-sm font-medium text-white disabled:bg-slate-400"
          >
            {isPending ? "Searching..." : "Search"}
          </button>
        </div>

        {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}

        {results.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Color</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Rate</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>

              <tbody>
                {results.map((product) => (
                  <tr
                    key={product.inventoryStockId}
                    className="border-t border-slate-200"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {product.code}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-950">
                        {product.productName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {product.category || "No category"}
                      </div>
                    </td>

                    <td className="px-4 py-3">{product.size || "-"}</td>
                    <td className="px-4 py-3">{product.color || "-"}</td>
                    <td className="px-4 py-3">{product.stockQty}</td>
                    <td className="px-4 py-3">₹{money(product.salePrice)}</td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        className="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white"
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-950">
          Billing Items
        </h2>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Rate</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Remove</th>
              </tr>
            </thead>

            <tbody>
              {cart.map((item) => (
                <tr
                  key={item.inventoryStockId}
                  className="border-t border-slate-200"
                >
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {item.code}
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-950">
                      {item.productName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.size ? `Size ${item.size}` : ""}
                      {item.color ? ` / ${item.color}` : ""}
                    </div>
                  </td>

                  <td className="px-4 py-3">₹{money(item.salePrice)}</td>

                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="1"
                      max={item.stockQty}
                      value={item.quantity}
                      onChange={(event) =>
                        updateQuantity(
                          item.inventoryStockId,
                          Number(event.target.value) || 1
                        )
                      }
                      className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                    />
                    <div className="mt-1 text-xs text-slate-400">
                      Stock: {item.stockQty}
                    </div>
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-950">
                    ₹{money(item.salePrice * item.quantity)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeItem(item.inventoryStockId)}
                      className="rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}

              {cart.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    Search product code and add items to bill.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-[1fr_340px]">
        <div>
          <label className="text-sm font-medium text-slate-700">Note</label>

          <textarea
            name="note"
            rows={4}
            placeholder="Optional invoice note"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex justify-between py-2 text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold text-slate-950">
              ₹{money(subtotal)}
            </span>
          </div>

          <div className="flex justify-between py-2 text-sm">
            <span className="text-slate-500">Discount</span>
            <span className="font-semibold text-slate-950">
              ₹{money(discountAmount)}
            </span>
          </div>

          <div className="mt-2 flex justify-between border-t border-slate-300 py-3 text-lg">
            <span className="font-semibold text-slate-950">Payable</span>
            <span className="font-bold text-slate-950">₹{money(payable)}</span>
          </div>

          <button
            type="submit"
            disabled={!selectedSchoolId || cart.length === 0}
            className="mt-4 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-400"
          >
            Create Invoice
          </button>
        </div>
      </section>
    </form>
  );
}