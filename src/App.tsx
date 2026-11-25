import { useEffect, useState } from 'react';
import { Shell } from './components/Shell';
import { Builder } from './pages/Builder';
import { Recipient } from './pages/Recipient';
import { TeamBuilder } from './pages/TeamBuilder';
import { CardJoin, CardNew, CardOpen, CardOrganiser } from './pages/GroupCard';
import { parseCardHash } from './cardCrypto';
import { GIFT_HASH } from './giftLink';

/** `#g=…` opens the recipient's gift page, `#team` the group send; anything else is the sender's builder. */
export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (hash.startsWith(GIFT_HASH)) return <Shell tag="You’ve got a gift 🎁"><Recipient encoded={hash.slice(GIFT_HASH.length)}/></Shell>;
  const card = parseCardHash(hash);
  if (card?.kind === 'org') return <Shell tag="Group card 💌"><CardOrganiser key={card.id} link={card}/></Shell>;
  if (card?.kind === 'join') return <Shell tag="Group card 💌"><CardJoin key={card.id} link={card}/></Shell>;
  if (card?.kind === 'card') return <Shell tag="You’ve got a card 💌"><CardOpen key={card.id} link={card}/></Shell>;
  if (hash === '#card-new') return <Shell tag="Group card 💌"><CardNew/></Shell>;
  if (hash === '#team') return <Shell tag="Group send 👥"><TeamBuilder/></Shell>;
  return <Shell><Builder/></Shell>;
}
