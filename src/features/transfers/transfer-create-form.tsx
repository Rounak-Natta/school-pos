"use client";

import { useMemo, useState } from "react";
import { createTransferAction } from "@/features/transfers/actions";

type School = { id: string; name: string };
type Stock = {
  schoolId: string;
  productVariantId: string;
  label: string;
  quantity: number;
};

export function TransferCreateForm({
  sourceSchools,
  destinationSchools,
  stocks,
}: {
  sourceSchools: School[];
  destinationSchools: School[];
  stocks: Stock[];
}) {
  const [fromSchoolId, setFromSchoolId] = useState(sourceSchools[0]?.id ?? "");
  const [rows, setRows] = useState([{ variantId: "", qty: 1 }]);
  const available = useMemo(
    () => stocks.filter((stock) => stock.schoolId === fromSchoolId && stock.quantity > 0),
    [stocks, fromSchoolId],
  );

  return (
    <form action={createTransferAction} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          From school
          <select
            name="fromSchoolId"
            value={fromSchoolId}
            onChange={(event) => {
              setFromSchoolId(event.target.value);
              setRows([{ variantId: "", qty: 1 }]);
            }}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Select</option>
            {sourceSchools.map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          To school
          <select name="toSchoolId" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Select</option>
            {destinationSchools
              .filter((school) => school.id !== fromSchoolId)
              .map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-950">Transfer items</h2>
          <button
            type="button"
            onClick={() => setRows((current) => [...current, { variantId: "", qty: 1 }])}
            className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
          >
            Add row
          </button>
        </div>

        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-[1fr_120px_90px]">
            <select
              name={`productVariantId_${index}`}
              value={row.variantId}
              onChange={(event) =>
                setRows((current) => current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, variantId: event.target.value } : item,
                ))
              }
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select product</option>
              {available.map((stock) => (
                <option key={stock.productVariantId} value={stock.productVariantId}>
                  {stock.label} — stock {stock.quantity}
                </option>
              ))}
            </select>
            <input
              name={`quantity_${index}`}
              type="number"
              min={1}
              value={row.qty}
              onChange={(event) =>
                setRows((current) => current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, qty: Number(event.target.value) } : item,
                ))
              }
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <textarea name="note" rows={3} placeholder="Transfer note (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Request Transfer</button>
    </form>
  );
}
