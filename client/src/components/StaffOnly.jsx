import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/App';

// Shown when a signed-in customer opens a staff page: explains who they are signed in as and offers a way to switch accounts.
export default function StaffOnly() {
  const { user, signOut } = useApp();
  const nav = useNavigate();
  return (
    <div className="empty page-pad">
      <p className="serif big">Staff access only.</p>
      {user && <p className="muted">You are signed in as {user.email}, which is a customer account.</p>}
      <p><button className="btn dark" onClick={async () => { await signOut(); nav('/login') }}>SIGN IN WITH A STAFF ACCOUNT</button></p>
      <p><Link className="link-u" to="/">Return home</Link></p>
    </div>
  );
}
