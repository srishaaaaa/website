import { Link } from 'react-router-dom';
import { useApp } from '../context/App';
import { Reveal } from './Motion';
import BlankFrame from './BlankFrame';

// Asymmetric editorial band: a tall photograph beside a carefully set text block.
export default function EditorialSection() {
  const { site } = useApp();
  const b = site.branding || {};
  return (
    <section className="ed" aria-labelledby="ed-h">
      <div className="ed-in">
        <Reveal className="ed-photo">
          {b.editorialImage ? <img src={b.editorialImage} style={b.editorialPos ? { objectPosition: b.editorialPos } : undefined} alt={b.editorialAlt || 'A saree draped in warm light'} loading="lazy" /> : <BlankFrame label="Editorial photo" className="tall" />}
        </Reveal>
        <Reveal className="ed-copy" delay={0.1}>
          <p className="ed-label"><i aria-hidden="true" />DHANYA BOUTIQUE</p>
          <h2 id="ed-h">TRADITION,<br />WOVEN INTO<br />EVERY THREAD.</h2>
          <p className="ed-p">Discover the beauty of Indian sarees at Dhanya Boutique. Explore a variety of styles, colours and designs for every occasion.</p>
          <hr />
          <ul className="ed-facts"><li><strong>ALL KINDS</strong><span>of sarees</span></li><li><strong>EVERY</strong><span>occasion</span></li></ul>
          <div className="ed-cta"><Link className="bh-btn" to="/shop?category=sarees" data-cursor="SHOP"><span>BROWSE SAREES</span><b aria-hidden="true"><i>→</i></b></Link><Link className="bh-link" to="/#enquiry" data-cursor="ENQUIRE">ENQUIRE NOW</Link></div>
        </Reveal>
      </div>
    </section>
  );
}
