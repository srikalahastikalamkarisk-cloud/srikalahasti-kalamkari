import { footerData as d } from '@/data/footer-data';
import Link from 'next/link';
import Image from 'next/image';
import { getPublicStoreSettings } from '@/lib/public-store-settings';
import './premium-footer.css';

export default async function PremiumFooter() {
  const settings = await getPublicStoreSettings();
  const brand = settings?.storeName || d.brand;
  const description = settings?.description || d.description;
  const phone = settings?.contactPhone || d.phone;
  const email = settings?.contactEmail || d.email;
  const whatsappDigits = settings?.whatsappNumber?.replace(/\D/g, "") || "";
  const whatsapp = whatsappDigits.length >= 8
    ? `https://wa.me/${whatsappDigits}`
    : d.whatsapp;
  const customWhatsApp = `${whatsapp}${whatsapp.includes("?") ? "&" : "?"}text=${encodeURIComponent("Hello, I need help with a custom Srikalahasti Kalamkari design. Please share fabric, motif, price and timeline details.")}`;
  const instagram = settings?.instagramUrl || d.instagram;
  const facebook = settings?.facebookUrl || "";
  const youtube = settings?.youtubeUrl || d.youtube;
  const phoneHref = phone.replace(/[^\d+]/g, "");

  return <footer className="skf" aria-label="Srikalahasti Kalamkari footer">
    <div className="skf-shell">
      <section className="skf-custom" aria-labelledby="skf-custom-title">
        <div className="skf-custom-copy">
          <span className="skf-kicker">✦ CUSTOMIZATION · PAINTED BY HAND</span>
          <h2 id="skf-custom-title">Want something <em>made just for you?</em></h2>
          <p>We make custom designs for everything we paint: sarees, dupattas, fabrics, men&apos;s wear and more. Send us your idea, colours or a photo.</p>
          <span className="skf-note">No obligation. We share fabric options, price and timeline first.</span>
        </div>
        <div className="skf-custom-actions">
          <a className="skf-btn skf-btn-primary" href={customWhatsApp} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">✆</span> MESSAGE ON WHATSAPP <span aria-hidden="true">↗</span></a>
          <Link className="skf-btn skf-btn-outline" href="/contact#send-message">EXPLORE CUSTOMIZATION <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
      <div className="skf-main">
        <section className="skf-brand-col">
          <div className="skf-brand">
            {settings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="skf-logo" src={settings.logoUrl} alt={`${brand} emblem`} width="68" height="68" />
            ) : (
              <Image className="skf-logo" src="/srikalahasti-logo.png" alt="Srikalahasti Kalamkari emblem" width={68} height={68} />
            )}
            <strong>{brand}</strong>
          </div>
          <p>{description}</p>
          <div className="skf-details"><span><b>GI Registered:</b> {d.gi}</span><span><b>GSTIN:</b> {d.gstin}</span></div>
          <div className="skf-social" aria-label="Social media">
            {instagram ? <a className="skf-instagram" href={instagram} target="_blank" rel="noopener noreferrer"><span className="skf-social-icon skf-ig-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg></span>Instagram</a> : <span className="skf-social-unlinked"><span className="skf-social-icon skf-ig-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg></span>Instagram</span>}
            {facebook && <a className="skf-instagram" href={facebook} target="_blank" rel="noopener noreferrer">Facebook ↗</a>}
            {youtube ? <a className="skf-youtube" href={youtube} target="_blank" rel="noopener noreferrer"><span className="skf-social-icon skf-yt-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="m10 9 6 3-6 3z" fill="#fff"/></svg></span>YouTube</a> : <span className="skf-social-unlinked"><span className="skf-social-icon skf-yt-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="m10 9 6 3-6 3z" fill="#fff"/></svg></span>YouTube</span>}
          </div>
        </section>
        <nav className="skf-links" aria-label="Collections"><h3>Collections</h3>{d.collections.map(x=><Link key={x.label} href={x.href}>{x.label}</Link>)}</nav>
        <nav className="skf-links" aria-label="Client care"><h3>Client Care</h3>{d.care.map(x=><Link key={x.label} href={x.href}>{x.label}</Link>)}
<Link href="/shipping-policy">Shipping Policy</Link>
<Link href="/refund-policy">Refund & Cancellation Policy</Link>
<Link href="/faq">FAQs</Link></nav>
        <section className="skf-contact"><h3>Get in touch</h3>
          {phoneHref && <a href={`tel:${phoneHref}`}>{phone}</a>}
          {email && <a href={`mailto:${email}`} className="skf-email">{email}</a>}
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="skf-whatsapp">Chat on WhatsApp ↗</a>
          {settings?.address ? (
            <div className="skf-store-list"><div><strong>Business address</strong><p>{settings.address}</p></div></div>
          ) : (
            <div className="skf-store-list">{d.stores.map(store=><div key={store.name}><strong>{store.name}</strong><p>{store.address}</p><a href={store.map} target="_blank" rel="noopener noreferrer">View map ↗</a></div>)}</div>
          )}
          <span className="skf-hours">{d.hours}</span>
        </section>
      </div>
      <div className="skf-developer-credit">
          <span className="skf-developer-label">Website Developed by</span>
          <a
            className="skf-developer-brand"
            href="https://venutrinity.in/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Venu Trinity <span aria-hidden="true">↗</span>
          </a>
          <span className="skf-developer-separator" aria-hidden="true">|</span>
          <a className="skf-developer-phone" href="tel:+919849743774">
            +91 98497 43774
          </a>
        </div>
        <div className="skf-bottom"><span>© {new Date().getFullYear()} {brand}. All rights reserved.</span>{d.legal.length > 0 && <nav aria-label="Legal links">{d.legal.map(x=><Link key={x.label} href={x.href}>{x.label}</Link>)}</nav>}</div>
    </div>
  </footer>;
}
