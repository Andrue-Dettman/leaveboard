import { useAnnouncement } from '../hooks/useAnnouncer.js';

export default function LiveRegion() {
  const message = useAnnouncement();

  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
