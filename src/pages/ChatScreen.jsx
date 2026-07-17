import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { chatApi, ridesApi } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';

export default function ChatScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [rideId, setRideId] = useState(params.get('rideId') || '');
  const [ride, setRide] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let socket = null;
    let onMessage = null;
    let activeRideId = null;

    (async () => {
      try {
        let id = params.get('rideId');
        if (!id) {
          const { ride: active } = await ridesApi.active();
          if (active?.id) id = active.id;
          else {
            const { rides } = await ridesApi.list();
            const chatable = rides.find((r) =>
              ['open', 'assigned', 'in_transit', 'completed'].includes(r.status),
            );
            if (chatable) id = chatable.id;
          }
        }

        if (cancelled) return;

        if (!id) {
          setError('No ride available for chat. Book and pay for a trip first.');
          setLoading(false);
          return;
        }

        setRideId(id);
        activeRideId = id;

        const [{ ride: r }, { messages: msgs }] = await Promise.all([
          ridesApi.get(id),
          chatApi.messages(id),
        ]);
        if (cancelled) return;
        setRide(r);
        setMessages(msgs);

        const token = localStorage.getItem('schoolrun_token');
        socket = connectSocket(token);
        socket.emit('chat:join', { rideId: id });
        setConnected(socket.connected);
        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        onMessage = (message) => {
          if (message.rideId !== id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });
        };
        socket.on('chat:message', onMessage);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load chat');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (socket && onMessage) socket.off('chat:message', onMessage);
      if (socket && activeRideId) socket.emit('chat:leave', { rideId: activeRideId });
    };
  }, [params]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !rideId) return;
    setDraft('');
    setError('');

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('chat:send', { rideId, body: text }, (ack) => {
        if (ack?.error) {
          setError(ack.error);
          setDraft(text);
        } else if (ack?.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === ack.message.id)) return prev;
            return [...prev, ack.message];
          });
        }
      });
      return;
    }

    try {
      const { message } = await chatApi.send(rideId, text);
      setMessages((prev) => [...prev, message]);
    } catch (err) {
      setError(err.message || 'Failed to send');
      setDraft(text);
    }
  };

  const peerName =
    user?.role === 'driver' ? ride?.parentName || 'Parent' : ride?.driverName || 'Driver';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading chat…
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-lg text-emerald-600"
          aria-label="Go back"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{peerName}</p>
          <p className="text-xs text-emerald-600">
            {ride ? `${ride.childName} · ${ride.status}` : 'Trip chat'}
            {connected ? ' · live' : ' · api'}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-400">
            No messages yet. Say hello to start the conversation.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine
                    ? 'rounded-br-md bg-emerald-600 text-white'
                    : 'rounded-bl-md bg-slate-100 text-slate-800'
                }`}
              >
                {!mine && (
                  <p className="mb-0.5 text-[10px] font-semibold text-slate-500">{m.senderName}</p>
                )}
                <p>{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? 'text-emerald-100' : 'text-slate-400'}`}>
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-center text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2 border-t border-slate-200 p-4">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={rideId ? 'Type a message…' : 'No ride for chat'}
          disabled={!rideId}
          className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-emerald-600/30 focus:ring-2 disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={send}
          disabled={!rideId || !draft.trim()}
          className="rounded-2xl bg-emerald-600 px-5 font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
