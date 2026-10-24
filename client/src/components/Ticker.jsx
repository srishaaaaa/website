import { campaign } from '../config/content';

// Full-width looping band. Pure CSS animation (no JavaScript loop); the second copy makes the loop seamless.
// Wording lives in config/content.js → campaign.ticker, so it is easy to change per campaign.
export default function Ticker() {
  const items = campaign.ticker;
  const run = (key, hidden) => (
    <ul className="tk-run" aria-hidden={hidden || undefined} key={key}>
      {items.map((t, i) => <li key={i}><span>{t}</span><i aria-hidden="true">✦</i></li>)}
    </ul>
  );
  return (
    <div className="tk" role="marquee" aria-label={items.join(', ')}>
      <div className="tk-track">{run('a', false)}{run('b', true)}</div>
    </div>
  );
}
