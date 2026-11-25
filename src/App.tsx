import { useEffect, useState } from 'react';
import { Shell } from './components/Shell';
import { Builder } from './pages/Builder';
import { Recipient } from './pages/Recipient';
import { TeamBuilder } from './pages/TeamBuilder';
import { GIFT_HASH } from './giftLink';

/** `#g=…` opens the recipient's gift page, `#team` the team send; anything else is the sender's builder. */
export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (hash.startsWith(GIFT_HASH)) return <Shell tag="You’ve got a gift 🎁"><Recipient encoded={hash.slice(GIFT_HASH.length)}/></Shell>;
  if (hash === '#team') return <Shell tag="Team send 👥"><TeamBuilder/></Shell>;
  return <Shell><Builder/></Shell>;
}
