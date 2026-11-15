import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"Srikalahasti Kalamkari | The Royal Art of Heritage",description:"Discover Srikalahasti Kalamkari — traditional artistry, heritage-inspired collections and handcrafted elegance."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
