import { useState } from 'react';

const preferenceKey = 'classskip_reader_device';
export type ReaderDevice = 'mobile' | 'full';

export function isPhoneDevice(
  nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator,
): boolean {
  const ua = nav.userAgent;
  // iPadOS desktop browsing identifies itself as a touch-capable Mac.
  if (/iPad|Tablet|Silk|Kindle/i.test(ua) || (/Mac/i.test(nav.platform) && nav.maxTouchPoints > 1))
    return false;
  return /iPhone|iPod|Windows Phone/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
}

export function useReaderDevice() {
  const [device] = useState<ReaderDevice>(() => {
    try {
      const saved = localStorage.getItem(preferenceKey);
      if (saved === 'mobile' || saved === 'full') return saved;
    } catch {
      /* Device detection also works when storage is unavailable. */
    }
    return isPhoneDevice() ? 'mobile' : 'full';
  });
  return {
    mobile: device === 'mobile',
    switchDevice: (next: ReaderDevice) => {
      try {
        localStorage.setItem(preferenceKey, next);
      } catch {
        return false;
      }
      window.location.reload();
      return true;
    },
  };
}
