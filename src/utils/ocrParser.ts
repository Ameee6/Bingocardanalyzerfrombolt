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

  // Common OCR character corrections
  private readonly OCR_CORRECTIONS = {
    'O': '0', 'o': '0', 'l': '1', 'I': '1', 
    'S': '5', 's': '5', 'G': '6', 'B': '8'
  };

  async callGoogleVisionAPI(imageBase64: string, apiKey: string): Promise<OCRResult[]> {
    console.log("Starting OCR analysis...");
    
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
                { type: 'TEXT_DETECTION', maxResults: 100 },
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 100 }
              ],
              imageContext: {
                textDetectionParams: {
                  enableTextDetectionConfidenceScore: true
                }
              }
            }
          ]
        })
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("API quota exceeded. Please try again later.");
      } else if (response.status === 403) {
        throw new Error("Invalid API key. Please check your configuration.");
      } else {
        throw new Error(`Vision API error: ${response.status}`);
      }
    }

    const result = await response.json();
    
    if (result.responses[0].error) {
      throw new Error(result.responses[0].error.message);
    }

    const textAnnotations = result.responses[0].textAnnotations || [];
    
    // The first annotation is usually the full text detected, we want individual words/numbers
    const ocrResults = textAnnotations.slice(1).map((annotation: any) => ({
      text: annotation.description,
      confidence: annotation.confidence || 0.8,
      vertices: annotation.boundingPoly.vertices
    }));

    console.log(`Raw OCR results: ${ocrResults.length} items`);
    if (ocrResults.length > 0) {
      console.log("Sample results:", ocrResults.slice(0, 5));
      const confidences = ocrResults.map(r => r.confidence || 0);
      console.log("Confidence range:", Math.min(...confidences).toFixed(2), "to", Math.max(...confidences).toFixed(2));
    }

    return ocrResults;
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

  private shouldProcessOCRResult(result: OCRResult): boolean {
    const text = result.text.trim();
    const confidence = result.confidence || 0;
    
    // Special cases - always allow FREE space content
    if (text.toUpperCase() === 'FREE' || text.toUpperCase() === 'SPACE') {
      return true;
    }
    
    // Skip column headers
    if (text.toUpperCase().match(/^[BINGO]$/)) {
      return false;
    }
    
    // More lenient confidence threshold
    if (confidence < 0.5) {
      return false;
    }
    
    // Check for numbers (including partial OCR errors)
    const hasDigits = /\d/.test(text);
    if (!hasDigits) {
      return false;
    }
    
    const cleanNumber = text.replace(/[^\d]/g, "");
    
    // Allow 1-3 digit sequences (handles OCR errors better)
    if (cleanNumber.length >= 1 && cleanNumber.length <= 3) {
      const num = parseInt(cleanNumber);
      return num >= 1 && num <= 75;
    }
    
    // Also allow 4-digit sequences for concatenated numbers
    if (cleanNumber.length === 4) {
      return true;
    }
    
    return false;
  }

  private correctOCRErrors(text: string): string {
    let correctedText = text;
    
    // Apply common OCR corrections
    Object.entries(this.OCR_CORRECTIONS).forEach(([wrong, right]) => {
      correctedText = correctedText.replace(new RegExp(wrong, 'g'), right);
    });
    
    return correctedText;
  }

  private extractNumbers(text: string): number[] {
    // First apply OCR corrections
    const correctedText = this.correctOCRErrors(text);
    
    // Extract all possible numbers
    const numbers: number[] = [];
    const matches = correctedText.match(/\d+/g) || [];
    
    matches.forEach(match => {
      const num = parseInt(match);
      if (this.isValidBingoNumber(num)) {
        numbers.push(num);
      }
    });
    
    return numbers;
  }

  private splitConcatenatedNumbers(text: string): number[] {
    // First try the enhanced extraction method
    const extractedNumbers = this.extractNumbers(text);
    if (extractedNumbers.length > 0) {
      return extractedNumbers;
    }
    
    // Fallback to original logic for complex cases
    const cleanText = text.replace(/[^\d]/g, '');
    
    if (cleanText.length === 0) return [];
    
    // Find all possible numbers with their positions
    const candidates: { value: number; start: number; end: number; length: number }[] = [];
    
    // Find 2-digit numbers first (higher priority)
    for (let i = 0; i <= cleanText.length - 2; i++) {
      const twoDigit = parseInt(cleanText.substring(i, i + 2));
      if (this.isValidBingoNumber(twoDigit)) {
        candidates.push({
          value: twoDigit,
          start: i,
          end: i + 2,
          length: 2
        });
      }
    }
    
    // Find 1-digit numbers
    for (let i = 0; i < cleanText.length; i++) {
      const oneDigit = parseInt(cleanText[i]);
      if (this.isValidBingoNumber(oneDigit)) {
        candidates.push({
          value: oneDigit,
          start: i,
          end: i + 1,
          length: 1
        });
      }
    }
    
    // Sort candidates: longer numbers first, then by position
    candidates.sort((a, b) => {
      if (a.length !== b.length) {
        return b.length - a.length; // Longer numbers first
      }
      return a.start - b.start; // Earlier position first
    });
    
    // Select non-overlapping numbers, prioritizing longer ones
    const selectedNumbers: number[] = [];
    const usedPositions = new Set<number>();
    
    for (const candidate of candidates) {
      // Check if this candidate overlaps with any already selected positions
      let hasOverlap = false;
      for (let pos = candidate.start; pos < candidate.end; pos++) {
        if (usedPositions.has(pos)) {
          hasOverlap = true;
          break;
        }
      }
      
      if (!hasOverlap) {
        selectedNumbers.push(candidate.value);
        // Mark all positions used by this candidate
        for (let pos = candidate.start; pos < candidate.end; pos++) {
          usedPositions.add(pos);
        }
      }
    }
    
    // Return unique numbers sorted by value
    return Array.from(new Set(selectedNumbers)).sort((a, b) => a - b);
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

  private detectGridStructure(ocrResults: OCRResult[]): { useHeaders: boolean; columnBoundaries?: number[]; rowBoundaries?: number[] } {
    // Find potential header row (B-I-N-G-O)
    const headers = ocrResults.filter(r => 
      r.text.toUpperCase().match(/^[BINGO]$/)
    ).sort((a, b) => {
      const centerA = this.getCenter(a.vertices);
      const centerB = this.getCenter(b.vertices);
      return centerA.x - centerB.x;
    });
    
    console.log(`Found ${headers.length} potential column headers`);
    
    // Use headers to establish column boundaries if we have at least 3
    if (headers.length >= 3) {
      const columnBoundaries: number[] = [];
      headers.forEach(header => {
        const center = this.getCenter(header.vertices);
        columnBoundaries.push(center.x);
      });
      
      console.log("Using header-based grid detection");
      return { useHeaders: true, columnBoundaries };
    }
    
    console.log("Falling back to clustering-based grid detection");
    return { useHeaders: false };
  }

  async parseBingoCard(imageBase64: string, apiKey: string): Promise<BingoCard> {
    try {
      const rawOcrResults = await this.callGoogleVisionAPI(imageBase64, apiKey);
      
      // Filter OCR results to only include likely numbers or FREE space content
      const ocrResults = rawOcrResults.filter(result => this.shouldProcessOCRResult(result));
      
      console.log('Filtered OCR Results:', ocrResults.length, 'from', rawOcrResults.length, 'total');
      
      if (ocrResults.length === 0) {
        throw new Error('No valid text detected in the image. Please ensure the image is clear and well-lit.');
      }

      // Detect grid structure
      const gridStructure = this.detectGridStructure(rawOcrResults);

      // Find the overall bounding box of the card
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      // Use all OCR results to determine the overall card boundaries
      ocrResults.forEach(result => {
        const bbox = this.getBoundingBox(result.vertices);
        minX = Math.min(minX, bbox.minX);
        minY = Math.min(minY, bbox.minY);
        maxX = Math.max(maxX, bbox.maxX);
        maxY = Math.max(maxY, bbox.maxY);
      });

      // Calculate cell dimensions
      let cellWidth: number;
      let cellHeight: number;
      
      if (gridStructure.useHeaders && gridStructure.columnBoundaries) {
        // Use header positions to determine column widths
        const boundaries = gridStructure.columnBoundaries;
        cellWidth = (boundaries[boundaries.length - 1] - boundaries[0]) / (boundaries.length - 1);
        cellHeight = (maxY - minY) / this.GRID_SIZE;
        
        // Adjust minX to align with leftmost header
        minX = boundaries[0] - cellWidth / 2;
      } else {
        // Fallback to uniform grid
        cellWidth = (maxX - minX) / this.GRID_SIZE;
        cellHeight = (maxY - minY) / this.GRID_SIZE;
      }

      console.log(`Grid dimensions: ${cellWidth.toFixed(1)} x ${cellHeight.toFixed(1)}`);

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

          // Handle FREE space specifically
          if (row === this.FREE_SPACE_ROW && col === this.FREE_SPACE_COL) {
            if (cellResults.length > 0) {
              // Take the text from the most confident result for free space content
              freeSpaceContent = cellResults[0].text.trim();
            } else {
              freeSpaceContent = 'FREE'; // Default if nothing detected
            }
            // IMPORTANT: Do NOT add any number from the free space to the 'numbers' array
            continue; 
          }

          // Process other 24 cells - collect all valid candidates first
          const cellCandidates: BingoNumber[] = [];
          
          for (const result of cellResults) {
            const extractedNumbers = this.splitConcatenatedNumbers(result.text);
            
            for (const num of extractedNumbers) {
              if (this.validateNumberInColumn(num, col)) {
                cellCandidates.push({
                  value: num,
                  isOdd: num % 2 === 1,
                  row,
                  col,
                  confidence: result.confidence
                });
              }
            }
          }
          
          // Select the best candidate (highest confidence) for this cell
          if (cellCandidates.length > 0) {
            // Sort by confidence (highest first)
            cellCandidates.sort((a, b) => b.confidence - a.confidence);
            const bestCandidate = cellCandidates[0];
            
            numbers.push(bestCandidate);
            totalConfidence += bestCandidate.confidence;
            detectedNumberCount++;
          }
        }
      }

      const oddsCount = numbers.filter(n => n.isOdd).length;
      const evensCount = numbers.filter(n => !n.isOdd).length;

      console.log(`Analysis complete: ${detectedNumberCount} numbers detected (${oddsCount} odds, ${evensCount} evens)`);

      return {
        numbers,
        freeSpaceContent,
        oddsCount,
        evensCount,
        totalNumbers: detectedNumberCount,
        confidence: detectedNumberCount > 0 ? totalConfidence / detectedNumberCount : 0
      };
      
    } catch (error) {
      console.error("OCR Error Details:", error);
      
      // Provide specific error messages
      if (error instanceof Error) {
        if (error.message.includes("quota")) {
          throw new Error("API quota exceeded. Please try again later.");
        } else if (error.message.includes("key")) {
          throw new Error("Invalid API key. Please check your configuration.");
        } else {
          throw new Error(`OCR failed: ${error.message}`);
        }
      } else {
        throw new Error('Failed to analyze bingo card');
      }
    }
  }
}