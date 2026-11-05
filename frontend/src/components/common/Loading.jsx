import React from 'react';
import { Loader2 } from 'lucide-react';

export const Loading = ({ text = 'Loading data...', fullHeight = false }) => {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-slate-500 py-12 ${
        fullHeight ? 'min-h-[50vh]' : ''
      }`}
    >
      <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
};
