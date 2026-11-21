export const storeContact = {
  whatsapp: "917288848881",
  whatsappMessage:
    "Hello Srikalahasti Kalamkari, I would like to enquire about your products.",
  stores: [
    {
      name: "Srikalahasti Store & Workshop",
      phones: [
        "+91 72888 48881",
        "+91 72888 48882",
        "+91 72888 48883",
      ],
    },
    {
      name: "Tirupati Store",
      phones: [
        "+91 70364 81999",
        "+91 70364 82999",
        "+91 70364 83999",
      ],
    },
  ],
};

export const whatsappUrl =
  `https://wa.me/${storeContact.whatsapp}?text=${encodeURIComponent(
    storeContact.whatsappMessage
  )}`;
