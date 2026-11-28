"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Package, UserRound, MapPin, Heart,
  ShieldCheck, LogOut, ChevronRight, Plus
} from "lucide-react";
import "./customer-auth.css";
import CustomerMobileLink from "@/components/customer-mobile-link";

type Item = {
  id: string;
  productName: string;
  productImage: string | null;
  quantity: number;
  totalPrice: string;
};

type Data = {
  profile: {
    name: string;
    email: string;
    phone: string | null;
    normalizedPhone?: string | null;
    mobileVerifiedAt?: string | null;
  };
  addresses: {
    id: string;
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    isDefault: boolean;
  }[];
  orders: {
    id: string;
    orderNumber: string;
    totalAmount: string;
    orderStatus: string;
    paymentStatus: string;
    createdAt: string;
    items: Item[];
  }[];
};

type Tab = "orders" | "profile" | "addresses" | "security";

const tabs = [
  { id: "orders", label: "My Orders", icon: Package },
  { id: "profile", label: "My Profile", icon: UserRound },
  { id: "addresses", label: "Addresses", icon: MapPin },
  { id: "security", label: "Security", icon: ShieldCheck }
] as const;

const money = (value: string) =>
  Number(value).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR"
  });

function OrderPhoto({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);

  return <div className="skca-photo">
    {item.productImage && !failed
      ? <img src={item.productImage}
          alt={item.productName}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)} />
      : <Package size={28} strokeWidth={1.3} />}
  </div>;
}

export default function AccountDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("orders");
  const [showAddress, setShowAddress] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/customer/account", {
      cache: "no-store"
    });

    if (r.status === 401) {
      router.push("/login?returnTo=%2Faccount");
      return;
    }

    if (!r.ok) throw new Error("Unable to load your account.");
    setData(await r.json());
  }

  useEffect(() => {
    let alive = true;

    fetch("/api/customer/account", { cache: "no-store" })
      .then(async r => {
        if (r.status === 401) {
          router.push("/login?returnTo=%2Faccount");
          return null;
        }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(d => { if (alive && d) setData(d); })
      .catch(() => {
        if (alive) setError("Unable to load your account.");
      });

    return () => { alive = false; };
  }, [router]);

  async function action(
    url: string,
    method: string,
    body: Record<string, FormDataEntryValue> | undefined,
    success: string
  ) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const r = await fetch(url, {
        method,
        ...(body ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        } : {})
      });

      if (!r.ok) {
        const result = await r.json().catch(() => ({}));
        throw new Error(result.error || "Please try again.");
      }

      await load();
      setMessage(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    await action(
      "/api/customer/account",
      "PATCH",
      Object.fromEntries(new FormData(e.currentTarget)),
      "Profile saved."
    );
  }

  async function addAddress(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const saved = await action(
      "/api/customer/account",
      "POST",
      Object.fromEntries(new FormData(e.currentTarget)),
      "Address saved."
    );

    if (saved) setShowAddress(false);
  }

  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/customer/logout", {
        method: "POST"
      });
      if (!r.ok) throw new Error();
      window.location.replace("/");
    } catch {
      setError("Unable to sign out. Please try again.");
      setBusy(false);
    }
  }

  if (!data) return (
    <main className="skauth-page skauth-account-page skca-page">
      <p role="status">{error || "Loading your account..."}</p>
    </main>
  );

  return (
    <main className="skauth-page skauth-account-page skca-page">
      <div className="skca-container">

        <header className="skca-welcome">
          <div className="skca-avatar">
            <UserRound size={27} strokeWidth={1.5}/>
          </div>
          <div className="skca-welcome-copy">
            <span>YOUR PERSONAL SPACE</span>
            <h1>My Account</h1>
            <p>Welcome, {data.profile.name}</p>
          </div>
          <button type="button"
            className="skauth-account-button is-secondary skca-logout"
            disabled={busy} onClick={logout}>
            <LogOut size={17}/> Log out
          </button>
        </header>

        <div className="skca-layout">
          <nav className="skca-sidebar" aria-label="Account navigation">
            {tabs.map(({id, label, icon: Icon}) => (
              <button key={id} type="button"
                aria-pressed={tab === id}
                className={tab === id ? "is-active" : ""}
                onClick={() => {
                  setTab(id);
                  setMessage("");
                  setError("");
                }}>
                <Icon size={21} strokeWidth={1.6}/>
                <span>{label}</span>
                <ChevronRight className="skca-nav-arrow" size={15}/>
              </button>
            ))}
            <Link href="/wishlist">
              <Heart size={21} strokeWidth={1.6}/>
              <span>Wishlist</span>
              <ChevronRight className="skca-nav-arrow" size={15}/>
            </Link>
          </nav>

          <div className="skca-content">

            {error && <p role="alert"
              className="skauth-account-alert is-error">{error}</p>}

            {message && <p role="status"
              className="skauth-account-alert is-success">{message}</p>}

            {tab === "orders" && <>
              <div className="skca-section-heading">
                <h2>My Orders</h2>
                <p>View and manage your purchases.</p>
              </div>

              {data.orders.length ? data.orders.map(order => (
                <article className="skca-order" key={order.id}>
                  <div className="skca-order-head">
                    <div>
                      <strong>{order.orderNumber}</strong>
                      <p>{new Date(order.createdAt)
                        .toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric"
                        })}</p>
                    </div>
                    <span className="skca-status">
                      {order.orderStatus.replaceAll("_", " ")}
                    </span>
                  </div>

                  {order.items.map(item => (
                    <div className="skca-order-product" key={item.id}>
                      <OrderPhoto item={item}/>
                      <div className="skca-product-info">
                        <h3>{item.productName}</h3>
                        <p>Quantity: {item.quantity}</p>
                        <strong>{money(item.totalPrice)}</strong>
                      </div>
                    </div>
                  ))}

                  <div className="skca-order-bottom">
                    <div>
                      <p>Payment: {order.paymentStatus}</p>
                      <strong>Total: {money(order.totalAmount)}</strong>
                    </div>
                    <Link className="skca-order-link"
                      href={`/account/orders/${order.id}`}>
                      View details <ChevronRight size={16}/>
                    </Link>
                  </div>
                </article>
              )) : <div className="skca-panel skca-empty">
                <Package size={42} strokeWidth={1.2}/>
                <h3>No orders yet</h3>
                <p>Discover our handcrafted collections.</p>
                <Link href="/shop">Explore collections</Link>
              </div>}
            </>}

            {tab === "profile" && <>
              <div className="skca-section-heading">
                <h2>Personal Information</h2>
                <p>Manage your profile details.</p>
              </div>
              <section className="skca-panel">
                <form className="skauth-form" onSubmit={saveProfile}>
                  <label>Full name
                    <input name="name" defaultValue={data.profile.name}
                      required minLength={2} maxLength={120}/>
                  </label>
                  <label>Email address
                    <input value={data.profile.email} readOnly/>
                  </label>
                  <label>Phone number
                    <input name="phone" type="tel"
                      defaultValue={data.profile.phone || ""}
                      maxLength={24} readOnly={Boolean(data.profile.mobileVerifiedAt)} />
                  </label>
                  <button className="skauth-account-button"
                    disabled={busy}>Save profile</button>
                </form>
                <CustomerMobileLink phone={data.profile.phone} verified={Boolean(data.profile.mobileVerifiedAt)} refresh={load} />
              </section>
            </>}

            {tab === "addresses" && <>
              <div className="skca-section-heading">
                <h2>Saved Addresses</h2>
                <p>Manage your delivery locations.</p>
              </div>

              {data.addresses.map(a => (
                <article className="skca-panel" key={a.id}>
                  <strong>{a.name}{a.isDefault ? " · Default" : ""}</strong>
                  <p>{a.address}, {a.city}, {a.state} {a.pincode}</p>
                  <p>{a.phone}</p>
                  <button type="button" disabled={busy}
                    className="skauth-account-button is-secondary"
                    onClick={() => {
                      if (window.confirm("Remove this saved address?"))
                        void action(
                          `/api/customer/account/addresses/${a.id}`,
                          "DELETE", undefined, "Address removed."
                        );
                    }}>Remove</button>
                </article>
              ))}

              <button type="button"
                className="skauth-account-button skca-add"
                aria-expanded={showAddress}
                onClick={() => setShowAddress(v => !v)}>
                <Plus size={18}/>
                {showAddress ? "Close form" : "Add new address"}
              </button>

              {showAddress && <section className="skca-panel">
                <form className="skauth-form" onSubmit={addAddress}>
                  {[
                    ["name","Full name"],
                    ["phone","Phone"],
                    ["address","Street address"],
                    ["landmark","Landmark (optional)"],
                    ["city","City"],
                    ["state","State"],
                    ["pincode","PIN code"]
                  ].map(([key,label]) => (
                    <label key={key}>{label}
                      <input name={key}
                        required={key !== "landmark"}
                        inputMode={key === "pincode" ? "numeric" : key === "phone" ? "tel" : "text"}
                        pattern={key === "pincode" ? "[0-9]{6}" : undefined}
                      />
                    </label>
                  ))}
                  <button className="skauth-account-button"
                    disabled={busy}>Save address</button>
                </form>
              </section>}
            </>}

            {tab === "security" && <>
              <div className="skca-section-heading">
                <h2>Account Security</h2>
                <p>Keep your account protected.</p>
              </div>
              <section className="skca-panel">
                <ShieldCheck size={28}/>
                <h3>Password</h3>
                <p>Manage your account password.</p>
                <Link className="skca-order-link"
                  href="/account/change-password">
                  Change password <ChevronRight size={16}/>
                </Link>
              </section>
            </>}

          </div>
        </div>
      </div>
    </main>
  );
}
