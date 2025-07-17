import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { BingoGrid } from './components/BingoGrid';
import { ErrorMessage } from './components/ErrorMessage';
import { LoadingSpinner } from './components/LoadingSpinner';
import { BingoOCRParser } from './utils/ocrParser';
import { BingoCard } from './types';
import { Target } from 'lucide-react';

function App() {
  // Force Netlify rebuild v2 - trigger fresh build to pick up environment variables
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentCard, setCurrentCard] = useState<BingoCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  const parser = new BingoOCRParser();

  const handleImageUpload = async (imageBase64: string) => {
    const apiKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY;
    
    if (!apiKey) {
      setError('Google Vision API key not found. Please set VITE_GOOGLE_VISION_API_KEY environment variable.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setCurrentCard(null);
    setCurrentImage(imageBase64);

    try {
      const card = await parser.parseBingoCard(imageBase64, apiKey);
      setCurrentCard(card);
      
      if (card.totalNumbers < 20) {
        setError('Warning: Only detected ' + card.totalNumbers + ' numbers. Image quality may be poor.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze bingo card');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = () => {
    if (currentImage) {
      handleImageUpload(currentImage);
    }
  };

  const resetApp = () => {
    setCurrentCard(null);
    setError(null);
    setCurrentImage(null);
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <Target className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Bingo Card Analyzer
            </h1>
          </div>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Upload a photo of your bingo card and get instant analysis of odds vs evens for blackout games
          </p>
        </header>

        <div className="space-y-8">
          {!currentCard && !error && !isProcessing && (
            <FileUpload onImageUpload={handleImageUpload} isProcessing={isProcessing} />
          )}

          {isProcessing && <LoadingSpinner />}

          {error && (
            <ErrorMessage error={error} onRetry={handleRetry} />
          )}

          {currentCard && (
            <div className="space-y-6">
              <BingoGrid card={currentCard} />
              <div className="text-center">
                <button
                  onClick={resetApp}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Analyze Another Card
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="mt-16 text-center text-sm text-gray-500">
          <p>
            Powered by Google Vision API • Built for blackout bingo analysis
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;