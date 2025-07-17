import { OCRResult, BingoNumber, BingoCard, GridPosition } from '../types';

export class BingoOCRParser {
  private readonly COLUMN_RANGES = {
    B: { min: 1, max: 15 },
    I: { min: 16, max: 30 },
    N: { min: 31, max: 45 },
    G: { min: 46, max: 60 },
    O: { min: 61, max: 75 }
  };

  private readonly GRID_SIZE = 5;
  private readonly FREE_SPACE_ROW = 2; // 0-indexed
  private readonly FREE_SPACE_COL = 2; // 0-indexed

  async callGoogleVisionAPI(imageBase64: string, apiKey: string): Promise<OCRResult[]> {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: imageBase64.split(',')[1]
              },
              features: [
                { type: 'TEXT_DETECTION', maxResults: 50 },
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 50 }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.responses[0].error) {
      throw new Error(result.responses[0].error.message);
    }

    const textAnnotations = result.responses[0].textAnnotations || [];
    
    return textAnnotations.slice(1).map((annotation: any) => ({
      text: annotation.description,
      confidence: annotation.confidence || 0.8,
      vertices: annotation.boundingPoly.vertices
    }));
  }

  private calculateGridPositions(ocrResults: OCRResult[]): GridPosition[] {
    // Sort by Y coordinate to get rows, then by X coordinate to get columns
    const sortedResults = ocrResults
      .filter(result => this.isLikelyNumber(result.text))
      .sort((a, b) => {
        const aY = this.getCenterY(a.vertices);
        const bY = this.getCenterY(b.vertices);
        if (Math.abs(aY - bY) < 20) { // Same row
          return this.getCenterX(a.vertices) - this.getCenterX(b.vertices);
        }
        return aY - bY;
      });

    const gridPositions: GridPosition[] = [];
    let currentRow = 0;
    let currentCol = 0;
    let lastY = -1;

    for (const result of sortedResults) {
      const centerY = this.getCenterY(result.vertices);
      const centerX = this.getCenterX(result.vertices);

      if (lastY === -1 || Math.abs(centerY - lastY) > 20) {
        // New row
        currentRow = Math.floor(gridPositions.length / this.GRID_SIZE);
        currentCol = 0;
        lastY = centerY;
      } else {
        currentCol++;
      }

      if (currentRow < this.GRID_SIZE && currentCol < this.GRID_SIZE) {
        gridPositions.push({
          row: currentRow,
          col: currentCol,
          centerX,
          centerY
        });
      }
    }

    return gridPositions;
  }

  private getCenterX(vertices: { x: number; y: number }[]): number {
    return vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
  }

  private getCenterY(vertices: { x: number; y: number }[]): number {
    return vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
  }

  private isLikelyNumber(text: string): boolean {
    return /\d/.test(text) && text.length <= 6;
  }

  private splitConcatenatedNumbers(text: string): number[] {
    const numbers: number[] = [];
    const cleanText = text.replace(/[^\d]/g, '');
    
    if (cleanText.length === 0) return numbers;
    
    // Try to split based on known patterns
    if (cleanText.length === 4) {
      // Could be two 2-digit numbers
      const first = parseInt(cleanText.substring(0, 2));
      const second = parseInt(cleanText.substring(2, 4));
      if (this.isValidBingoNumber(first) && this.isValidBingoNumber(second)) {
        numbers.push(first, second);
      }
    } else if (cleanText.length === 3) {
      // Could be 1-digit + 2-digit or 2-digit + 1-digit
      const option1 = [parseInt(cleanText[0]), parseInt(cleanText.substring(1))];
      const option2 = [parseInt(cleanText.substring(0, 2)), parseInt(cleanText[2])];
      
      if (option1.every(n => this.isValidBingoNumber(n))) {
        numbers.push(...option1);
      } else if (option2.every(n => this.isValidBingoNumber(n))) {
        numbers.push(...option2);
      }
    } else if (cleanText.length <= 2) {
      const num = parseInt(cleanText);
      if (this.isValidBingoNumber(num)) {
        numbers.push(num);
      }
    }
    
    return numbers;
  }

  private isValidBingoNumber(num: number): boolean {
    return num >= 1 && num <= 75;
  }

  private validateNumberInColumn(number: number, col: number): boolean {
    const columnNames = ['B', 'I', 'N', 'G', 'O'];
    const columnName = columnNames[col] as keyof typeof this.COLUMN_RANGES;
    const range = this.COLUMN_RANGES[columnName];
    return number >= range.min && number <= range.max;
  }

  async parseBingoCard(imageBase64: string, apiKey: string): Promise<BingoCard> {
    const ocrResults = await this.callGoogleVisionAPI(imageBase64, apiKey);
    
    if (ocrResults.length === 0) {
      throw new Error('No text detected in the image');
    }

    const gridPositions = this.calculateGridPositions(ocrResults);
    const numbers: BingoNumber[] = [];
    let freeSpaceContent: string | null = null;
    let totalConfidence = 0;

    // Process each grid position
    for (let row = 0; row < this.GRID_SIZE; row++) {
      for (let col = 0; col < this.GRID_SIZE; col++) {
        // Check if this is the FREE space
        if (row === this.FREE_SPACE_ROW && col === this.FREE_SPACE_COL) {
          const freeSpaceResult = ocrResults.find(result => {
            const centerX = this.getCenterX(result.vertices);
            const centerY = this.getCenterY(result.vertices);
            return this.isInGridPosition(centerX, centerY, row, col, gridPositions);
          });
          
          freeSpaceContent = freeSpaceResult?.text || 'FREE';
          continue;
        }

        // Find OCR result for this grid position
        const resultForPosition = ocrResults.find(result => {
          const centerX = this.getCenterX(result.vertices);
          const centerY = this.getCenterY(result.vertices);
          return this.isInGridPosition(centerX, centerY, row, col, gridPositions);
        });

        if (resultForPosition) {
          const extractedNumbers = this.splitConcatenatedNumbers(resultForPosition.text);
          
          for (const num of extractedNumbers) {
            if (this.validateNumberInColumn(num, col)) {
              numbers.push({
                value: num,
                isOdd: num % 2 === 1,
                row,
                col,
                confidence: resultForPosition.confidence
              });
              totalConfidence += resultForPosition.confidence;
              break; // Only take the first valid number per cell
            }
          }
        }
      }
    }

    const oddsCount = numbers.filter(n => n.isOdd).length;
    const evensCount = numbers.filter(n => !n.isOdd).length;

    return {
      numbers,
      freeSpaceContent,
      oddsCount,
      evensCount,
      totalNumbers: numbers.length,
      confidence: numbers.length > 0 ? totalConfidence / numbers.length : 0
    };
  }

  private isInGridPosition(
    centerX: number,
    centerY: number,
    targetRow: number,
    targetCol: number,
    gridPositions: GridPosition[]
  ): boolean {
    const target = gridPositions.find(pos => pos.row === targetRow && pos.col === targetCol);
    if (!target) return false;

    const distance = Math.sqrt(
      Math.pow(centerX - target.centerX, 2) + Math.pow(centerY - target.centerY, 2)
    );
    
    return distance < 50; // Tolerance for position matching
  }
}