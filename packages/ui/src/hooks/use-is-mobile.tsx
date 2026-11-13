import { useEffect, useState } from 'react';

import { useApp } from '@colanode/ui/contexts/app';

const mobileDeviceRegex =
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i;

export const useIsMobile = (): boolean => {
  const app = useApp();
  const [isMobile, setIsMobile] = useState(() => {
    return (
      app.type === 'mobile' ||
      mobileDeviceRegex.test(navigator.userAgent) ||
      window.matchMedia('(max-width: 768px)').matches
    );
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const update = () => {
      setIsMobile(
        app.type === 'mobile' ||
          mobileDeviceRegex.test(navigator.userAgent) ||
          mediaQuery.matches
      );
    };

    update();
    mediaQuery.addEventListener('change', update);
    window.addEventListener('resize', update);

    return () => {
      mediaQuery.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [app.type]);

  return isMobile;
};
