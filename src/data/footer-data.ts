/** Centralized footer content. Ready to replace with an admin settings API later. */
export const footerData = {
  brand: 'Srikalahasti Kalamkari',
  headline: 'Woven with heritage.',
  headlineSecond: 'Draped for today.',
  description: 'GI-registered Srikalahasti Kalamkari, drawn by hand with a bamboo kalam and coloured with natural dyes.',
  gi: 'Application No. 28',
  gstin: '37EVOPS6191D1ZX',
  phone: '+91 72888 48881',
  email: 'srikalahastikalamkari.sk@gmail.com',
  whatsapp: 'https://wa.me/917288848881',
  instagram: '', // Add the official Instagram profile URL
  youtube: '', // Add the official YouTube channel URL
  stores: [
    { name: 'Srikalahasti · Store & Workshop', address: '# 17-68, Bharathi Nagar, Tirupati Main Road, Near Railway Station, Srikalahasti-517640', phones: '+91 72888 48881 / 82 / 83', map: 'https://www.google.com/maps/search/?api=1&query=17-68+Bharathi+Nagar+Srikalahasti' },
    { name: 'Tirupati Store', address: '# 6-8-1126, NGOs Colony, Opp: Balaji Silk Emporium, Revenue Ward No 6, Tirupati', phones: '+91 70364 81999 / 82999 / 83999', map: 'https://www.google.com/maps/search/?api=1&query=6-8-1126+NGOs+Colony+Tirupati' }
  ],
  hours: 'Mon – Sat · 10:00 AM – 8:00 PM',
  collections: [{ label: 'Sarees', href: '/sarees' }, { label: 'Dupattas', href: '/dupattas' }, { label: 'Running Fabrics', href: '/running-fabrics' }, { label: 'Wall Paintings', href: '/wall-paintings' }],
  care: [{ label: 'About Our Craft', href: '/about' }, { label: 'Shopping Cart', href: '/cart' }, { label: 'Wishlist', href: '/wishlist' }, { label: 'Contact Us', href: '/contact' }],
  legal: [] as { label: string; href: string }[],
};
