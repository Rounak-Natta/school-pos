"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPosInvoiceAction } from "@/features/pos/actions";
import type { StudentOption } from "@/features/students/types";

export type PosSchoolOption = { id: string; name: string };
export type PosProductOption = {
  inventoryStockId: string; productVariantId: string; schoolId: string; schoolName: string;
  productName: string; displayName: string; variantName: string; category: string;
  sku: string; barcode: string; unit: string; className: string; sectionName: string; size: string; color: string;
  salePrice: number; gstRate: number; stockQty: number; searchText: string;
};
type CartItem = { inventoryStockId: string; quantity: number };

const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
const money = (v: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number.isFinite(v) ? v : 0);
const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const formatMode = (v: string) => v.split("_").map(x => x[0] + x.slice(1).toLowerCase()).join(" ");

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={disabled || pending} className="w-full rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">{pending ? "Creating invoice..." : "Create Invoice"}</button>;
}

export function PosBillingForm({ schools, products, students, paymentModes }: { schools: PosSchoolOption[]; products: PosProductOption[]; students: StudentOption[]; paymentModes: string[] }) {
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? "");
  const [productSearch, setProductSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerClass, setCustomerClass] = useState("");
  const [customerSection, setCustomerSection] = useState("");
  const [category, setCategory] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const deferredProductSearch = useDeferredValue(productSearch);
  const deferredStudentSearch = useDeferredValue(studentSearch);

  const schoolProducts = useMemo(() => products.filter(p => p.schoolId === schoolId), [products, schoolId]);
  const schoolStudents = useMemo(() => students.filter(s => s.schoolId === schoolId), [students, schoolId]);
  const byStock = useMemo(() => new Map(products.map(p => [p.inventoryStockId, p])), [products]);
  const categories = useMemo(() => Array.from(new Set(schoolProducts.map(p => p.category).filter(Boolean))).sort(), [schoolProducts]);
  const classes = useMemo(() => Array.from(new Set(schoolProducts.map(p => p.className).filter(Boolean))).sort(), [schoolProducts]);

  const productSuggestions = useMemo(() => {
    const q = normalize(deferredProductSearch);
    return schoolProducts.filter(p => (!category || p.category === category) && (!classFilter || p.className === classFilter) && (!q || normalize(p.searchText).includes(q))).sort((a,b) => {
      if (!q) return a.displayName.localeCompare(b.displayName);
      const an = normalize(a.productName), bn = normalize(b.productName);
      const as = an.startsWith(q) ? 0 : normalize(a.sku).startsWith(q) ? 1 : 2;
      const bs = bn.startsWith(q) ? 0 : normalize(b.sku).startsWith(q) ? 1 : 2;
      return as - bs || a.displayName.localeCompare(b.displayName);
    }).slice(0, 80);
  }, [schoolProducts, deferredProductSearch, category, classFilter]);

  const studentSuggestions = useMemo(() => {
    const q = normalize(deferredStudentSearch);
    if (!q) return [];
    return schoolStudents.filter(s => normalize(s.searchText).includes(q)).slice(0, 8);
  }, [schoolStudents, deferredStudentSearch]);

  const subtotal = round(cart.reduce((sum, item) => { const p = byStock.get(item.inventoryStockId); return sum + (p ? p.salePrice * item.quantity : 0); }, 0));
  const gstAmount = round(cart.reduce((sum, item) => { const p = byStock.get(item.inventoryStockId); return sum + (p ? p.salePrice * item.quantity * p.gstRate / 100 : 0); }, 0));
  const grossTotal = round(subtotal + gstAmount);
  const discountNum = Number(discount || 0);
  const discountInvalid = !Number.isFinite(discountNum) || discountNum < 0 || discountNum > grossTotal;
  const payable = round(grossTotal - (discountInvalid ? 0 : discountNum));
  const paidNum = paidAmount.trim() ? Number(paidAmount) : payable;
  const paidInvalid = paidAmount.trim() !== "" && (!Number.isFinite(paidNum) || paidNum < 0 || paidNum > payable);

  function resetForSchool(id: string) {
    setSchoolId(id); setCart([]); setProductSearch(""); setStudentSearch(""); setSelectedStudentId("");
    setCustomerName(""); setCustomerPhone(""); setCustomerClass(""); setCustomerSection(""); setCategory(""); setClassFilter(""); setDiscount("0"); setPaidAmount("");
  }
  function chooseStudent(s: StudentOption) {
    setSelectedStudentId(s.id); setStudentSearch(s.name); setCustomerName(s.name); setCustomerPhone(s.phone); setCustomerClass(s.className); setCustomerSection(s.sectionName);
  }
  function addProduct(id: string) {
    const p = byStock.get(id); if (!p) return;
    setCart(current => {
      const existing = current.find(i => i.inventoryStockId === id);
      if (existing && existing.quantity >= p.stockQty) return current;
      if (existing) return current.map(i => i.inventoryStockId === id ? { ...i, quantity: i.quantity + 1 } : i);
      if (current.length >= 50) return current;
      return [...current, { inventoryStockId: id, quantity: 1 }];
    });
  }
  function updateQty(id: string, qty: number) {
    const p = byStock.get(id); if (!p) return;
    const safe = Math.max(1, Math.min(p.stockQty, Math.trunc(qty || 1)));
    setCart(c => c.map(i => i.inventoryStockId === id ? { ...i, quantity: safe } : i));
  }

  return <form action={createPosInvoiceAction} className="space-y-6">
    {cart.map((item, i) => <span key={item.inventoryStockId}><input type="hidden" name={`inventoryStockId_${i}`} value={item.inventoryStockId}/><input type="hidden" name={`quantity_${i}`} value={item.quantity}/></span>)}
    <input type="hidden" name="studentId" value={selectedStudentId}/>
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-950">Student / Customer</h2><p className="mt-1 text-sm text-slate-500">Name, class, school and number are required. Start typing a student name, admission no., roll no. or phone to get suggestions on every character.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">School<select name="schoolId" value={schoolId} onChange={e => resetForSchool(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"><option value="">Select school</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <div className="relative"><label className="text-sm font-medium">Find existing student<input value={studentSearch} onChange={e => { setStudentSearch(e.target.value); setSelectedStudentId(""); }} placeholder="Type any character..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>{studentSuggestions.length > 0 && studentSearch && !selectedStudentId ? <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-white shadow-xl">{studentSuggestions.map(s => <button key={s.id} type="button" onClick={() => chooseStudent(s)} className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"><b>{s.name}</b><span className="block text-xs text-slate-500">{s.schoolName} · Class {s.className}{s.sectionName ? ` / ${s.sectionName}` : ""} · {s.phone}</span></button>)}</div> : null}</div>
            <label className="text-sm font-medium">Name *<input name="customerName" value={customerName} onChange={e => setCustomerName(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>
            <label className="text-sm font-medium">Contact number *<input name="customerPhone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>
            <label className="text-sm font-medium">Class *<input name="customerClassName" value={customerClass} onChange={e => setCustomerClass(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>
            <label className="text-sm font-medium">Section<input name="customerSectionName" value={customerSection} onChange={e => setCustomerSection(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-950">Products</h2><p className="mt-1 text-sm text-slate-500">Live suggestions narrow down with every character across name, SKU, barcode, class, size, colour and category.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_160px]"><input value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && productSuggestions[0]) { e.preventDefault(); addProduct(productSuggestions[0].inventoryStockId); } }} placeholder="Search product / SKU / barcode..." className="rounded-lg border border-slate-300 px-3 py-2.5"/><select value={category} onChange={e => setCategory(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5"><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select><select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5"><option value="">All classes</option>{classes.map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="mt-4 max-h-[460px] overflow-auto rounded-xl border">{productSuggestions.map(p => <div key={p.inventoryStockId} className="grid gap-2 border-b p-3 md:grid-cols-[1fr_110px_90px]"><div><p className="font-medium text-slate-900">{p.displayName}</p><p className="text-xs text-slate-500">{[p.category, p.sku && `SKU ${p.sku}`, p.barcode && `Barcode ${p.barcode}`, p.gstRate ? `GST ${p.gstRate}%` : "GST 0%"].filter(Boolean).join(" · ")}</p></div><div className="text-sm"><b>{money(p.salePrice)}</b><p className="text-xs text-slate-500">Stock {p.stockQty}</p></div><button type="button" onClick={() => addProduct(p.inventoryStockId)} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Add</button></div>)}{productSuggestions.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No matching stock.</p> : null}</div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-semibold text-slate-950">Billing Cart</h2><p className="text-sm text-slate-500">{cart.length} line item(s)</p></div>{cart.length ? <button type="button" onClick={() => setCart([])} className="text-sm font-semibold text-red-600">Clear</button> : null}</div>
          {cart.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Base rate</th><th className="px-4 py-3">GST</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Total</th><th></th></tr></thead><tbody className="divide-y">{cart.map(item => { const p = byStock.get(item.inventoryStockId)!; const base = round(p.salePrice * item.quantity); const gst = round(base * p.gstRate / 100); return <tr key={item.inventoryStockId}><td className="px-4 py-3 font-medium">{p.displayName}</td><td className="px-4 py-3">{money(p.salePrice)}</td><td className="px-4 py-3">{p.gstRate}% ({money(gst)})</td><td className="px-4 py-3"><input type="number" min={1} max={p.stockQty} value={item.quantity} onChange={e => updateQty(item.inventoryStockId, Number(e.target.value))} className="w-20 rounded-lg border px-2 py-1.5"/></td><td className="px-4 py-3 font-semibold">{money(base + gst)}</td><td className="px-4 py-3"><button type="button" onClick={() => setCart(c => c.filter(x => x.inventoryStockId !== item.inventoryStockId))} className="text-red-600">Remove</button></td></tr>; })}</tbody></table></div> : <p className="p-8 text-center text-sm text-slate-500">Add a product to begin.</p>}
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="font-semibold text-slate-950">Payment</h2><div className="mt-4 space-y-4">
          <label className="block text-sm font-medium">Mode<select name="paymentMode" className="mt-1 w-full rounded-lg border px-3 py-2.5">{paymentModes.map(m => <option key={m} value={m}>{formatMode(m)}</option>)}</select></label>
          <label className="block text-sm font-medium">Discount<input name="discountAmount" type="number" min={0} max={grossTotal} step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5"/></label>
          <label className="block text-sm font-medium">Exchange credit reference<input name="exchangeReturnNo" placeholder="RET-... (optional)" className="mt-1 w-full rounded-lg border px-3 py-2.5"/><span className="mt-1 block text-xs font-normal text-slate-500">For exchange credits, leave Paid Amount blank so the server applies the verified credit first.</span></label>
          <label className="block text-sm font-medium">Paid amount<input name="paidAmount" type="number" min={0} step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder="Blank = full amount due" className="mt-1 w-full rounded-lg border px-3 py-2.5"/></label>
          <label className="block text-sm font-medium">Transaction reference<input name="transactionRef" className="mt-1 w-full rounded-lg border px-3 py-2.5"/></label>
          <label className="block text-sm font-medium">Note<textarea name="note" rows={3} className="mt-1 w-full rounded-lg border px-3 py-2.5"/></label>
        </div></section>
        <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="font-semibold text-slate-950">Summary</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span>Taxable subtotal</span><b>{money(subtotal)}</b></div><div className="flex justify-between"><span>GST amount</span><b>{money(gstAmount)}</b></div><div className="flex justify-between"><span>Total</span><b>{money(grossTotal)}</b></div><div className="flex justify-between"><span>Discount</span><b>- {money(discountInvalid ? 0 : discountNum)}</b></div><div className="flex justify-between border-t pt-3 text-base"><span>Payable before exchange credit</span><b>{money(payable)}</b></div></div><p className="mt-3 text-xs text-slate-500">Verified exchange credit, if entered, is deducted server-side and appears on the final invoice.</p><div className="mt-5"><SubmitButton disabled={!schoolId || !customerName || !customerPhone || !customerClass || !cart.length || discountInvalid || paidInvalid}/></div></section>
      </div>
    </div>
  </form>;
}
