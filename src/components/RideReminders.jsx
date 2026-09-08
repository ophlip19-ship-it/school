import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import { notifyScheduledRide, showRideNotification } from '../lib/notifications';

/** Listens for server ride reminders while the parent is signed in. */
export default function RideReminders() {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'parent') return undefined;
    const socket = getSocket();
    if (!socket) return undefined;

    const onReminder = (payload) => {
      notifyScheduledRide(payload, {
        minutesUntil: payload?.minutesUntil ?? 30,
      });
    };
    const onActivated = (payload) => {
      showRideNotification({
        title: `Ride is live · ${payload?.childName || 'Child'}`,
        body: `Finding a driver for ${payload?.time || 'the scheduled pickup'}.`,
        tag: `activated-${payload?.rideId}`,
      });
    };

    socket.on('ride:reminder', onReminder);
    socket.on('ride:activated', onActivated);
    return () => {
      socket.off('ride:reminder', onReminder);
      socket.off('ride:activated', onActivated);
    };
  }, [isAuthenticated, user?.role]);

  return null;
}
