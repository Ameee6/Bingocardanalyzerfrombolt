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

  // Enhanced OCR character corrections
  private readonly OCR_CORRECTIONS = {
    'O': '0', 'o': '0', 'Q': '0',
    'l': '1', 'I': '1', '|': '1', 'i': '1',
    'Z': '2', 'z': '2',
    'S': '5', 's': '5',
    'G': '6', 'b': '6',
    'T': '7', 't': '7',
    'B': '8', 'g': '9'
  };

  async callGoogleVisionAPI(imageBase64: string, apiKey: string): Promise<OCRResult[]> {
    console.log("Starting OCR analysis...");
    
    // Validate and extract base64 content
    console.log("=== BASE64 VALIDATION ===");
    console.log("Full base64 length:", imageBase64.length);
    console.log("Base64 starts with:", imageBase64.substring(0, 50));
    console.log("Has data URL prefix:", imageBase64.startsWith('data:'));
    
    const base64Parts = imageBase64.split(',');
    console.log("Split parts count:", base64Parts.length);
    
    if (base64Parts.length !== 2) {
      throw new Error('Invalid image data format. Expected data URL with base64 content.');
    }
    
    const base64Content = base64Parts[1];
    console.log("Extracted base64 content length:", base64Content.length);
    console.log("Base64 content starts with:", base64Content.substring(0, 50));
    
    if (!base64Content || base64Content.length === 0) {
      throw new Error('Empty base64 content extracted from image data.');
    }
    
    // Validate base64 format (basic check)
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64Content)) {
      throw new Error('Invalid base64 format detected.');
    }
    
    // Construct the request payload
    const requestPayload = {
      requests: [
        {
          image: {
            content: base64Content
          },
          features: [
            { type: 'TEXT_DETECTION', maxResults: 100 },
            { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 50 }
          ],
          imageContext: {
            textDetectionParams: {
              enableTextDetectionConfidenceScore: true,
              includeTextDetectionConfidenceScore: true
            },
            languageHints: ["en"]
          }
        }
      ]
    };
    
    console.log("=== REQUEST PAYLOAD VALIDATION ===");
    console.log("Request payload structure:", JSON.stringify(requestPayload, null, 2));
    console.log("Payload size:", JSON.stringify(requestPayload).length, "bytes");
    
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload)
      }
    );

    console.log("=== API RESPONSE ===");
    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const responseText = await response.text();
      console.log("Error response body:", responseText);
      
      if (response.status === 429) {
        throw new Error("API quota exceeded. Please try again later.");
      } else if (response.status === 403) {
        throw new Error("Invalid API key. Please check your configuration.");
      } else if (response.status === 400) {
        throw new Error(`Bad request to Vision API. Response: ${responseText}`);
      } else {
        throw new Error(`Vision API error: ${response.status}. Response: ${responseText}`);
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

  private correctOCRErrors(text: string): string {
    let correctedText = text;
    
    // Apply common OCR corrections
    Object.entries(this.OCR_CORRECTIONS).forEach(([wrong, right]) => {
      correctedText = correctedText.replace(new RegExp(wrong, 'g'), right);
    });
    
    return correctedText;
  }

  private extractAllPossibleNumbers(text: string): number[] {
    const numbers = new Set<number>();
    
    // Strategy 1: Direct number extraction
    const directMatches = text.match(/\d{1,2}/g) || [];
    directMatches.forEach(match => {
      const num = parseInt(match);
      if (this.isValidBingoNumber(num)) numbers.add(num);
    });
    
    // Strategy 2: With OCR correction
    const corrected = this.correctOCRErrors(text);
    const correctedMatches = corrected.match(/\d{1,2}/g) || [];
    correctedMatches.forEach(match => {
      const num = parseInt(match);
      if (this.isValidBingoNumber(num)) numbers.add(num);
    });
    
    // Strategy 3: Character-by-character analysis
    for (let i = 0; i < text.length; i++) {
      // Try 1-digit
      if (/\d/.test(text[i])) {
        const num = parseInt(text[i]);
        if (this.isValidBingoNumber(num)) numbers.add(num);
      }
      
      // Try 2-digit
      if (i < text.length - 1 && /\d/.test(text[i]) && /\d/.test(text[i + 1])) {
        const num = parseInt(text.substring(i, i + 2));
        if (this.isValidBingoNumber(num)) numbers.add(num);
      }
    }
    
    return Array.from(numbers);
  }

  private shouldProcessOCRResult(result: OCRResult): boolean {
    const text = result.text.trim();
    const confidence = result.confidence || 0;
    
    // Special cases - always allow FREE space content
    if (text.toUpperCase().match(/^(FREE|SPACE)$/)) {
      return true;
    }
    
    // Skip column headers
    if (text.toUpperCase().match(/^[BINGO]$/)) {
      return false;
    }
    
    // Much more lenient for low-confidence scenarios
    if (confidence < 0.3) return false;
    
    // If we have digits, be more permissive
    if (/\d/.test(text)) {
      const numbers = this.extractAllPossibleNumbers(text);
      return numbers.length > 0;
    }
    
    return false;
  }

  private splitConcatenatedNumbers(text: string): number[] {
    // Use the enhanced extraction method
    return this.extractAllPossibleNumbers(text);
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

  private findHeaders(ocrResults: OCRResult[]): OCRResult[] {
    return ocrResults.filter(r => 
      r.text.toUpperCase().match(/^[BINGO]$/)
    ).sort((a, b) => {
      const centerA = this.getCenter(a.vertices);
      const centerB = this.getCenter(b.vertices);
      return centerA.x - centerB.x;
    });
  }

  private clusterByDensity(ocrResults: OCRResult[]): OCRResult[] {
    // Simple density clustering - group results by proximity
    // This is a simplified implementation for now
    return ocrResults.filter(result => {
      const numbers = this.extractAllPossibleNumbers(result.text);
      return numbers.length > 0;
    });
  }

  private gridFromClusters(clusters: OCRResult[]): OCRResult[][][] {
    // Simplified clustering approach - fallback to bounding box method
    return this.gridFromBoundingBoxRelaxed(clusters);
  }

  private gridFromBoundingBoxRelaxed(ocrResults: OCRResult[]): OCRResult[][][] {
    const grid: OCRResult[][][] = Array(5).fill(null).map(() => 
      Array(5).fill(null).map(() => [])
    );
    
    // Calculate bounds with 10% padding
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ocrResults.forEach(result => {
      const bounds = this.getBoundingBox(result.vertices);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });
    
    const padding = 0.1;
    const width = maxX - minX;
    const height = maxY - minY;
    minX -= width * padding;
    minY -= height * padding;
    maxX += width * padding;
    maxY += height * padding;
    
    const cellWidth = (maxX - minX) / 5;
    const cellHeight = (maxY - minY) / 5;
    
    ocrResults.forEach(result => {
      const center = this.getCenter(result.vertices);
      const col = Math.floor((center.x - minX) / cellWidth);
      const row = Math.floor((center.y - minY) / cellHeight);
      
      // Allow slight overflow with clamping
      const clampedRow = Math.max(0, Math.min(4, row));
      const clampedCol = Math.max(0, Math.min(4, col));
      
      grid[clampedRow][clampedCol].push(result);
    });
    
    return grid;
  }

  private detectGridWithMultipleStrategies(ocrResults: OCRResult[]): OCRResult[][][] {
    // Strategy 1: Header-based detection
    const headers = this.findHeaders(ocrResults);
    if (headers.length >= 3) {
      console.log("Using header-based grid detection");
      return this.gridFromHeaders(headers, ocrResults);
    }
    
    // Strategy 2: Density clustering
    console.log("Using density-based clustering");
    const clusters = this.clusterByDensity(ocrResults);
    if (clusters.length >= 20) {
      return this.gridFromClusters(clusters);
    }
    
    // Strategy 3: Relaxed bounding box (current method with more tolerance)
    console.log("Using relaxed bounding box method");
    return this.gridFromBoundingBoxRelaxed(ocrResults);
  }

  private gridFromHeaders(headers: OCRResult[], ocrResults: OCRResult[]): OCRResult[][][] {
    const grid: OCRResult[][][] = Array(5).fill(null).map(() => 
      Array(5).fill(null).map(() => [])
    );

    // Use header positions to determine column boundaries
    const boundaries = headers.map(header => this.getCenter(header.vertices).x);
    const cellWidth = boundaries.length > 1 ? 
      (boundaries[boundaries.length - 1] - boundaries[0]) / (boundaries.length - 1) : 100;
    
    // Find overall Y boundaries
    let minY = Infinity, maxY = -Infinity;
    ocrResults.forEach(result => {
      const bounds = this.getBoundingBox(result.vertices);
      minY = Math.min(minY, bounds.minY);
      maxY = Math.max(maxY, bounds.maxY);
    });
    
    const cellHeight = (maxY - minY) / this.GRID_SIZE;
    const minX = boundaries[0] - cellWidth / 2;

    ocrResults.forEach(result => {
      const center = this.getCenter(result.vertices);
      const col = Math.floor((center.x - minX) / cellWidth);
      const row = Math.floor((center.y - minY) / cellHeight);

      if (row >= 0 && row < this.GRID_SIZE && col >= 0 && col < this.GRID_SIZE) {
        grid[row][col].push(result);
      }
    });

    return grid;
  }

  private logOCRAnalysis(ocrResults: OCRResult[], filteredResults: OCRResult[]): void {
    console.log("=== OCR ANALYSIS DEBUG ===");
    console.log(`Raw results: ${ocrResults.length}`);
    console.log(`Filtered results: ${filteredResults.length}`);
    
    console.log("\nConfidence distribution:");
    const confidences = ocrResults.map(r => r.confidence || 0);
    console.log(`Min: ${Math.min(...confidences).toFixed(2)}, Max: ${Math.max(...confidences).toFixed(2)}`);
    
    console.log("\nFiltered out results:");
    ocrResults.forEach(result => {
      if (!this.shouldProcessOCRResult(result)) {
        console.log(`REJECTED: "${result.text}" (conf: ${(result.confidence || 0).toFixed(2)})`);
      }
    });
    
    console.log("\nAccepted results:");
    filteredResults.forEach(result => {
      const numbers = this.extractAllPossibleNumbers(result.text);
      console.log(`ACCEPTED: "${result.text}" -> numbers: [${numbers.join(', ')}] (conf: ${(result.confidence || 0).toFixed(2)})`);
    });
  }

  async parseBingoCard(imageBase64: string, apiKey: string): Promise<BingoCard> {
    try {
      const rawOcrResults = await this.callGoogleVisionAPI(imageBase64, apiKey);
      
      // Filter OCR results to only include likely numbers or FREE space content
      const ocrResults = rawOcrResults.filter(result => this.shouldProcessOCRResult(result));
      
      console.log('Filtered OCR Results:', ocrResults.length, 'from', rawOcrResults.length, 'total');
      
      // Add debug logging
      this.logOCRAnalysis(rawOcrResults, ocrResults);
      
      if (ocrResults.length === 0) {
        throw new Error('No valid text detected in the image. Please ensure the image is clear and well-lit.');
      }

      // Use enhanced grid detection with multiple strategies
      const gridCells = this.detectGridWithMultipleStrategies(ocrResults);

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
            const extractedNumbers = this.extractAllPossibleNumbers(result.text);
            
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

      // If we got very few numbers, suggest trying alternative detection
      if (detectedNumberCount < 15) {
        console.warn(`Low detection rate (${detectedNumberCount}/24). Consider image quality improvements.`);
      }

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