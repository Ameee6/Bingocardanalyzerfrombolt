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
    
    // The first annotation is usually the full text detected, we want individual words/numbers
    return textAnnotations.slice(1).map((annotation: any) => ({
      text: annotation.description,
      confidence: annotation.confidence || 0.8,
      vertices: annotation.boundingPoly.vertices
    }));
  }

  private getCenter(vertices: { x: number; y: number }[]): { x: number; y: number } {
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2
    };
  }

  private getBoundingBox(vertices: { x: number; y: number }[]): { minX: number; minY: number; maxX: number; maxY: number } {
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  }

  private isLikelyNumber(text: string): boolean {
    // Allow strings up to 4 characters that contain digits, but not just symbols
    return /\d/.test(text) && text.length <= 4 && !/^[^\w\s]+$/.test(text);
  }

  private splitConcatenatedNumbers(text: string): number[] {
    const numbers: number[] = [];
    const cleanText = text.replace(/[^\d]/g, ''); // Remove non-digits
    
    if (cleanText.length === 0) return numbers;
    
    // Prioritize 2-digit numbers if they form valid bingo numbers
    if (cleanText.length >= 2) {
      for (let i = 0; i <= cleanText.length - 2; i++) {
        const twoDigit = parseInt(cleanText.substring(i, i + 2));
        if (this.isValidBingoNumber(twoDigit)) {
          numbers.push(twoDigit);
          // If we found a 2-digit number, try to parse the rest of the string
          // This simple approach might need refinement for complex cases like "1234" -> [12, 34]
          // For now, it will find all valid 2-digit numbers.
        }
      }
    }

    // Also consider 1-digit numbers if no 2-digit numbers were found or as standalone
    for (let i = 0; i < cleanText.length; i++) {
      const oneDigit = parseInt(cleanText[i]);
      if (this.isValidBingoNumber(oneDigit) && !numbers.includes(oneDigit)) { // Avoid duplicates if 1-digit is part of 2-digit
        numbers.push(oneDigit);
      }
    }

    // Sort and filter unique valid numbers
    return Array.from(new Set(numbers.filter(n => this.isValidBingoNumber(n)))).sort((a, b) => a - b);
  }

  private isValidBingoNumber(num: number): boolean {
    return num >= 1 && num <= 75 && !isNaN(num);
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

    // Find the overall bounding box of the card using the first (largest) text annotation
    // Or, if the first annotation is not reliable, find the min/max of all relevant annotations
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Use all OCR results to determine the overall card boundaries
    ocrResults.forEach(result => {
      const bbox = this.getBoundingBox(result.vertices);
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    });

    // Calculate cell dimensions based on the overall card bounding box
    const cellWidth = (maxX - minX) / this.GRID_SIZE;
    const cellHeight = (maxY - minY) / this.GRID_SIZE;

    // Initialize a 5x5 grid to hold OCR results for each cell
    const gridCells: OCRResult[][][] = Array(this.GRID_SIZE).fill(null).map(() => 
      Array(this.GRID_SIZE).fill(null).map(() => [])
    );

    // Map OCR results to their respective grid cells
    ocrResults.forEach(result => {
      const center = this.getCenter(result.vertices);
      const col = Math.floor((center.x - minX) / cellWidth);
      const row = Math.floor((center.y - minY) / cellHeight);

      if (row >= 0 && row < this.GRID_SIZE && col >= 0 && col < this.GRID_SIZE) {
        gridCells[row][col].push(result);
      }
    });

    const numbers: BingoNumber[] = [];
    let freeSpaceContent: string | null = null;
    let totalConfidence = 0;
    let detectedNumberCount = 0;

    // Process each cell in the 5x5 grid
    for (let row = 0; row < this.GRID_SIZE; row++) {
      for (let col = 0; col < this.GRID_SIZE; col++) {
        const cellResults = gridCells[row][col];
        
        // Sort results by confidence to prioritize more confident detections
        cellResults.sort((a, b) => b.confidence - a.confidence);

        let foundValidNumberInCell = false;

        // Handle FREE space specifically
        if (row === this.FREE_SPACE_ROW && col === this.FREE_SPACE_COL) {
          if (cellResults.length > 0) {
            // Take the text from the most confident result for free space content
            freeSpaceContent = cellResults[0].text.trim();
          } else {
            freeSpaceContent = 'FREE'; // Default if nothing detected
          }
          // IMPORTANT: Do NOT add any number from the free space to the 'numbers' array
          // This ensures it doesn't count towards odds/evens for game analysis.
          continue; 
        }

        // Process other 24 cells
        for (const result of cellResults) {
          const extractedNumbers = this.splitConcatenatedNumbers(result.text);
          
          for (const num of extractedNumbers) {
            if (this.validateNumberInColumn(num, col)) {
              numbers.push({
                value: num,
                isOdd: num % 2 === 1,
                row,
                col,
                confidence: result.confidence
              });
              totalConfidence += result.confidence;
              detectedNumberCount++;
              foundValidNumberInCell = true;
              break; // Only take the first valid number per cell
            }
          }
          if (foundValidNumberInCell) break; // Move to next cell if a valid number was found
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
      totalNumbers: detectedNumberCount, // Use detectedNumberCount for total numbers
      confidence: detectedNumberCount > 0 ? totalConfidence / detectedNumberCount : 0
    };
  }
}

// ... (rest of the imports and class definition)

export class BingoOCRParser {
  // ... (rest of your class properties and methods)

  async parseBingoCard(imageBase64: string, apiKey: string): Promise<BingoCard> {
    const ocrResults = await this.callGoogleVisionAPI(imageBase64, apiKey);
    
    // Add this line to log the raw OCR results
    console.log('Raw OCR Results:', ocrResults); 
    
    if (ocrResults.length === 0) {
      throw new Error('No text detected in the image');
    }

    // ... (rest of your parseBingoCard method)
  }
}
