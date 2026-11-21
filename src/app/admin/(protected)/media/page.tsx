import MediaLibrary from "@/components/admin/media-library";

export default function MediaPage() {
  return <div className="skad-app"><main className="skad-main">
    <header className="skad-topbar"><div className="skad-breadcrumb"><span>CONTENT &amp; MARKETING</span><span className="skad-breadcrumb-divider">/</span><strong>Media Library</strong></div></header>
    <MediaLibrary />
  </main></div>;
}
