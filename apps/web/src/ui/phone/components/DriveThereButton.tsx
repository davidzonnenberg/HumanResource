// "Drive there" for presence actions (ceo-phone 8.2, 8.3, 14.3). Until the Waypoint exists
// (human-resource-mvp task 57) it shows a toast naming the target and closes the phone.
import { t } from '../../../text/t';
import { useHud } from '../../../store/stores';
import { usePhone } from '../phoneStore';

export function DriveThereButton({ targetName }: { targetId: string; targetName: string }) {
  const go = () => {
    useHud.getState().pushToast('phone.driveThere.toast', { target: targetName });
    usePhone.getState().setOpen(false);
  };
  return (
    <button type="button" className="ph-btn tonal" onClick={go}>
      <span aria-hidden="true">📍</span> {t('phone.driveThere')}
    </button>
  );
}
