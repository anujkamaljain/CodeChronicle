import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Acquire VS Code API
const vscode = acquireVsCodeApi();

const root = createRoot(document.getElementById('root'));
root.render(<App vscode={vscode} />);
