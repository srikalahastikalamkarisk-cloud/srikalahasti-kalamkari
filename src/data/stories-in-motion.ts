// Storefront data. Later, replace this array with a server/API response from the admin panel.
// Upload your own licensed MP4 files to public/videos/stories/ as story-01.mp4 ... story-06.mp4.
// Disabled until real videos are provided, to avoid broken media requests.
export type StoryVideo = { id: string; title: string; mp4: string; instagramUrl?: string; poster?: string; enabled: boolean };
export const storyVideos: StoryVideo[] = [
  { id: "01", title: "The Artisan's Touch", mp4: "/videos/stories/story-01.mp4", enabled: true },
  { id: "02", title: "The Beauty of Kalamkari", mp4: "/videos/stories/story-02.mp4", enabled: true },
  { id: "03", title: "Natural Colours", mp4: "/videos/stories/story-03.mp4", enabled: true },
  { id: "04", title: "Painted by Hand", mp4: "/videos/stories/story-04.mp4", enabled: true },
  { id: "05", title: "Heritage in Every Thread", mp4: "/videos/stories/story-05.mp4", enabled: true },
  { id: "06", title: "Timeless Creations", mp4: "/videos/stories/story-06.mp4", enabled: true },
];
