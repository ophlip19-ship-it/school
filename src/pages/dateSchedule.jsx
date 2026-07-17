import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setBookingDraft } from '../lib/booking';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function DateSchedule() {
  const navigate = useNavigate();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('14:30');
  const [tripType, setTripType] = useState('pickup');
  const [recurring, setRecurring] = useState(['Mon', 'Wed', 'Fri']);

  const toggleDay = (day) => {
    setRecurring((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  return (
    <div className="mx-auto max-w-md p-6 pb-28">
      <Link to="/pick-locations" className="text-sm font-medium text-emerald-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Date &amp; schedule</h1>
      <p className="mt-2 text-slate-600">When should the driver arrive?</p>

      <div className="mt-8 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'pickup', label: 'School pickup' },
            { id: 'dropoff', label: 'School dropoff' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTripType(t.id)}
              className={`rounded-2xl border py-3 text-sm font-semibold ${
                tripType === t.id
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none ring-emerald-600/30 focus:ring-2"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Repeat (optional)</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  recurring.includes(day)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setBookingDraft({ date, time, tripType, recurring });
          navigate('/vehicle-review');
        }}
        className="mt-10 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700"
      >
        Save schedule
      </button>
    </div>
  );
}
