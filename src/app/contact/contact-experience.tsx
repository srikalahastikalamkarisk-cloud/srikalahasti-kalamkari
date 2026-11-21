// STEP 283I — PREMIUM CONTACT EXPERIENCE
"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowUpRight, Clock3, Mail, MapPin,
  MessageCircle, Phone, Send, CheckCircle2
} from "lucide-react";
import type { PublicStoreSettings } from "@/lib/public-store-settings";

type Props = {
  settings: PublicStoreSettings | null;
};

function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21"
      aria-hidden="true" fill="none">
      <defs>
        <linearGradient id="skContactInstagramGradient" x1="0" y1="1" x2="1" y2="0">
          <stop stopColor="#FEDA75"/>
          <stop offset=".35" stopColor="#FA7E1E"/>
          <stop offset=".65" stopColor="#D62976"/>
          <stop offset="1" stopColor="#4F5BD5"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20"
        rx="6" fill="url(#skContactInstagramGradient)"/>
      <circle cx="12" cy="12" r="4"
        stroke="white" strokeWidth="2"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
    </svg>
  );
}

function YouTubeMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22"
      aria-hidden="true" fill="none">
      <rect x="1" y="4" width="22" height="16"
        rx="5" fill="#FF0033"/>
      <path d="m10 8 7 4-7 4z" fill="white"/>
    </svg>
  );
}

const defaults = {
  email: "srikalahastikalamkari.sk@gmail.com",
  phone: "+91 72888 48881",
  whatsapp: "917288848881",
  instagram: "https://www.instagram.com/srikalahasti_kalamkari_offical/",
};

const stores = [
  {
    name: "Srikalahasti",
    type: "Store & Workshop",
    address: "# 17-68, Bharathi Nagar, Tirupati Main Road, Near Railway Station, Srikalahasti-517640",
    phones: [
      "+91 72888 48881",
      "+91 72888 48882",
      "+91 72888 48883"
    ],
  },
  {
    name: "Tirupati",
    type: "Store",
    address: "# 6-8-1126, NGOs Colony, Opp: Balaji Silk Emporium, Revenue Ward No 6, Tirupati",
    phones: [
      "+91 70364 81999",
      "+91 70364 82999",
      "+91 70364 83999"
    ],
  },
];

const tel = (value: string) =>
  `tel:${value.replace(/[^+\\d]/g, "")}`;

const directions = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ", Andhra Pradesh, India")}`;

export default function ContactExperience({ settings }: Props) {
  const [prepared, setPrepared] = useState(false);

  const email = settings?.contactEmail || defaults.email;
  const phone = settings?.contactPhone || defaults.phone;
  const whatsapp = (settings?.whatsappNumber || defaults.whatsapp)
    .replace(/\\D/g, "");
  const instagram = settings?.instagramUrl || defaults.instagram;
  const youtube = settings?.youtubeUrl || "";
  const address = settings?.address || stores[0].address;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const reply = String(data.get("email") || "").trim();
    const subject = String(data.get("subject") || "General enquiry").trim();
    const message = String(data.get("message") || "").trim();

    if (!name || !reply || !message) return;

    const body = [
      `Name: ${name}`,
      `Email: ${reply}`,
      `Phone: ${String(data.get("phone") || "")}`,
      "",
      message
    ].join("\\n");

    window.location.href =
      `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    setPrepared(true);
  }

  return (
    <div className="sk-final-contact">
      <section className="sk-final-hero">
        <div className="sk-final-wrap sk-final-hero-inner">
          <div className="sk-final-hero-copy">
            <span className="sk-final-eyebrow">THE ART OF SRIKALAHASTI</span>
            <h1>Let's Start a <em>Conversation.</em></h1>
            <p>
              Every handcrafted creation begins with a connection.
              Reach out for orders, custom designs or store visits.
            </p>
            <div className="sk-final-actions">
              <a href={`https://wa.me/${whatsapp}`}
                target="_blank" rel="noopener noreferrer">
                <MessageCircle size={18}/> WhatsApp Us
              </a>
              <a href={tel(phone)}>
                <Phone size={18}/> Call Our Team
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="sk-final-stores">
        <div className="sk-final-wrap">
          <div className="sk-final-heading">
            <span className="sk-final-eyebrow">VISIT · CONNECT · DISCOVER</span>
            <h2>Visit Our <em>Stores.</em></h2>
            <p>Discover authentic Kalamkari craftsmanship in person.</p>
          </div>

          <div className="sk-final-store-grid">
            {stores.map((store, index) => {
              const storeAddress = index === 0 ? address : store.address;
              const numbers = index === 0 && settings?.contactPhone
                ? [phone, ...store.phones.filter(number => number !== phone)]
                : store.phones;

              return (
                <article className="sk-final-store-card" key={store.name}>
                  <span className="sk-final-store-type">{store.type}</span>
                  <h3>{store.name}</h3>

                  <div className="sk-final-address">
                    <MapPin size={19}/>
                    <p>{storeAddress}</p>
                  </div>

                  <div className="sk-final-map">
                    <iframe
                      title={`${store.name} store location`}
                      src={`https://www.google.com/maps?q=${encodeURIComponent(storeAddress + ", Andhra Pradesh, India")}&output=embed`}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>

                  <div className="sk-final-numbers">
                    <span>CONTACT NUMBERS</span>
                    {numbers.map(number => (
                      <a key={number} href={tel(number)}>
                        <Phone size={15}/> {number}
                      </a>
                    ))}
                  </div>

                  <a className="sk-final-directions"
                    href={directions(storeAddress)}
                    target="_blank" rel="noopener noreferrer">
                    Get Directions <ArrowUpRight size={17}/>
                  </a>
                </article>
              );
            })}
          </div>

          <div className="sk-final-hours">
            <Clock3 size={18}/>
            <span>Monday – Saturday: 10 AM – 8 PM</span>
            <span className="sk-final-hours-divider">|</span>
            <span>Sunday: Closed</span>
          </div>
        </div>
      </section>

      <section className="sk-final-connect" id="send-message">
        <div className="sk-final-wrap sk-final-connect-grid">
          <div className="sk-final-connect-info">
            <span className="sk-final-eyebrow">A PERSONAL INVITATION</span>
            <h2>Send Us a <em>Message.</em></h2>
            <p>
              Questions about orders, custom designs or collaborations?
              Tell us what you have in mind.
            </p>

            <a className="sk-final-email" href={`mailto:${email}`}>
              <Mail size={19}/> {email}
            </a>

            <div className="sk-final-social">
              <h3>Follow Our Journey</h3>
              <div className="sk-final-social-links">
                {instagram && (
                  <a href={instagram} target="_blank"
                    rel="noopener noreferrer">
                    <InstagramMark/> Instagram <ArrowUpRight size={15}/>
                  </a>
                )}
                {youtube && (
                  <a href={youtube} target="_blank"
                    rel="noopener noreferrer">
                    <YouTubeMark/> YouTube <ArrowUpRight size={15}/>
                  </a>
                )}
              </div>
            </div>
          </div>

          <form className="sk-final-form" onSubmit={submit}>
            <h3>Write to Our Team</h3>
            <p>We look forward to hearing from you.</p>

            <div className="sk-final-form-row">
              <label>
                Your Name *
                <input name="name" autoComplete="name"
                  required placeholder="Full name"/>
              </label>
              <label>
                Email Address *
                <input name="email" type="email"
                  autoComplete="email" required
                  placeholder="you@example.com"/>
              </label>
            </div>

            <div className="sk-final-form-row">
              <label>
                Phone Number
                <input name="phone" type="tel"
                  autoComplete="tel" placeholder="+91"/>
              </label>
              <label>
                Subject
                <select name="subject" defaultValue="General enquiry">
                  <option>General enquiry</option>
                  <option>Order enquiry</option>
                  <option>Custom design</option>
                  <option>Store visit</option>
                  <option>Collaboration</option>
                </select>
              </label>
            </div>

            <label>
              Your Message *
              <textarea name="message" rows={5} required
                placeholder="How can we help you?"/>
            </label>

            <button type="submit">
              <Send size={17}/> Prepare Email <ArrowUpRight size={16}/>
            </button>

            <small>
              Your email app will open with the message ready.
              Press Send there to complete your enquiry.
            </small>

            {prepared && (
              <p className="sk-final-prepared" role="status">
                <CheckCircle2 size={17}/> Email draft prepared.
                Please send it using your email app.
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
