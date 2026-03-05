import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../store/useStore';

const EXAMPLE_QUERIES = [
    'Which files handle authentication?',
    'What are the most critical files in this codebase?',
    'Show me files with database connections',
    'Which files have the most dependencies?',
    'What does the main entry point do?',
    'Find files related to API endpoints',
];

// Simple markdown renderer for AI responses
function MarkdownRenderer({ text }) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeLines = [];

    const renderInline = (line, key) => {
        const parts = [];
        let remaining = line;
        let i = 0;
        while (remaining.length > 0) {
            const codeMatch = remaining.match(/`([^`]+)`/);
            const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
            let firstMatch = null;
            let matchType = null;

            if (codeMatch && (!boldMatch || codeMatch.index <= boldMatch.index)) {
                firstMatch = codeMatch;
                matchType = 'code';
            } else if (boldMatch) {
                firstMatch = boldMatch;
                matchType = 'bold';
            }

            if (!firstMatch) {
                if (remaining) parts.push(<span key={`${key}-${i++}`}>{remaining}</span>);
                break;
            }
            if (firstMatch.index > 0) {
                parts.push(<span key={`${key}-${i++}`}>{remaining.substring(0, firstMatch.index)}</span>);
            }
            if (matchType === 'code') {
                parts.push(
                    <code key={`${key}-${i++}`} style={{
                        background: 'rgba(0, 240, 255, 0.08)',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: 'var(--neon-cyan)',
                    }}>{firstMatch[1]}</code>
                );
            } else {
                parts.push(<strong key={`${key}-${i++}`} style={{ color: 'var(--text-primary)' }}>{firstMatch[1]}</strong>);
            }
            remaining = remaining.substring(firstMatch.index + firstMatch[0].length);
        }
        return parts.length > 0 ? parts : line;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('```')) {
            if (inCodeBlock) {
                elements.push(
                    <pre key={`code-${i}`} style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '0.7rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: 'var(--text-secondary)',
                        overflowX: 'auto',
                        margin: '6px 0',
                        lineHeight: 1.5,
                    }}>{codeLines.join('\n')}</pre>
                );
                codeLines = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) { codeLines.push(line); continue; }

        if (line.startsWith('### ')) {
            elements.push(<h5 key={i} style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.8rem', margin: '10px 0 4px' }}>{line.slice(4)}</h5>);
        } else if (line.startsWith('## ')) {
            elements.push(<h4 key={i} style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.85rem', margin: '12px 0 4px' }}>{line.slice(3)}</h4>);
        } else if (line.startsWith('# ')) {
            elements.push(<h3 key={i} style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.95rem', margin: '12px 0 6px' }}>{line.slice(2)}</h3>);
        } else if (line.match(/^\s*[-*]\s/)) {
            const content = line.replace(/^\s*[-*]\s/, '');
            elements.push(
                <div key={i} style={{ display: 'flex', gap: '6px', marginLeft: '4px', marginTop: '2px' }}>
                    <span style={{ color: 'var(--neon-cyan)', flexShrink: 0 }}>•</span>
                    <span>{renderInline(content, i)}</span>
                </div>
            );
        } else if (line.match(/^\s*\d+\.\s/)) {
            const num = line.match(/^\s*(\d+)\.\s/)[1];
            const content = line.replace(/^\s*\d+\.\s/, '');
            elements.push(
                <div key={i} style={{ display: 'flex', gap: '6px', marginLeft: '4px', marginTop: '2px' }}>
                    <span style={{ color: 'var(--neon-purple)', flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem' }}>{num}.</span>
                    <span>{renderInline(content, i)}</span>
                </div>
            );
        } else if (line.trim() === '') {
            elements.push(<div key={i} style={{ height: '6px' }} />);
        } else {
            elements.push(<p key={i} style={{ margin: '2px 0' }}>{renderInline(line, i)}</p>);
        }
    }

    return <div style={{ fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{elements}</div>;
}

export default function QueryPanel({ onQuery, onOpenFile }) {
    const { queryResult, queryHistory, isLoading, loadingMessage, currentQuery, setCurrentQuery, addQueryToHistory } = useStore();
    const [localQuery, setLocalQuery] = useState('');
    const [copied, setCopied] = useState(false);
    const [queryStartTime, setQueryStartTime] = useState(null);
    const [lastResponseTime, setLastResponseTime] = useState(null);
    const inputRef = useRef(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        const q = localQuery.trim();
        if (!q) return;
        setCurrentQuery(q);
        setQueryStartTime(Date.now());
        setLastResponseTime(null);
        onQuery(q);
        addQueryToHistory(q, null);
        setLocalQuery('');
    };

    const handleExampleClick = (example) => {
        setLocalQuery(example);
        inputRef.current?.focus();
    };

    const handleCopy = () => {
        if (queryResult?.answer) {
            navigator.clipboard.writeText(queryResult.answer).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    };

    // Calculate response time when result arrives
    React.useEffect(() => {
        if (queryResult && queryStartTime && !lastResponseTime) {
            setLastResponseTime(((Date.now() - queryStartTime) / 1000).toFixed(1));
        }
    }, [queryResult]);

    return (
        <div className="h-full flex flex-col gap-4 max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-lg font-bold text-gradient mb-1">Ask About Your Codebase</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Powered by Amazon Bedrock AI • Natural language queries
                </p>
            </div>

            {/* Query input */}
            <form onSubmit={handleSubmit} className="relative">
                <div className="glass-card p-1" style={{ borderColor: 'rgba(0, 240, 255, 0.15)' }}>
                    <div className="flex items-center gap-2">
                        <textarea
                            ref={inputRef}
                            value={localQuery}
                            onChange={(e) => setLocalQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                            placeholder="Ask anything about your codebase..."
                            className="input-glass flex-1 resize-none border-none bg-transparent"
                            rows={2}
                            style={{ background: 'transparent' }}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !localQuery.trim()}
                            className={`btn-neon px-4 py-3 self-end flex-shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed ${isLoading ? 'btn-loading' : ''}`}
                        >
                            {isLoading ? <span className="btn-spinner" /> : null}
                            {isLoading ? 'Asking...' : 'Ask'}
                        </button>
                    </div>
                </div>
            </form>

            {/* Example queries */}
            {!queryResult && queryHistory.length === 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Try these examples:</p>
                    <div className="flex flex-wrap gap-2">
                        {EXAMPLE_QUERIES.map((q, i) => (
                            <button
                                key={i}
                                onClick={() => handleExampleClick(q)}
                                className="text-xs px-3 py-1.5 rounded-full transition-all hover:scale-105"
                                style={{
                                    background: 'rgba(0, 240, 255, 0.06)',
                                    border: '1px solid rgba(0, 240, 255, 0.15)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Loading state */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="glass-card p-4"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                                style={{ borderColor: 'var(--neon-cyan)', borderTopColor: 'transparent' }} />
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--neon-cyan)' }}>
                                    {loadingMessage || 'Analyzing your codebase...'}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    This may take a moment for large codebases
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Query result */}
            <AnimatePresence>
                {queryResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="glass-card p-4"
                    >
                        {/* Top bar: confidence + copy + timing */}
                        <div className="flex items-center gap-2 mb-3">
                            {queryResult.confidence !== undefined && (
                                <span className="text-xs px-2 py-0.5 rounded-full"
                                    style={{
                                        background: queryResult.confidence > 0.7
                                            ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                        color: queryResult.confidence > 0.7
                                            ? 'var(--risk-low)' : 'var(--risk-medium)',
                                        border: `1px solid ${queryResult.confidence > 0.7 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                                    }}>
                                    {(queryResult.confidence * 100).toFixed(0)}% confidence
                                </span>
                            )}
                            <div className="flex-1" />
                            {lastResponseTime && (
                                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                                    {lastResponseTime}s
                                </span>
                            )}
                            <button
                                onClick={handleCopy}
                                className="text-xs px-2.5 py-1 rounded-md transition-all"
                                style={{
                                    background: copied ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0, 240, 255, 0.08)',
                                    border: `1px solid ${copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(0, 240, 255, 0.15)'}`,
                                    color: copied ? 'var(--neon-green)' : 'var(--neon-cyan)',
                                }}
                            >
                                {copied ? '✓ Copied' : '⧉ Copy'}
                            </button>
                        </div>

                        {/* Answer with markdown */}
                        <MarkdownRenderer text={queryResult.answer} />

                        {/* File references */}
                        {queryResult.references && queryResult.references.length > 0 && (
                            <div className="mb-4 mt-4">
                                <h5 className="text-xs font-semibold mb-2 uppercase tracking-widest"
                                    style={{ color: 'var(--text-muted)' }}>
                                    Referenced Files
                                </h5>
                                <div className="space-y-1.5">
                                    {queryResult.references.map((ref, i) => (
                                        <div key={i}
                                            className={`glass-card-sm p-2 flex items-center gap-2 transition-all ${ref.unresolved ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-opacity-50'}`}
                                            onClick={() => !ref.unresolved && onOpenFile(ref.path)}
                                            title={ref.unresolved ? 'This file reference could not be resolved in the workspace' : `Open ${ref.path}`}
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: ref.unresolved ? 'var(--text-muted)' : 'var(--neon-cyan)' }} />
                                            <span className="text-xs font-mono flex-1 truncate" style={{
                                                color: ref.unresolved ? 'var(--text-muted)' : 'var(--text-primary)',
                                                textDecoration: ref.unresolved ? 'line-through' : 'none',
                                            }}>
                                                {ref.path}
                                            </span>
                                            {ref.unresolved && (
                                                <span className="text-xs" style={{ color: 'var(--risk-medium)', fontSize: '0.65rem' }}>
                                                    not found
                                                </span>
                                            )}
                                            {!ref.unresolved && ref.snippet && (
                                                <span className="text-xs truncate" style={{ color: 'var(--text-muted)', maxWidth: '180px' }}>
                                                    {ref.snippet}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggested follow-ups */}
                        {queryResult.suggestedQuestions && queryResult.suggestedQuestions.length > 0 && (
                            <div>
                                <h5 className="text-xs font-semibold mb-2 uppercase tracking-widest"
                                    style={{ color: 'var(--text-muted)' }}>
                                    Follow-up Questions
                                </h5>
                                <div className="flex flex-wrap gap-1.5">
                                    {queryResult.suggestedQuestions.map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleExampleClick(q)}
                                            className="text-xs px-2.5 py-1 rounded-full transition-all"
                                            style={{
                                                background: 'rgba(168, 85, 247, 0.08)',
                                                border: '1px solid rgba(168, 85, 247, 0.2)',
                                                color: 'var(--neon-purple)',
                                            }}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Query history */}
            {queryHistory.length > 0 && !isLoading && (
                <div>
                    <h4 className="text-xs font-semibold mb-2 uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}>
                        Recent Queries
                    </h4>
                    <div className="space-y-1.5">
                        {queryHistory.slice(0, 10).map((item, i) => (
                            <div key={i}
                                className="glass-card-sm p-2 cursor-pointer hover:border-opacity-50 transition-all"
                                onClick={() => handleExampleClick(item.query)}
                            >
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {item.query}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
