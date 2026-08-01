import { Link } from 'react-router-dom';
import { Shield, Clock, BadgeCheck } from 'lucide-react';

export default function Welcome() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-slate-50 p-4 text-center sm:p-6 lg:p-10">
      <div className="mb-8 w-full max-w-sm sm:mb-10 sm:max-w-md lg:max-w-lg">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-emerald-100 text-5xl shadow-sm sm:h-28 sm:w-28 sm:text-6xl">
          🚌
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          SchoolRun
        </h1>
        <p className="mt-3 text-sm font-semibold tracking-[0.2em] text-emerald-600">
          SAFE · VERIFIED · ON TIME
        </p>
        <p className="mt-4 text-sm text-slate-600 sm:text-base">
          Trusted school transport for parents, drivers, and schools — live tracking, verified
          drivers, and secure handovers.
        </p>
      </div>

      <div className="mb-8 grid w-full max-w-sm grid-cols-3 gap-2 text-left sm:mb-10 sm:max-w-md sm:gap-3 lg:max-w-lg">
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

      <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-sm">
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
