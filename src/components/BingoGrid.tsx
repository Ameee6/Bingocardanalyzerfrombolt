import React from 'react';
import { BingoCard } from '../types';

interface BingoGridProps {
  card: BingoCard;
}

export const BingoGrid: React.FC<BingoGridProps> = ({ card }) => {
  const createGrid = () => {
    const grid: (number | string)[][] = Array(5).fill(null).map(() => Array(5).fill(''));
    
    // Fill in the numbers
    card.numbers.forEach(num => {
      grid[num.row][num.col] = num.value;
    });
    
    // Set FREE space
    grid[2][2] = card.freeSpaceContent || 'FREE';
    
    return grid;
  };

  const grid = createGrid();
  const columns = ['B', 'I', 'N', 'G', 'O'];

  const getCellColor = (value: number | string, row: number, col: number): string => {
    if (row === 2 && col === 2) return 'bg-gray-100 text-gray-600'; // FREE space
    
    if (typeof value === 'number') {
      return value % 2 === 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800';
    }
    
    return 'bg-gray-50 text-gray-400';
  };

  const getLegendColor = (isOdd: boolean): string => {
    return isOdd ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="text-center mb-4">
          <h3 className="text-xl font-bold text-gray-800 mb-2">Bingo Card Analysis</h3>
          <div className="flex justify-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className={`w-4 h-4 rounded ${getLegendColor(false)}`}></div>
              <span>Evens ({card.evensCount})</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-4 h-4 rounded ${getLegendColor(true)}`}></div>
              <span>Odds ({card.oddsCount})</span>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-5 gap-1 mb-4">
          {columns.map((col, idx) => (
            <div key={col} className="h-8 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-bold flex items-center justify-center rounded">
              {col}
            </div>
          ))}
          
          {grid.map((row, rowIdx) =>
            row.map((cell, colIdx) => (
              <div
                key={`${rowIdx}-${colIdx}`}
                className={`h-12 flex items-center justify-center rounded font-semibold text-sm border ${getCellColor(cell, rowIdx, colIdx)}`}
              >
                {cell}
              </div>
            ))
          )}
        </div>
        
        <div className="text-center space-y-2">
          <div className="text-sm text-gray-600">
            Total Numbers: {card.totalNumbers}
          </div>
          <div className="text-xs text-gray-500">
            Confidence: {Math.round(card.confidence * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
};