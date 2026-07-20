import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { CreditCard, Building2, Copy, Check } from 'lucide-react';
import { paymentsApi, ridesApi, formatMoney } from '../lib/api';

function DemoPayForm({ ride, onPaid }) {
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await paymentsApi.confirmDemo({ rideId: ride.id, cardNumber });
      onPaid();
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handlePay} className="mt-6 space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Demo payments enabled. Use card <strong>4242…4242</strong>. Cards ending in <strong>0000</strong> are declined.
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Name on card</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Cardholder name"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600/30"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Card number</label>
        <input
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          inputMode="numeric"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono outline-none focus:ring-2 focus:ring-emerald-600/30"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Expiry</label>
          <input
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">CVC</label>
          <input
            value={cvc}
            onChange={(e) => setCvc(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600/30"
          />
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white disabled:opacity-60"
      >
        {loading ? 'Processing…' : `Pay ${formatMoney(ride.fareCents)} with card`}
      </button>
    </form>
  );
}

function StripePayForm({ ride, paymentIntentId, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError('');
    setLoading(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message);

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/payment?rideId=${ride.id}&stripe=1`,
        },
      });
      if (confirmError) throw new Error(confirmError.message);

      const intentId = paymentIntent?.id || paymentIntentId;
      await paymentsApi.confirmStripe({ rideId: ride.id, paymentIntentId: intentId });
      onPaid();
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handlePay} className="mt-6 space-y-4">
      <PaymentElement />
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white disabled:opacity-60"
      >
        {loading ? 'Processing…' : `Pay ${formatMoney(ride.fareCents)} with card`}
      </button>
    </form>
  );
}

function TransferPayForm({ ride, transfer, onPaid }) {
  const [senderName, setSenderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const copy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await paymentsApi.confirmTransfer({
        rideId: ride.id,
        reference: transfer.reference,
        senderName: senderName.trim(),
      });
      onPaid();
    } catch (err) {
      setError(err.message || 'Transfer confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  const rows = [
    { label: 'Bank', value: transfer.bank?.bankName },
    { label: 'Account name', value: transfer.bank?.accountName },
    { label: 'Account number', value: transfer.bank?.accountNumber },
    { label: 'Amount', value: formatMoney(transfer.amountCents || ride.fareCents) },
    { label: 'Reference', value: transfer.reference },
  ];

  return (
    <form onSubmit={handleConfirm} className="mt-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        {transfer.instructions ||
          'Transfer the exact amount using the reference below, then confirm payment.'}
      </div>

      <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {row.label}
              </p>
              <p className="mt-0.5 font-semibold text-slate-900 break-all">
                {row.value || '—'}
              </p>
            </div>
            {row.value && row.label !== 'Amount' && (
              <button
                type="button"
                onClick={() => copy(row.label, String(row.value))}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {copied === row.label ? (
                  <>
                    <Check size={12} className="text-emerald-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={12} /> Copy
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Your name on the transfer (optional)
        </label>
        <input
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder="Name used for the bank transfer"
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600/30"
        />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white disabled:opacity-60"
      >
        {loading ? 'Confirming…' : `I’ve paid ${formatMoney(ride.fareCents)}`}
      </button>
      <p className="text-center text-xs text-slate-500">
        Demo mode marks the ride paid after you confirm. Production would verify the transfer automatically.
      </p>
    </form>
  );
}

export default function Payment() {
  const [params] = useSearchParams();
  const rideId = params.get('rideId');
  const navigate = useNavigate();

  const [ride, setRide] = useState(null);
  const [intent, setIntent] = useState(null);
  const [stripePromise, setStripePromise] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [method, setMethod] = useState('card'); // card | transfer
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rideId) {
      setError('Missing ride');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [{ ride: r }, config, intentRes, transferRes] = await Promise.all([
          ridesApi.get(rideId),
          paymentsApi.config(),
          paymentsApi.createIntent(rideId).catch((err) => {
            // Already paid or other non-fatal for transfer path
            if (String(err.message || '').toLowerCase().includes('already paid')) {
              return { alreadyPaid: true };
            }
            throw err;
          }),
          paymentsApi.transferDetails(rideId).catch(() => null),
        ]);
        setRide(r);
        setIntent(intentRes);
        setTransfer(
          transferRes || {
            reference: `SR-${String(r.id).slice(-6).toUpperCase()}`,
            amountCents: r.fareCents,
            bank: config.transfer || {
              bankName: 'SchoolRun Escrow Bank',
              accountName: 'SchoolRun Payments Ltd',
              accountNumber: '0123456789',
            },
            instructions:
              'Transfer the exact amount and use the payment reference as your narration.',
          },
        );

        if (!intentRes?.demoMode && intentRes?.clientSecret && config.publishableKey) {
          setStripePromise(loadStripe(config.publishableKey));
        }

        if (r.paymentStatus === 'paid' || intentRes?.alreadyPaid) {
          navigate(`/live-tracking?rideId=${r.id}`, { replace: true });
        }
      } catch (err) {
        setError(err.message || 'Failed to load payment');
      } finally {
        setLoading(false);
      }
    })();
  }, [rideId, navigate]);

  const onPaid = () => {
    navigate(`/live-tracking?rideId=${rideId}`);
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading payment…</div>;
  }

  if (error || !ride) {
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="text-red-600">{error || 'Ride not found'}</p>
        <Link to="/dashboard" className="mt-4 inline-block text-emerald-600">
          ← Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-6 pb-28">
      <Link to="/dashboard" className="text-sm font-medium text-emerald-600">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Payment</h1>
      <p className="mt-2 text-slate-600">
        Pay with card or bank transfer for {ride.childName}&apos;s trip
      </p>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {ride.driverName && (
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-slate-500">Driver</span>
            <span className="font-medium text-slate-900">
              {ride.driverName}
              {ride.vehiclePlate ? ` · ${ride.vehiclePlate}` : ''}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Route</span>
          <span className="max-w-[60%] text-right font-medium text-slate-900">
            {ride.pickup} → {ride.dropoff}
          </span>
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-slate-500">When</span>
          <span className="font-medium text-slate-900">
            {ride.date} · {ride.time}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="text-2xl font-bold text-emerald-700">{formatMoney(ride.fareCents)}</span>
        </div>
      </div>

      {/* Method toggle */}
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMethod('card')}
          className={`inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
            method === 'card'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <CreditCard size={16} /> Card
        </button>
        <button
          type="button"
          onClick={() => setMethod('transfer')}
          className={`inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
            method === 'transfer'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 size={16} /> Transfer
        </button>
      </div>

      {method === 'transfer' ? (
        transfer && <TransferPayForm ride={ride} transfer={transfer} onPaid={onPaid} />
      ) : intent?.demoMode || !intent?.clientSecret ? (
        <DemoPayForm ride={ride} onPaid={onPaid} />
      ) : (
        stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: intent.clientSecret,
              appearance: { theme: 'stripe', variables: { colorPrimary: '#059669' } },
            }}
          >
            <StripePayForm
              ride={ride}
              paymentIntentId={intent.paymentIntentId}
              onPaid={onPaid}
            />
          </Elements>
        )
      )}
    </div>
  );
}
