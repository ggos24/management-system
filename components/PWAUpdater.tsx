import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

const HOURLY_UPDATE_CHECK_MS = 60 * 60 * 1000;

export const PWAUpdater: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const id = window.setInterval(() => {
        registration.update().catch(() => {});
      }, HOURLY_UPDATE_CHECK_MS);
      return () => window.clearInterval(id);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    const toastId = toast('A new version is available', {
      description: 'Reload to get the latest updates.',
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      onDismiss: () => setNeedRefresh(false),
    });
    return () => {
      toast.dismiss(toastId);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
};
