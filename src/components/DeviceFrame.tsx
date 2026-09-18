import React from 'react';
import { Language } from '../domain/models';

interface DeviceFrameProps {
  children: React.ReactNode;
  language?: Language;
}

export const DeviceFrame: React.FC<DeviceFrameProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#F6FAF8] flex flex-col items-center justify-start selection:bg-teal-300 selection:text-teal-900">
      <div className="w-full max-w-2xl min-h-screen bg-[#F6FAF8] flex flex-col shadow-xs">
        {children}
      </div>
    </div>
  );
};

