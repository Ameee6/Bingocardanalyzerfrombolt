import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="mx-auto w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Analyzing Bingo Card</h3>
        <p className="text-sm text-gray-600 mb-4">
          Processing image and extracting numbers...
        </p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
        </div>
      </div>
    </div>
  );
};