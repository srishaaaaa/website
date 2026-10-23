import { useApp } from '../context/App';
import { Reveal } from './Motion';

const IgIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" /></svg>;

// Only rendered when the store has configured an Instagram URL (and shows only the posts it has uploaded).
export default function InstagramStrip() {
  const { site } = useApp();
  const ig = site.social?.instagram;
  if (!ig?.url) return null;
  return (
    <section className="insta ivory-sec" aria-labelledby="ig-h">
      <Reveal className="insta-head">
        {ig.handle && <p className="insta-handle"><IgIcon /> <span>@{ig.handle}</span></p>}
        <h2 id="ig-h" className="serif"><em>View more on Instagram</em></h2>
        <a className="btn solid pill" href={ig.url} target="_blank" rel="noopener noreferrer" data-cursor="FOLLOW"><IgIcon size={16} /> FOLLOW ON INSTAGRAM <span aria-hidden="true">↗</span></a>
      </Reveal>
      {ig.posts.length > 0 && (
        <ul className="insta-grid">
          {ig.posts.slice(0, 3).map((t, i) => (
            <Reveal as="li" key={t.image} delay={i * 0.1}>
              <a className="insta-tile" href={t.href || ig.url} target="_blank" rel="noopener noreferrer" data-cursor="VIEW"><img src={t.image} alt={t.alt || 'Instagram post'} loading="lazy" /></a>
            </Reveal>
          ))}
        </ul>
      )}
    </section>
  );
}
