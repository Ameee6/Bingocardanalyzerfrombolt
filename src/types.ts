export interface BingoNumber {
  value: number;
  isOdd: boolean;
  row: number;
  col: number;
  confidence: number;
}

export interface BingoCard {
  numbers: BingoNumber[];
  freeSpaceContent: string | null;
  oddsCount: number;
  evensCount: number;
  totalNumbers: number;
  confidence: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
  vertices: { x: number; y: number }[];
}

export interface GridPosition {
  row: number;
  col: number;
  centerX: number;
  centerY: number;
}