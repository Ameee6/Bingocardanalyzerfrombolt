# Bingo Card Analyzer

A sophisticated web application that analyzes photos of bingo cards to count odds vs evens numbers for blackout games.

## Features

- **Smart OCR Analysis**: Uses Google Vision API to extract numbers from bingo card photos
- **Robust Parsing**: Handles real-world challenges like concatenated numbers, poor image quality, and extra text
- **Grid Position Detection**: Uses coordinate-based mapping to accurately place numbers in the 5x5 grid
- **FREE Space Handling**: Automatically detects and handles the center FREE space, regardless of content
- **Column Validation**: Ensures numbers are in correct columns (B=1-15, I=16-30, N=31-45, G=46-60, O=61-75)
- **Beautiful UI**: Modern, responsive design with drag-and-drop file upload
- **Real-time Analysis**: Instant results with color-coded odds/evens visualization

## Setup

1. **Get Google Vision API Key**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable the Vision API
   - Create credentials (API Key)
   - Restrict the key to Vision API for security

2. **Environment Configuration**:
   - Copy `.env.example` to `.env`
   - Add your Google Vision API key:
     ```
     REACT_APP_GOOGLE_VISION_API_KEY=your_actual_api_key_here
     ```

3. **Install and Run**:
   ```bash
   npm install
   npm run dev
   ```

## How It Works

### OCR Processing
- Uses both TEXT_DETECTION and DOCUMENT_TEXT_DETECTION for better accuracy
- Handles concatenated numbers (e.g., "6063" becomes "60" and "63")
- Filters out headers, logos, and non-number text

### Grid Detection
- Maps detected text to 5x5 grid positions using bounding box coordinates
- Automatically identifies the center cell as FREE space
- Validates numbers against expected column ranges

### Analysis Features
- Counts odds vs evens (excluding FREE space)
- Displays confidence scores
- Shows detailed grid with color-coded results
- Handles cards with 24 numbers (standard) or 28 numbers (some have numbers in FREE space)

## Technical Architecture

- **Frontend**: React with TypeScript
- **Styling**: Tailwind CSS with responsive design
- **OCR**: Google Vision API integration
- **Icons**: Lucide React
- **Build**: Vite

## Supported Image Formats

- JPG/JPEG
- PNG
- GIF
- BMP
- WebP

## Error Handling

- Invalid API key detection
- Poor image quality warnings
- Network error handling
- OCR parsing failures with retry options

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use this project for personal or commercial purposes.