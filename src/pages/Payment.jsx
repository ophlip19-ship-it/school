import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
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
        {loading ? 'Processing…' : `Pay ${formatMoney(ride.fareCents)}`}
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
        {loading ? 'Processing…' : `Pay ${formatMoney(ride.fareCents)}`}
      </button>
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
        const [{ ride: r }, config, intentRes] = await Promise.all([
          ridesApi.get(rideId),
          paymentsApi.config(),
          paymentsApi.createIntent(rideId),
        ]);
        setRide(r);
        setIntent(intentRes);

        if (!intentRes.demoMode && config.publishableKey) {
          setStripePromise(loadStripe(config.publishableKey));
        }

        if (r.paymentStatus === 'paid') {
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
      <Link to="/vehicle-review" className="text-sm font-medium text-emerald-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Payment</h1>
      <p className="mt-2 text-slate-600">Secure checkout for {ride.childName}&apos;s trip</p>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
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

      {intent?.demoMode || !intent?.clientSecret ? (
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
