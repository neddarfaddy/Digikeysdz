import React, { useEffect, useMemo, useState } from "react";

/* ==============================
   CONFIG — edit these easily
   ============================== */

const CATALOG = [
  { id: "xbox-ultimate-1", title: "Xbox Game Pass Ultimate (1 Month)", platform: "Xbox",       region: "Global",   price: 3200, stock: 12, img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop" },
  { id: "psn-plus-3",      title: "PlayStation Plus Essential (3 Months)", platform: "PlayStation", region: "EU/MENA", price: 6900, stock: 9,  img: "https://images.unsplash.com/photo-1605901309584-818e25960a8b?q=80&w=1200&auto=format&fit=crop" },
  { id: "steam-wallet-20", title: "Steam Wallet Code – 20€",               platform: "Steam",     region: "EU",       price: 4200, stock: 25, img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop" },
  { id: "valorant-1250",   title: "Valorant Points – 1250",                platform: "Riot",      region: "EU/MENA",  price: 5100, stock: 15, img: "https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=1200&auto=format&fit=crop" },
  { id: "fc25-ps5",        title: "EA FC 25 (PS5 Digital)",                platform: "PlayStation", region: "EU/MENA", price: 11900, stock: 6, img: "https://images.unsplash.com/photo-1605901309584-818e25960a8b?q=80&w=1200&auto=format&fit=crop" },
  { id: "elden-ps5",       title: "ELDEN RING (PS5 Digital)",              platform: "PlayStation", region: "Global", price: 9500, stock: 4,  img: "https://images.unsplash.com/photo-1605901309584-818e25960a8b?q=80&w=1200&auto=format&fit=crop" },
  { id: "cod-bp",          title: "CoD Battle Pass (Cross-Gen)",           platform: "Multi",     region: "Global",   price: 3900, stock: 20, img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop" },
];

// Put your real details here
const FLEXY_PHONE       = "+213-55-000-0000";              // Flexy target
const BARIDIMOB_IBAN    = "DZ58 0000 0000 0000 0000 0000"; // BaridiMob IBAN/RIB
const CCP_NUMBER        = "00000000";
const CCP_NAME          = "YOUR NAME";
const SUPPORT_WHATSAPP  = "+213-55-111-2222";              // internal admin contact
const PROCESSING_TIME   = "Orders are reviewed and delivered within ~5 minutes after payment proof is received.";

/* ===================================== */

const DA = new Intl.NumberFormat("fr-DZ", { style: "currency", currency: "DZD", maximumFractionDigits: 0 });
const digitsOnly = (s = "") => String(s).replace(/\D/g, "");

function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

export default function App() {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("All");
  const [cart, setCart] = useLocalStorage("cart", {});
  const [showCart, setShowCart] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState("baridimob"); // 'baridimob' | 'ccp' | 'flexy'
  const [checkoutError, setCheckoutError] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);

  const platforms = useMemo(() => ["All", ...new Set(CATALOG.map(p => p.platform))], []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(p => (platform === "All" || p.platform === platform) && (!q || p.title.toLowerCase().includes(q)));
  }, [query, platform]);

  const items = useMemo(() => Object.entries(cart)
      .map(([id, qty]) => ({ product: CATALOG.find(p => p.id === id), qty }))
      .filter(i => i.product), [cart]);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.product.price * i.qty, 0), [items]);
  const surchargePct = payment === "flexy" ? 18 : 0;
  const total = useMemo(() => Math.round(subtotal * (1 + surchargePct / 100)), [subtotal, surchargePct]);

  function addToCart(id) {
    setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setShowCart(true);
  }
  function updateQty(id, qty) {
    setCart(prev => { const next = { ...prev }; if (qty <= 0) delete next[id]; else next[id] = qty; return next; });
  }
  function clearCart() { setCart({}); }

  async function fileToDataURL(file) {
    if (!file) return "";
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function sendOrderEmail(payload) {
    try {
      if (window.EMAIL_WEBHOOK_URL) {
        const res = await fetch(window.EMAIL_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Webhook responded non-200");
        return true;
      }
      // Fallback for now: copy JSON so you can paste into email/WhatsApp
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert("No EMAIL_WEBHOOK_URL set. Order details copied to clipboard so you can paste into email.");
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async function handleCheckout(e) {
    e.preventDefault();
    setCheckoutError("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!items.length) { setCheckoutError("Your cart is empty."); return; }
    if (!data.name || !data.email) { setCheckoutError("Name and email are required."); return; }

    const proofFile = form.querySelector('input[name="proof"]')?.files?.[0] || null;
    const proofDataURL = await fileToDataURL(proofFile);

    const newOrder = {
      id: "ORD-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      at: new Date().toISOString(),
      customer: { name: data.name, email: data.email, phone: data.phone || "" },
      items: items.map(i => ({ id: i.product.id, title: i.product.title, qty: i.qty, price: i.product.price })),
      subtotal, surchargePct, total,
      payment: { method: data.payment, delivery: data.delivery || "email", note: data.note || "" },
      proof: { filename: proofFile?.name || "", mime: proofFile?.type || "", dataURL: proofDataURL },
      status: "awaiting-verification",
    };

    const prev = JSON.parse(localStorage.getItem("orders") || "[]");
    prev.unshift(newOrder);
    localStorage.setItem("orders", JSON.stringify(prev));

    await sendOrderEmail({
      type: "new_order",
      subject: `[DigiKeys DZ] New order ${newOrder.id}`,
      to: "you@example.com", // handled by your webhook
      order: newOrder,
      processing_note: PROCESSING_TIME,
      payment_targets: {
        flexy_phone: FLEXY_PHONE,
        baridimob_iban: BARIDIMOB_IBAN,
        ccp_number: CCP_NUMBER,
        ccp_name: CCP_NAME,
      },
    });

    setOrder(newOrder);
    setCheckingOut(false);
    clearCart();
    setTimeout(() => document.getElementById("orders")?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-40 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-neutral-900" />
            <span className="font-extrabold tracking-tight text-lg">DigiKeys DZ</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              placeholder="Search games, passes, top-ups…"
              className="w-64 md:w-96 rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-800"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <select
              className="rounded-xl border px-3 py-2"
              value={platform}
              onChange={e => setPlatform(e.target.value)}
            >
              {platforms.map(p => <option key={p}>{p}</option>)}
            </select>
            <button className="relative rounded-xl border px-3 py-2 hover:bg-neutral-100" onClick={() => setShowCart(true)}>
              Cart
              {items.length > 0 && (
                <span className="absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-white px-1">
                  {items.reduce((n, i) => n + i.qty, 0)}
                </span>
              )}
            </button>
            <button className="rounded-xl border px-3 py-2 hover:bg-neutral-100" onClick={() => setShowAdmin(true)}>Admin</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8">
        <Hero onShop={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })} />

        <section id="catalog" className="mt-8">
          <h2 className="mb-3 text-xl font-bold">Featured</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map(p => (
              <Card key={p.id}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
                  <img src={p.img} alt={p.title} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
                  {p.stock < 5 && (<span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold">Low stock</span>)}
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold leading-tight">{p.title}</h3>
                    <p className="text-sm text-neutral-500">{p.platform} • {p.region}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold">{DA.format(p.price)}</div>
                    <button className="mt-2 rounded-xl bg-neutral-900 px-3 py-2 text-white hover:bg-neutral-800" onClick={() => addToCart(p.id)}>Add</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          <InfoTile title="Instant Delivery" body="Digital codes delivered to your email within minutes after payment." icon="⚡"/>
          <InfoTile title="Manual Payments" body="BaridiMob, CCP, or Flexy — your choice." icon="💳"/>
          <InfoTile title="Support" body="We speak DZ/FR/EN. WhatsApp available." icon="💬"/>
        </section>

        <section id="orders" className="mt-16">
          <h2 className="mb-3 text-xl font-bold">Recent Orders</h2>
          <OrdersList />
        </section>
      </main>

      {/* Cart Drawer */}
      {showCart && (
        <Drawer onClose={() => setShowCart(false)} title="Your Cart">
          {items.length === 0 ? (
            <p className="text-neutral-500">Your cart is empty.</p>
          ) : (
            <div className="space-y-4">
              {items.map(({ product, qty }) => (
                <div key={product.id} className="flex items-center gap-3">
                  <img src={product.img} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  <div className="flex-1">
                    <div className="font-medium leading-tight">{product.title}</div>
                    <div className="text-sm text-neutral-500">{product.platform} • {product.region}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{DA.format(product.price)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <button className="rounded-lg border px-2" onClick={() => updateQty(product.id, qty - 1)}>-</button>
                      <span className="w-6 text-center">{qty}</span>
                      <button className="rounded-lg border px-2" onClick={() => updateQty(product.id, qty + 1)}>+</button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-semibold">Subtotal</span>
                <span className="font-extrabold">{DA.format(subtotal)}</span>
              </div>
              {payment === "flexy" && (
                <div className="flex items-center justify-between text-sm text-neutral-700">
                  <span>Flexy surcharge (+18%)</span>
                  <span>+ {DA.format(Math.round(subtotal * 0.18))}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm text-neutral-500">
                <span>Estimated total</span>
                <span className="font-semibold text-neutral-800">{DA.format(total)}</span>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 rounded-xl border px-3 py-2" onClick={clearCart}>Clear</button>
                <button className="flex-1 rounded-xl bg-neutral-900 px-3 py-2 text-white" onClick={() => { setCheckingOut(true); setShowCart(false); }}>Checkout</button>
              </div>
            </div>
          )}
        </Drawer>
      )}

      {/* Checkout Modal */}
      {checkingOut && (
        <Drawer onClose={() => setCheckingOut(false)} title="Checkout">
          {checkoutError && (<div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{checkoutError}</div>)}
          <form className="space-y-4" onSubmit={handleCheckout}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block text-sm">Full name<input name="name" required className="mt-1 w-full rounded-xl border px-3 py-2"/></label>
              <label className="block text-sm">Email<input name="email" type="email" required className="mt-1 w-full rounded-xl border px-3 py-2"/></label>
              <label className="block text-sm md:col-span-2">Phone (WhatsApp)<input name="phone" className="mt-1 w-full rounded-xl border px-3 py-2"/></label>
            </div>

            <label className="block text-sm">Delivery method
              <select name="delivery" className="mt-1 w-full rounded-xl border px-3 py-2">
                <option value="email">Email (instant)</option>
                <option value="whatsapp">WhatsApp message</option>
              </select>
            </label>

            <div className="rounded-2xl border p-3">
              <div className="mb-2 text-sm font-semibold">Payment method</div>
              <select name="payment" className="w-full rounded-xl border px-3 py-2" value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option value="baridimob">BaridiMob</option>
                <option value="ccp">CCP</option>
                <option value="flexy">Flexy (DZ mobile)</option>
              </select>

              {payment === "flexy" && (
                <div className="mt-3 rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm">
                  <div className="font-semibold">Flexy to: {FLEXY_PHONE}</div>
                  <div className="mt-1">Flexy incurs <b>+18%</b> surcharge. Your total becomes <b>{DA.format(total)}</b>.</div>
                </div>
              )}
              {payment === "baridimob" && (
                <div className="mt-3 rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm">
                  <div className="font-semibold">BaridiMob IBAN</div>
                  <div className="mt-1 font-mono text-sm">{BARIDIMOB_IBAN}</div>
                </div>
              )}
              {payment === "ccp" && (
                <div className="mt-3 rounded-xl bg-green-50 border border-green-200 p-3 text-sm">
                  <div className="font-semibold">CCP Details</div>
                  <div className="mt-1 font-mono text-sm">{CCP_NUMBER} — {CCP_NAME}</div>
                </div>
              )}

              <div className="mt-3 text-xs text-neutral-600">{PROCESSING_TIME}</div>
            </div>

            <label className="block text-sm">Order note (optional)
              <textarea name="note" className="mt-1 w-full rounded-xl border px-3 py-2" rows={3} placeholder="Example: Send PSN code for EU region"/>
            </label>

            <label className="block text-sm">Upload payment proof (screenshot / PDF)
              <input name="proof" type="file" accept="image/*,application/pdf" required className="mt-1 w-full rounded-xl border px-3 py-2" />
            </label>

            <div className="rounded-2xl border p-3">
              <div className="mb-2 text-sm font-semibold">Totals</div>
              <div className="flex items-center justify-between text-sm">
                <span>Subtotal</span>
                <span>{DA.format(subtotal)}</span>
              </div>
              {payment === "flexy" && (
                <div className="flex items-center justify-between text-sm">
                  <span>Flexy surcharge (18%)</span>
                  <span>+ {DA.format(Math.round(subtotal * 0.18))}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between font-semibold">
                <span>Total</span>
                <span>{DA.format(total)}</span>
              </div>
            </div>

            <button className="w-full rounded-xl bg-neutral-900 px-3 py-3 text-white" type="submit">Submit & Send Proof</button>
          </form>
        </Drawer>
      )}

      {/* Order Confirmation Toast */}
      {order && (
        <Toast onClose={() => setOrder(null)}>
          <div className="space-y-1">
            <div className="font-semibold">Order received</div>
            <div className="text-sm text-neutral-600">Order <span className="font-mono">{order.id}</span> saved. We'll verify your proof and deliver shortly.</div>
          </div>
        </Toast>
      )}

      {/* Admin Panel */}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 grid gap-6 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-neutral-900" />
              <span className="font-bold">DigiKeys DZ</span>
            </div>
            <p className="mt-2 text-sm text-neutral-600">Digital games, top-ups, and passes. Algeria-based, global delivery.</p>
          </div>
          <div>
            <h4 className="mb-2 font-semibold">Support</h4>
            <ul className="space-y-1 text-sm text-neutral-600">
              <li>FAQ</li>
              <li>Refund Policy</li>
              <li>Terms & Privacy</li>
            </ul>
          </div>
          <div>
            <h4 className="mb-2 font-semibold">Payments</h4>
            <p className="text-sm text-neutral-600">BaridiMob • CCP • Flexy (Flexy +18%).</p>
          </div>
          <div>
            <h4 className="mb-2 font-semibold">Contact</h4>
            <p className="text-sm text-neutral-600">WhatsApp: +213 • Email: hello@digikeys.dz</p>
          </div>
        </div>
        <div className="border-t py-4 text-center text-xs text-neutral-500">© {new Date().getFullYear()} DigiKeys DZ. All rights reserved.</div>
      </footer>
    </div>
  );
}

function Hero({ onShop }) {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-700 p-6 md:p-10 text-white">
      <div className="grid items-center gap-6 md:grid-cols-2">
        <div>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">Buy digital games & top-ups — instant delivery</h1>
          <p className="mt-3 text-neutral-200">Secure checkout. DZ-friendly. PS, Xbox, Steam, Riot and more.</p>
          <div className="mt-5 flex gap-3">
            <button onClick={onShop} className="rounded-xl bg-white px-4 py-3 text-neutral-900 font-semibold">Shop now</button>
            <a href="#catalog" className="rounded-xl border border-white/30 px-4 py-3">Browse catalog</a>
          </div>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-3xl">
          <img className="absolute inset-0 h-full w-full object-cover opacity-90" src="https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=1600&auto=format&fit=crop" alt="Gaming" />
        </div>
      </div>
    </section>
  );
}

function Card({ children }) { return (<div className="rounded-3xl border bg-white p-3 shadow-sm transition hover:shadow-md">{children}</div>); }

function InfoTile({ title, body, icon }) {
  return (
    <div className="rounded-3xl border bg-white p-5">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 font-semibold">{title}</div>
      <div className="text-sm text-neutral-600">{body}</div>
    </div>
  );
}

function Drawer({ title, children, onClose }) {
  useEffect(() => { const onEsc = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onEsc); return () => window.removeEventListener("keydown", onEsc); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="ml-auto h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg border px-2 py-1">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ children, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  return (<div className="fixed bottom-4 right-4 z-50 rounded-2xl border bg-white p-4 shadow-xl">{children}</div>);
}

function OrdersList() {
  const [orders, setOrders] = useState([]);
  useEffect(() => { try { setOrders(JSON.parse(localStorage.getItem("orders") || "[]")); } catch {} }, []);
  if (!orders.length) return <p className="text-neutral-500 text-sm">No orders yet.</p>;
  return (
    <div className="grid gap-3">
      {orders.map(o => (
        <div key={o.id} className="rounded-2xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{o.id}</div>
            <div className="text-sm text-neutral-500">{new Date(o.at).toLocaleString()}</div>
          </div>
          <div className="mt-1 text-sm text-neutral-700">{o.customer.name} • {o.customer.email} {o.customer.phone ? `• ${o.customer.phone}` : ""}</div>
          <ul className="mt-2 text-sm list-disc pl-5 text-neutral-700">
            {o.items.map(i => (<li key={i.id}>{i.title} × {i.qty} — <b>{DA.format(i.price * i.qty)}</b></li>))}
          </ul>
          <div className="mt-2 grid gap-1 text-sm">
            <div>Payment: <b style={{textTransform:'capitalize'}}>{o.payment?.method}</b>{o.surchargePct ? ` (+${o.surchargePct}% surcharge)` : ""}</div>
            <div>Subtotal: {DA.format(o.subtotal)} • Total: <b>{DA.format(o.total)}</b></div>
            {o.proof?.dataURL && (
              <a href={o.proof.dataURL} download={o.proof.filename || `${o.id}-proof`} className="text-blue-600 underline">Download payment proof</a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {o.customer?.phone && (
              <a
                className="rounded-xl border px-3 py-2 text-sm"
                href={`https://wa.me/${digitsOnly(o.customer.phone)}?text=${encodeURIComponent(`Salam, this is DigiKeys DZ. We received your order ${o.id} (${DA.format(o.total)}), payment method: ${o.payment?.method}. We'll verify your proof and deliver within ~5 minutes. Merci!`)}`}
                target="_blank" rel="noreferrer"
              >WhatsApp customer</a>
            )}
            <a
              className="rounded-xl border px-3 py-2 text-sm"
              href={`https://wa.me/${digitsOnly(SUPPORT_WHATSAPP)}?text=${encodeURIComponent(`Order ${o.id} — Total ${DA.format(o.total)} — ${o.customer.name} (${o.customer.email} ${o.customer.phone ? '• '+o.customer.phone : ''}) — Payment: ${o.payment?.method}`)}`}
              target="_blank" rel="noreferrer"
            >WhatsApp (internal)</a>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminPanel({ onClose }) {
  const [orders, setOrders] = useState([]);
  useEffect(() => { try { setOrders(JSON.parse(localStorage.getItem("orders") || "[]")); } catch {} }, []);

  function save(updated) {
    setOrders(updated);
    try { localStorage.setItem("orders", JSON.stringify(updated)); } catch {}
  }
  function setStatus(id, status) {
    const next = orders.map(o => o.id === id ? { ...o, status } : o);
    save(next);
  }
  function removeOrder(id) {
    const next = orders.filter(o => o.id !== id);
    save(next);
  }

  return (
    <Drawer title="Admin — Orders" onClose={onClose}>
      {!orders.length ? (
        <p className="text-sm text-neutral-600">No orders yet.</p>
      ) : (
        <div className="grid gap-3">
          {orders.map(o => (
            <div key={o.id} className="rounded-2xl border bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{o.id}</div>
                <div className="text-xs text-neutral-500">{new Date(o.at).toLocaleString()}</div>
              </div>
              <div className="mt-1 text-sm text-neutral-700">{o.customer.name} • {o.customer.email} {o.customer.phone ? `• ${o.customer.phone}` : ""}</div>
              <div className="mt-2 text-sm">Total: <b>{DA.format(o.total)}</b> • Payment: <b style={{textTransform:'capitalize'}}>{o.payment?.method}</b></div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <label className="flex items-center gap-2">Status
                  <select value={o.status || "awaiting-verification"} onChange={(e) => setStatus(o.id, e.target.value)} className="rounded-lg border px-2 py-1">
                    <option value="awaiting-verification">Awaiting verification</option>
                    <option value="verified">Verified</option>
                    <option value="fulfilled">Fulfilled</option>
                  </select>
                </label>
                {o.proof?.dataURL && (
                  <a href={o.proof.dataURL} download={o.proof.filename || `${o.id}-proof`} className="rounded-lg border px-2 py-1">Download proof</a>
                )}
                <button className="rounded-lg border px-2 py-1" onClick={() => removeOrder(o.id)}>Delete</button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {o.customer?.phone && (
                  <a
                    className="rounded-xl border px-3 py-2 text-sm"
                    href={`https://wa.me/${digitsOnly(o.customer.phone)}?text=${encodeURIComponent(`Salam ${o.customer.name}, your order ${o.id} is now ${o.status || 'awaiting-verification'}. Total ${DA.format(o.total)}. We'll follow up shortly.`)}`}
                    target="_blank" rel="noreferrer"
                  >Notify customer</a>
                )}
                <a
                  className="rounded-xl border px-3 py-2 text-sm"
                  href={`https://wa.me/${digitsOnly(SUPPORT_WHATSAPP)}?text=${encodeURIComponent(`Admin note: ${o.id} set to ${o.status}. Customer: ${o.customer.name} (${o.customer.email} ${o.customer.phone ? '• '+o.customer.phone : ''})`)}`}
                  target="_blank" rel="noreferrer"
                >Notify internal</a>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border bg-neutral-50 p-3 text-xs text-neutral-700">
        <div className="font-semibold mb-1">Email webhook (serverless) — templates</div>
        <p>Deploy a tiny function and set <code>window.EMAIL_WEBHOOK_URL</code> to its URL. Examples below:</p>
        <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-snug">{`// Netlify: netlify/functions/email-webhook.js
exports.handler = async (event) => {
  const payload = JSON.parse(event.body || '{}');
  // TODO: send email via your provider (Resend, Mailgun, SendGrid, SMTP)
  // Example with Resend (pseudo):
  // await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ from: 'DigiKeys <noreply@digikeys.dz>', to: ['you@example.com'], subject: payload.subject, html: '<pre>'+JSON.stringify(payload, null, 2)+'</pre>' })
  // });
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

// Cloudflare Workers: src/worker.js
export default {
  async fetch(request, env) {
    const payload = await request.json();
    // Send email using your provider API here...
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
};`}</pre>
      </div>
    </Drawer>
  );
}