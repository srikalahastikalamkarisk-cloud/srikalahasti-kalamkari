export type JourneyStep = { title: string; description: string; image: string };
// Edit these entries later from your admin CMS. Add your own images at public/images/kalamkari-process/step-01.jpg ... step-12.jpg.
export const kalamkariJourneySteps: JourneyStep[] = [
  { title: 'Fabric Selection', description: 'Carefully selected cotton fabric forms the foundation of each handcrafted Kalamkari creation.', image: '/images/kalamkari-process/step-01.jpg' },
  { title: 'Washing & Scouring', description: 'The fabric is thoroughly washed to remove impurities and prepare its surface.', image: '/images/kalamkari-process/step-02.jpg' },
  { title: 'Myrobalan Treatment', description: 'Traditional myrobalan preparation helps the cloth receive natural dyes and detailed artwork.', image: '/images/kalamkari-process/step-03.jpg' },
  { title: 'Milk Preparation', description: 'A traditional milk-based treatment may be used to prepare the surface for precise hand drawing.', image: '/images/kalamkari-process/step-04.jpg' },
  { title: 'Drying the Fabric', description: 'The treated fabric is gently dried before the first lines of the design are drawn.', image: '/images/kalamkari-process/step-05.jpg' },
  { title: 'Sketching the Motifs', description: 'Artisans plan intricate floral, mythological and heritage-inspired compositions.', image: '/images/kalamkari-process/step-06.jpg' },
  { title: 'Kalam Pen Drawing', description: 'A handmade kalam pen brings expressive outlines and fine details onto the fabric.', image: '/images/kalamkari-process/step-07.jpg' },
  { title: 'Natural Dye Preparation', description: 'Colour is prepared using traditional dye materials and careful artisan knowledge.', image: '/images/kalamkari-process/step-08.jpg' },
  { title: 'Hand Colouring', description: 'Each area is painted patiently, building layers of colour and character by hand.', image: '/images/kalamkari-process/step-09.jpg' },
  { title: 'Colour Fixing', description: 'Traditional dye and mordant processes help develop the artwork’s lasting tones.', image: '/images/kalamkari-process/step-10.jpg' },
  { title: 'Washing & Sun Drying', description: 'The cloth is washed and dried again to reveal its beautifully finished artwork.', image: '/images/kalamkari-process/step-11.jpg' },
  { title: 'Final Detailing & Finishing', description: 'Every piece is inspected, refined and prepared as a celebration of Srikalahasti craft.', image: '/images/kalamkari-process/step-12.jpg' },
];
