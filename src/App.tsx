import { useEffect, useState } from 'react';
import { Shell } from './components/Shell';
import { Builder } from './pages/Builder';
import { Recipient } from './pages/Recipient';
import { GIFT_HASH } from './giftLink';

/** `#g=…` opens the recipient's gift page; anything else is the sender's builder. */
export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  return hash.startsWith(GIFT_HASH)
    ? <Shell tag="You’ve got a gift 🎁"><Recipient encoded={hash.slice(GIFT_HASH.length)}/></Shell>
    : <Shell><Builder/></Shell>;
}
