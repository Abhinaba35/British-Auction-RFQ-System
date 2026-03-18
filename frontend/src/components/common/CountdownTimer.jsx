import React from 'react';
import { useCountdown } from '../../hooks/useCountdown';

const CountdownTimer = ({ targetDate, label = 'Closes in', urgent = false, className = '' }) => {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetDate);

  const isUrgent = urgent || (days === 0 && hours === 0 && minutes < 10);

  if (isExpired) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-white/40 text-sm">{label}</span>
        <span className="text-red-400 font-mono font-semibold text-sm">Expired</span>
      </div>
    );
  }

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className={`${className}`}>
      <p className="text-white/40 text-xs uppercase tracking-wider mb-1.5">{label}</p>
      <div className={`flex items-center gap-1.5 ${isUrgent ? 'text-red-400' : 'text-white'}`}>
        {days > 0 && (
          <>
            <TimeBlock value={days} unit="d" urgent={isUrgent} />
            <Colon />
          </>
        )}
        <TimeBlock value={pad(hours)} unit="h" urgent={isUrgent} />
        <Colon />
        <TimeBlock value={pad(minutes)} unit="m" urgent={isUrgent} />
        <Colon />
        <TimeBlock value={pad(seconds)} unit="s" urgent={isUrgent} />
      </div>
    </div>
  );
};

const TimeBlock = ({ value, unit, urgent }) => (
  <div className={`flex flex-col items-center min-w-[2.5rem] px-2 py-1.5 rounded-lg ${
    urgent ? 'bg-red-500/15 border border-red-500/25' : 'bg-white/8 border border-white/10'
  }`}>
    <span className={`font-mono font-bold text-base leading-none ${urgent ? 'text-red-400' : 'text-white'}`}>
      {value}
    </span>
    <span className="text-white/30 text-xs mt-0.5 font-mono">{unit}</span>
  </div>
);

const Colon = () => (
  <span className="text-white/25 font-mono font-bold text-lg mb-2">:</span>
);

export default CountdownTimer;
