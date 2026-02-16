# Code2Node

**Visualize your codebase as interactive node graphs**

Code2Node is a powerful code visualization tool that transforms your source code into interactive, navigable node graphs. Instantly understand code structure, relationships, and dependencies across multiple programming languages.

![Code2Node Banner](https://img.shields.io/badge/version-1.0.0-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![React](https://img.shields.io/badge/React-19.2-blue) ![License](https://img.shields.io/badge/license-ISC-green)

## ✨ Features

### 🎯 Multi-Language Support
- **TypeScript/JavaScript**: Classes, interfaces, functions, enums
- **Python**: Classes, functions, methods, decorators
- **C++**: Classes, structs, functions, enums
- Extensible parser architecture for adding more languages

### 🔍 Smart Visualization
- **Interactive Node Graph**: Pan, zoom, and navigate your codebase visually
- **Automatic Layout**: Dagre-based graph layout with hierarchical organization
- **Color-Coded Nodes**: Different colors for classes, functions, interfaces, enums, etc.
- **Connection Highlighting**: See inheritance, imports, calls, and references

### 🎨 Advanced Views
- **Connections Mode (Focus Mode)**: Highlight a single node and its direct connections
- **Code Viewer**: View source code with dependency highlighting and interactive navigation
  - Line-by-line dependency references
  - Clickable line numbers to jump to definitions
  - Arrow-key cycling through dependency usages
  - Copy functionality with context menu
- **Expert Mode**: Fullscreen canvas with minimal UI for presentations
- **Minimap**: Bird's-eye view for large codebases

### 🔎 Powerful Filtering
- **Search**: Find nodes by name with real-time filtering
- **Type Filters**: Show/hide classes, functions, interfaces, enums, files
- **Keyboard-Driven**: Number keys (1-5) to toggle filters instantly

### ⚡ Developer-Friendly
- **Real-time Scanning**: Live progress updates while scanning projects
- **IDE Integration**: Open files directly in VS Code via keyboard shortcut
- **Extensive Keyboard Shortcuts**: Navigate without touching the mouse
- **Responsive UI**: Resizable panels, collapsible sections

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ (with npm)
- **Git** (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/code2node.git
cd code2node

# Install dependencies
npm install
```

### Running the Application

```bash
# Start both server and client in development mode
npm run dev

# The app will open at http://localhost:5173
# Server runs on http://localhost:3001
```

### Building for Production

```bash
# Build the client
npm run build

# Serve the built app (you'll need to serve the dist/ folder)
```

## 📖 Usage

### 1. Scan a Project
- Enter the absolute path to your project directory
- Click **Scan** or press `Enter`
- Watch the real-time progress as Code2Node analyzes your codebase

### 2. Explore the Graph
- **Pan**: Click and drag on the canvas
- **Zoom**: Mouse wheel, or `+`/`-` keys
- **Select Node**: Click any node to see details
- **Focus Node**: Press `F` to zoom to selected node, or `F` without selection to fit all

### 3. Navigate with Keyboard

#### Canvas Navigation
- `F` - Focus selected node / Fit all nodes
- `C` - Toggle connections mode (focus selected node's connections)
- `V` - View code for selected node
- `O` - Open selected file in IDE
- `S` - Focus search bar
- `E` - Toggle Expert Mode (fullscreen)
- `Esc` - Exit connections/focus mode
- `Arrow Keys` - Pan the canvas
- `+` / `-` - Zoom in/out

#### Filters (Toggle)
- `1` - Classes
- `2` - Functions
- `3` - Files
- `4` - Interfaces
- `5` - Enums

#### Code Viewer
- `Esc` - Close code viewer
- `Ctrl+C` - Copy selected code
- `↑` / `↓` - Cycle through lines of selected dependency

### 4. View Code with Dependencies
- Select a node in connections mode
- Press `V` to open the Code Viewer
- See highlighted lines where dependencies are referenced
- Click dependency names to scroll to their first usage
- Click line numbers to view specific occurrences
- Use `↑`/`↓` arrows to cycle through usage lines

### 5. Open Files in Your IDE
- Set your IDE path in Settings (e.g., `code` for VS Code)
- Select a node and press `O` to open the file at the exact line

## 🏗️ Project Structure

```
code2node/
├── server/              # Node.js backend
│   ├── index.ts         # Express server with API routes
│   ├── scanner.ts       # File system scanner
│   └── parsers/         # Language parsers
│       ├── base.ts      # Base parser utilities
│       ├── index.ts     # Parser registry
│       ├── typescript.ts
│       ├── python.ts
│       └── cpp.ts
├── src/                 # React frontend
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Entry point
│   ├── store.ts         # Zustand state management
│   ├── api.ts           # API client
│   ├── layout.ts        # Graph layout with Dagre
│   ├── styles.css       # Global styles
│   └── components/      # React components
│       ├── FlowCanvas.tsx       # Main graph canvas
│       ├── CodeViewer.tsx       # Code viewer modal
│       ├── Sidebar.tsx          # Left sidebar
│       ├── NodeDetails.tsx      # Right panel
│       ├── WelcomeScreen.tsx    # Initial screen
│       ├── ScanProgress.tsx     # Progress overlay
│       └── nodes/
│           └── CodeNode.tsx     # Custom node component
├── shared/
│   └── types.ts         # Shared TypeScript types
├── tests/               # Test suite
│   ├── scanner.test.ts  # Scanner tests
│   └── parsers.test.ts  # Parser tests
├── sample/              # Sample code for testing
│   ├── animals.py
│   └── models.ts
├── package.json
├── tsconfig.json        # TypeScript config
├── vite.config.ts       # Vite bundler config
├── vitest.config.ts     # Vitest test config
└── README.md
```

## 🧪 Testing

The project uses **Vitest** for unit testing.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Coverage
- ✅ **Scanner**: Directory traversal, file discovery, filtering
- ✅ **Parsers**: TypeScript, Python, C++ syntax parsing
- ✅ **Edge Detection**: Inheritance, imports, references
- ✅ **Store**: State management (Zustand)
- ✅ **Layout**: Graph layout utilities
- ✅ **API Client**: Backend communication

## 🎨 Architecture

### Frontend (React + TypeScript)
- **React Flow**: Graph rendering and interactions
- **Zustand**: Lightweight state management
- **Dagre**: Automatic graph layout algorithm
- **Vite**: Fast development and building

### Backend (Node.js + Express)
- **Express**: REST API and Server-Sent Events
- **Regex-Based Parsers**: Fast, dependency-free code analysis
- **File System Scanner**: Recursive directory traversal with filters

### Data Flow
1. User inputs project path
2. Frontend sends scan request to backend via SSE
3. Backend recursively scans directory, parses files
4. Parser extracts nodes (classes, functions) and edges (inheritance, calls)
5. Backend streams progress updates
6. Frontend receives parsed graph and renders with React Flow
7. User interacts with graph, views code, navigates relationships

## 🔧 Development

### Tech Stack
- **Frontend**: React 19, TypeScript 5.9, @xyflow/react
- **Backend**: Node.js, Express 5, TypeScript
- **State**: Zustand 5
- **Layout**: Dagre
- **Testing**: Vitest, @testing-library/react
- **Build**: Vite 7

### Adding a New Language Parser

1. Create a new parser in `server/parsers/`:

```typescript
import { BaseParser } from './base.js';

export class MyLanguageParser extends BaseParser {
  parse(code: string, filePath: string) {
    const result = this.initParse(filePath);
    
    // Your parsing logic here
    // Use this.addNode() and this.addEdge()
    
    return result;
  }
}
```

2. Register it in `server/parsers/index.ts`:

```typescript
case '.mylang':
  return new MyLanguageParser();
```

3. Add tests in `tests/parsers.test.ts`

### Adding New Features
1. Update types in `shared/types.ts`
2. Modify server logic in `server/`
3. Update frontend components in `src/components/`
4. Update store actions in `src/store.ts`
5. Add tests in `tests/`

## 🎯 Roadmap

- [ ] Support for more languages (Java, Go, Rust, C#)
- [ ] Call graph visualization
- [ ] Export graphs as SVG/PNG
- [ ] Semantic code search
- [ ] Git integration (show changed files)
- [ ] Dependency cycle detection
- [ ] Code metrics (complexity, line count)
- [ ] Custom themes and color schemes
- [ ] Plugin system for custom parsers

## 📝 License

ISC License - see LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🐛 Known Issues

- Large projects (>5000 files) may take time to scan
- Very deep inheritance chains may affect layout
- Some edge cases in regex-based parsing may miss complex syntax

## 📧 Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Made with ❤️ using React, TypeScript, and React Flow**
