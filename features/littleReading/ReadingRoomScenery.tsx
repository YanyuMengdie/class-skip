import React, { useState } from 'react';
import { Flower2, Heart } from 'lucide-react';
import { useAppLanguage } from '@/shared/i18n/appLanguage';

/** Desktop margin illustrations, kept outside the article and its saved reading position. */
export function ReadingRoomScenery({ side }: { side: 'left' | 'right' }) {
  const { text } = useAppLanguage();
  const [petted, setPetted] = useState(false);

  if (side === 'left') return <aside className="reading-room-side reading-room-left" aria-hidden="true">
    <div className="reading-room-window">
      <div className="reading-room-sun" />
      <span className="reading-room-cloud reading-room-cloud-one" />
      <span className="reading-room-cloud reading-room-cloud-two" />
      <div className="reading-room-window-frame" />
      <span className="reading-room-window-sill" />
    </div>
    <div className="reading-room-plant">
      <div className="reading-room-stem" />
      <span className="reading-room-leaf reading-room-leaf-one" />
      <span className="reading-room-leaf reading-room-leaf-two" />
      <span className="reading-room-leaf reading-room-leaf-three" />
      <div className="reading-room-pot" />
    </div>
    <Flower2 className="reading-room-flower" size={30} strokeWidth={1.2} />
  </aside>;

  return <aside className="reading-room-side reading-room-right" aria-label={text('陪读小猫', 'Reading companion')}>
    <div className="reading-room-note" aria-hidden="true">
      <span className="reading-room-tape" />
      <Heart size={26} strokeWidth={1.5} />
    </div>
    <div className={`reading-room-cat-scene${petted ? ' is-petted' : ''}`}>
      <button type="button" className="reading-room-cat-button" aria-label={text('摸摸陪读的小猫', 'Pet the reading cat')}
        aria-pressed={petted} onClick={() => setPetted(value => !value)}>
        <span className="reading-room-cat-art" aria-hidden="true">
          <span className="reading-room-cat-tail" />
          <span className="reading-room-cat-body" />
          <span className="reading-room-ear reading-room-ear-left" />
          <span className="reading-room-ear reading-room-ear-right" />
          <span className="reading-room-cat-face">
            <span className="reading-room-stripe reading-room-stripe-one" />
            <span className="reading-room-stripe reading-room-stripe-two" />
            <span className="reading-room-eye reading-room-eye-left" />
            <span className="reading-room-eye reading-room-eye-right" />
            <span className="reading-room-cheek reading-room-cheek-left" />
            <span className="reading-room-cheek reading-room-cheek-right" />
            <span className="reading-room-nose" />
            <span className="reading-room-mouth" />
          </span>
          <span className="reading-room-paw reading-room-paw-left" />
          <span className="reading-room-paw reading-room-paw-right" />
          <span className="reading-room-open-book"><span /><span /></span>
        </span>
      </button>
    </div>
    <div className="reading-room-books" aria-hidden="true"><span /><span /><span /></div>
  </aside>;
}
