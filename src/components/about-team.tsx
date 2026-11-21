import type { AboutPageContent } from "@/lib/about-page-content";

export function TeamDisplay({ team }: { team: AboutPageContent["team"] }) {
  const visible = team.members.filter(member => member.visible);
  if (!visible.length) return null;
  return <section className="ska-team" id="team"><div className="ska-container"><p className="ska-kicker">{team.eyebrow}</p><h2>{team.heading}</h2><p className="ska-subtitle">{team.subtitle}</p><div className="ska-team-grid">{visible.map(member=><article className="ska-person" key={member.id}><div className="ska-avatar">{member.photo ? <img src={member.photo} alt={member.name}/> : <span>{member.name.slice(0,1).toUpperCase()}</span>}</div><h3>{member.name}</h3><p className="ska-role">{member.role}</p>{member.bio && <p className="ska-bio">{member.bio}</p>}</article>)}</div></div></section>;
}
