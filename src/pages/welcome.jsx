import { Link } from 'react-router-dom';
import { Shield, Clock, BadgeCheck } from 'lucide-react';

export default function Welcome() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-slate-50 p-6 text-center">
      <div className="mb-10 max-w-sm">
        <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-3xl bg-emerald-100 text-6xl shadow-sm">
          🚌
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-slate-900">SchoolRun</h1>
        <p className="mt-3 text-sm font-semibold tracking-[0.2em] text-emerald-600">
          SAFE · VERIFIED · ON TIME
        </p>
        <p className="mt-4 text-slate-600">
          Trusted school transport for parents, drivers, and schools — live tracking, verified
          drivers, and secure handovers.
        </p>
      </div>

      <div className="mb-10 grid w-full max-w-sm grid-cols-3 gap-3 text-left">
        {[
          { icon: Shield, label: 'Verified drivers' },
          { icon: Clock, label: 'Live ETAs' },
          { icon: BadgeCheck, label: 'PIN handover' },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
          >
            <Icon className="mb-2 text-emerald-600" size={20} />
            <p className="text-xs font-medium text-slate-700">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          to="/signup"
          className="block rounded-2xl bg-emerald-600 py-4 text-lg font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700"
        >
          Get Started
        </Link>
        <Link
          to="/signup?mode=login"
          className="block rounded-2xl border border-slate-200 bg-white py-3.5 font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Sign in
        </Link>
        <Link
          to="/signup?role=driver"
          className="block text-sm font-medium text-emerald-700"
        >
          I&apos;m a Driver →
        </Link>
      </div>
    </div>
  );
}
